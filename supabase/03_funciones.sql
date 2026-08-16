-- =====================================================================
--  BARBERÍA · Funciones RPC (la "API" pública)
--  Ejecutar DESPUÉS de 02_rls.sql
--
--  El público NO escribe en las tablas. Solo puede llamar a estas 4
--  funciones, que corren en el servidor y validan todo:
--
--    slots_disponibles(barbero, servicio, fecha)  -> horarios libres
--    dias_disponibles(barbero, servicio, desde)   -> tira de días
--    crear_turno(...)                             -> reserva
--    cancelar_turno(codigo, telefono)             -> cancela
--
--  Nada de esto devuelve datos de otros clientes.
-- =====================================================================

-- Lee un valor de la tabla config con default
create or replace function public.cfg(p_clave text, p_default text default null)
returns text
language sql stable
security definer set search_path = public, pg_temp
as $$
  select coalesce((select valor from public.config where clave = p_clave), p_default);
$$;

-- ---------------------------------------------------------------------
-- SLOTS DISPONIBLES de un barbero para un servicio en una fecha
-- ---------------------------------------------------------------------
create or replace function public.slots_disponibles(
  p_barbero  uuid,
  p_servicio uuid,
  p_fecha    date
)
returns table (inicio timestamptz)
language plpgsql stable
security definer set search_path = public, pg_temp
as $$
declare
  v_tz       text := public.cfg('zona_horaria', 'America/Argentina/Buenos_Aires');
  v_paso     int  := coalesce(nullif(public.cfg('paso_min'), '')::int, 30);
  v_ant_hs   numeric := coalesce(nullif(public.cfg('anticipacion_min_horas'), '')::numeric, 2);
  v_max_dias int  := coalesce(nullif(public.cfg('dias_max'), '')::int, 30);
  v_dur      int;
  v_hoy      date := (now() at time zone v_tz)::date;
begin
  -- Fecha fuera de la ventana permitida -> sin resultados
  if p_fecha is null or p_barbero is null or p_servicio is null then return; end if;
  if p_fecha < v_hoy or p_fecha > v_hoy + v_max_dias then return; end if;

  -- Duración real (la del barbero si la tiene, si no la del servicio)
  select coalesce(bs.duracion_min, s.duracion_min)
    into v_dur
  from public.barbero_servicios bs
  join public.servicios s on s.id = bs.servicio_id
  join public.barberos  b on b.id = bs.barbero_id
  where bs.barbero_id = p_barbero
    and bs.servicio_id = p_servicio
    and s.activo and b.activo;

  -- Ese barbero no hace ese servicio (o está inactivo) -> sin resultados
  if v_dur is null then return; end if;

  return query
  with franjas as (
    select h.hora_inicio, h.hora_fin
    from public.horarios h
    where h.barbero_id = p_barbero
      and h.activo
      and h.dia_semana = extract(dow from p_fecha)::smallint
  ),
  candidatos as (
    select g as ini
    from franjas f
    cross join lateral generate_series(
      ((p_fecha + f.hora_inicio) at time zone v_tz),
      ((p_fecha + f.hora_fin)    at time zone v_tz) - make_interval(mins => v_dur),
      make_interval(mins => v_paso)
    ) g
  )
  select c.ini
  from candidatos c
  where c.ini >= now() + make_interval(secs => (v_ant_hs * 3600)::int)
    -- No pisa un turno existente
    and not exists (
      select 1 from public.turnos t
      where t.barbero_id = p_barbero
        and t.estado <> 'cancelado'
        and tstzrange(t.inicio, t.fin) && tstzrange(c.ini, c.ini + make_interval(mins => v_dur))
    )
    -- No cae dentro de un bloqueo (propio o de todo el local)
    and not exists (
      select 1 from public.bloqueos bl
      where (bl.barbero_id = p_barbero or bl.barbero_id is null)
        and tstzrange(bl.inicio, bl.fin) && tstzrange(c.ini, c.ini + make_interval(mins => v_dur))
    )
  group by c.ini
  order by c.ini;
end;
$$;

-- ---------------------------------------------------------------------
-- DÍAS DISPONIBLES: para pintar la tira de "próximos 14 días"
-- ---------------------------------------------------------------------
create or replace function public.dias_disponibles(
  p_barbero  uuid,
  p_servicio uuid,
  p_desde    date default null,
  p_dias     int  default 14
)
returns table (fecha date, cupos int)
language plpgsql stable
security definer set search_path = public, pg_temp
as $$
declare
  v_tz    text := public.cfg('zona_horaria', 'America/Argentina/Buenos_Aires');
  v_desde date := coalesce(p_desde, (now() at time zone v_tz)::date);
begin
  p_dias := least(greatest(coalesce(p_dias, 14), 1), 31);   -- techo duro
  return query
  select d::date,
         (select count(*)::int from public.slots_disponibles(p_barbero, p_servicio, d::date))
  from generate_series(v_desde, v_desde + (p_dias - 1), interval '1 day') d
  order by 1;
end;
$$;

-- ---------------------------------------------------------------------
-- CREAR TURNO · única puerta de entrada pública para escribir
-- ---------------------------------------------------------------------
create or replace function public.crear_turno(
  p_barbero   uuid,
  p_servicio  uuid,
  p_inicio    timestamptz,
  p_nombre    text,
  p_telefono  text,
  p_email     text default null,
  p_notas     text default null,
  p_trampa    text default null      -- honeypot: los bots lo completan
)
returns json
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_tz        text := public.cfg('zona_horaria', 'America/Argentina/Buenos_Aires');
  v_max_hora  int  := coalesce(nullif(public.cfg('max_reservas_hora'), '')::int, 4);
  v_max_act   int  := coalesce(nullif(public.cfg('max_turnos_activos'), '')::int, 3);
  v_dur       int;
  v_precio    numeric(12,2);
  v_codigo    text;
  v_n         int;
  v_id        uuid;
  v_barbero   text;
  v_servicio  text;
begin
  -- 1) Honeypot: campo invisible que solo completa un bot
  if coalesce(btrim(p_trampa), '') <> '' then
    raise exception 'Solicitud inválida.' using errcode = 'P0001';
  end if;

  -- 2) Normalizar y validar los datos del cliente
  p_nombre   := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  p_telefono := regexp_replace(coalesce(p_telefono, ''), '[^0-9+]', '', 'g');
  p_email    := lower(btrim(coalesce(p_email, '')));
  p_notas    := left(btrim(coalesce(p_notas, '')), 300);

  if length(p_nombre) < 3 or length(p_nombre) > 60 then
    raise exception 'Ingresá tu nombre y apellido.' using errcode = 'P0001';
  end if;
  if length(p_telefono) < 8 or length(p_telefono) > 20 then
    raise exception 'El teléfono no parece válido.' using errcode = 'P0001';
  end if;
  if p_email <> '' and p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-zA-Z]{2,}$' then
    raise exception 'El email no parece válido.' using errcode = 'P0001';
  end if;

  -- 3) Anti-abuso: cuántas reservas hizo este teléfono últimamente
  delete from public.intentos_reserva where creado_en < now() - interval '2 days';

  select count(*) into v_n
  from public.intentos_reserva
  where clave = p_telefono and creado_en > now() - interval '1 hour';
  if v_n >= v_max_hora then
    raise exception 'Demasiados intentos. Probá de nuevo en un rato o escribinos por WhatsApp.'
      using errcode = 'P0001';
  end if;

  select count(*) into v_n
  from public.turnos
  where cliente_telefono = p_telefono
    and estado = 'confirmado'
    and inicio > now();
  if v_n >= v_max_act then
    raise exception 'Ya tenés % turnos reservados. Cancelá uno antes de sacar otro.', v_n
      using errcode = 'P0001';
  end if;

  insert into public.intentos_reserva (clave) values (p_telefono);

  -- 4) Precio y duración REALES los pone el servidor, no el navegador
  select coalesce(bs.duracion_min, s.duracion_min),
         coalesce(bs.precio,       s.precio),
         b.nombre, s.nombre
    into v_dur, v_precio, v_barbero, v_servicio
  from public.barbero_servicios bs
  join public.servicios s on s.id = bs.servicio_id
  join public.barberos  b on b.id = bs.barbero_id
  where bs.barbero_id = p_barbero
    and bs.servicio_id = p_servicio
    and s.activo and b.activo;

  if v_dur is null then
    raise exception 'Ese barbero no ofrece ese servicio.' using errcode = 'P0001';
  end if;

  -- 5) El horario pedido tiene que estar en la lista de libres.
  --    Una sola fuente de verdad: lo que ve el cliente es lo que se valida.
  if not exists (
    select 1 from public.slots_disponibles(p_barbero, p_servicio, (p_inicio at time zone v_tz)::date) s
    where s.inicio = p_inicio
  ) then
    raise exception 'Ese horario ya no está disponible. Elegí otro.' using errcode = 'P0001';
  end if;

  -- 6) Código de cancelación (aleatorio, no adivinable)
  v_codigo := upper(encode(gen_random_bytes(4), 'hex'));

  begin
    insert into public.turnos (
      barbero_id, servicio_id, inicio, fin, duracion_min, precio,
      cliente_nombre, cliente_telefono, cliente_email, notas, codigo, origen
    ) values (
      p_barbero, p_servicio, p_inicio, p_inicio + make_interval(mins => v_dur), v_dur, v_precio,
      p_nombre, p_telefono, nullif(p_email, ''), nullif(p_notas, ''), v_codigo, 'web'
    ) returning id into v_id;
  exception
    when exclusion_violation or unique_violation then
      -- Alguien reservó ese mismo hueco en el mismo instante
      raise exception 'Ese horario acaba de ser ocupado. Elegí otro.' using errcode = 'P0001';
  end;

  return json_build_object(
    'ok', true,
    'id', v_id,
    'codigo', v_codigo,
    'barbero', v_barbero,
    'servicio', v_servicio,
    'precio', v_precio,
    'inicio', p_inicio,
    'duracion_min', v_dur
  );
end;
$$;

-- ---------------------------------------------------------------------
-- CANCELAR TURNO con el código + el teléfono (doble comprobación)
-- ---------------------------------------------------------------------
create or replace function public.cancelar_turno(
  p_codigo   text,
  p_telefono text
)
returns json
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_horas int := coalesce(nullif(public.cfg('cancelacion_min_horas'), '')::int, 2);
  v_t     public.turnos%rowtype;
begin
  p_codigo   := upper(btrim(coalesce(p_codigo, '')));
  p_telefono := regexp_replace(coalesce(p_telefono, ''), '[^0-9+]', '', 'g');

  select * into v_t
  from public.turnos
  where codigo = p_codigo and cliente_telefono = p_telefono;

  if not found then
    raise exception 'No encontramos ese turno. Revisá el código y el teléfono.' using errcode = 'P0001';
  end if;
  if v_t.estado = 'cancelado' then
    return json_build_object('ok', true, 'mensaje', 'Ese turno ya estaba cancelado.');
  end if;
  if v_t.inicio < now() + make_interval(hours => v_horas) then
    raise exception 'Faltan menos de % h para el turno. Avisanos por WhatsApp.', v_horas
      using errcode = 'P0001';
  end if;

  update public.turnos set estado = 'cancelado' where id = v_t.id;
  return json_build_object('ok', true, 'mensaje', 'Turno cancelado.');
end;
$$;

-- ---------------------------------------------------------------------
-- ESTADÍSTICAS para el panel (solo usuarios logueados)
-- Un barbero solo puede pedir las suyas.
-- ---------------------------------------------------------------------
create or replace function public.estadisticas(
  p_desde date,
  p_hasta date
)
returns table (
  barbero_id uuid,
  barbero    text,
  turnos     int,
  atendidos  int,
  cancelados int,
  ingresos   numeric
)
language plpgsql stable
security definer set search_path = public, pg_temp
as $$
declare
  v_tz  text := public.cfg('zona_horaria', 'America/Argentina/Buenos_Aires');
  v_mio uuid := public.mi_barbero_id();
begin
  if auth.uid() is null then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  return query
  select b.id, b.nombre,
         count(*) filter (where t.estado <> 'cancelado')::int,
         count(*) filter (where t.estado = 'atendido')::int,
         count(*) filter (where t.estado = 'cancelado')::int,
         coalesce(sum(t.precio) filter (where t.estado = 'atendido'), 0)::numeric
  from public.barberos b
  left join public.turnos t
    on t.barbero_id = b.id
   and (t.inicio at time zone v_tz)::date between p_desde and p_hasta
  where public.es_admin() or b.id = v_mio
  group by b.id, b.nombre
  order by 6 desc, 2;
end;
$$;

-- =====================================================================
-- PERMISOS DE EJECUCIÓN
-- Por defecto Postgres deja ejecutar cualquier función a todo el mundo.
-- Acá cerramos todo y abrimos solo lo necesario.
-- =====================================================================
revoke all on function public.cfg(text, text)                                   from public, anon, authenticated;
revoke all on function public.slots_disponibles(uuid, uuid, date)               from public, anon, authenticated;
revoke all on function public.dias_disponibles(uuid, uuid, date, int)           from public, anon, authenticated;
revoke all on function public.crear_turno(uuid, uuid, timestamptz, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.cancelar_turno(text, text)                        from public, anon, authenticated;
revoke all on function public.estadisticas(date, date)                          from public, anon, authenticated;
revoke all on function public.es_admin()                                        from public, anon;
revoke all on function public.mi_barbero_id()                                   from public, anon;

grant execute on function public.slots_disponibles(uuid, uuid, date)     to anon, authenticated;
grant execute on function public.dias_disponibles(uuid, uuid, date, int) to anon, authenticated;
grant execute on function public.crear_turno(uuid, uuid, timestamptz, text, text, text, text, text) to anon, authenticated;
grant execute on function public.cancelar_turno(text, text)              to anon, authenticated;
grant execute on function public.estadisticas(date, date)                to authenticated;
grant execute on function public.es_admin()                              to authenticated;
grant execute on function public.mi_barbero_id()                         to authenticated;
