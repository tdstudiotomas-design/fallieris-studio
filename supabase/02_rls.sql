-- =====================================================================
--  BARBERÍA · Seguridad: RLS + permisos por columna
--  Ejecutar DESPUÉS de 01_schema.sql
--
--  IDEA CENTRAL
--  ------------
--  La "anon key" que va en el JavaScript es pública por diseño: cualquiera
--  puede leerla desde el navegador. Por eso la seguridad NO puede estar en
--  esconderla, sino en que esa clave tenga permisos mínimos:
--
--    * El visitante anónimo SOLO PUEDE LEER lo que es público
--      (barberos activos, servicios, horarios, productos).
--    * El visitante anónimo NO PUEDE leer ni escribir turnos: ni ver los
--      datos de otros clientes, ni insertar un turno a mano.
--    * Para reservar existe UNA sola puerta: la función crear_turno(),
--      que valida todo del lado del servidor (ver 03_funciones.sql).
--    * El panel exige login real (Supabase Auth). Un barbero solo ve lo suyo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers de rol (SECURITY DEFINER para no chocar con el RLS de perfiles)
-- ---------------------------------------------------------------------
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.perfiles p
    where p.user_id = auth.uid() and p.rol = 'admin'
  );
$$;

create or replace function public.mi_barbero_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.barbero_id from public.perfiles p where p.user_id = auth.uid();
$$;

-- =====================================================================
-- 1) Activar RLS en TODAS las tablas
-- =====================================================================
alter table public.config            enable row level security;
alter table public.barberos          enable row level security;
alter table public.servicios         enable row level security;
alter table public.barbero_servicios enable row level security;
alter table public.horarios          enable row level security;
alter table public.bloqueos          enable row level security;
alter table public.turnos            enable row level security;
alter table public.productos         enable row level security;
alter table public.perfiles          enable row level security;
alter table public.intentos_reserva  enable row level security;

-- Nadie llega a intentos_reserva salvo las funciones internas.
-- (RLS activado y sin ninguna policy = acceso denegado a todos.)

-- =====================================================================
-- 2) Permisos base: revocar todo y dar solo lo justo
-- =====================================================================
revoke all on all tables in schema public from anon, authenticated;

-- Lectura pública (contenido de la web)
grant select on public.config            to anon, authenticated;
grant select on public.servicios         to anon, authenticated;
grant select on public.barbero_servicios to anon, authenticated;
grant select on public.horarios          to anon, authenticated;
grant select on public.productos         to anon, authenticated;

-- En barberos escondemos user_id: permiso columna por columna.
grant select (id, nombre, apodo, bio, foto_url, instagram, activo, orden)
  on public.barberos to anon, authenticated;

-- Escritura desde el panel: solo usuarios logueados, y filtrada por RLS.
grant select, insert, update, delete on
  public.barberos, public.servicios, public.barbero_servicios,
  public.horarios, public.bloqueos, public.turnos, public.productos,
  public.config
  to authenticated;
grant select on public.perfiles to authenticated;

-- turnos y bloqueos: el rol anónimo no los toca NUNCA
revoke all on public.turnos   from anon;
revoke all on public.bloqueos from anon;

-- =====================================================================
-- 3) Políticas
-- =====================================================================

-- ---------- config ----------
drop policy if exists config_lectura   on public.config;
drop policy if exists config_admin     on public.config;
create policy config_lectura on public.config
  for select to anon, authenticated using (true);
create policy config_admin on public.config
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- ---------- barberos ----------
drop policy if exists barberos_publicos on public.barberos;
drop policy if exists barberos_staff    on public.barberos;
drop policy if exists barberos_admin    on public.barberos;
-- El público solo ve los activos
create policy barberos_publicos on public.barberos
  for select to anon using (activo);
-- El staff logueado ve a todos (para asignar turnos)
create policy barberos_staff on public.barberos
  for select to authenticated using (true);
-- Solo el admin da de alta / edita / baja barberos
create policy barberos_admin on public.barberos
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- ---------- servicios ----------
drop policy if exists servicios_publicos on public.servicios;
drop policy if exists servicios_staff    on public.servicios;
drop policy if exists servicios_admin    on public.servicios;
create policy servicios_publicos on public.servicios
  for select to anon using (activo);
create policy servicios_staff on public.servicios
  for select to authenticated using (true);
create policy servicios_admin on public.servicios
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- ---------- barbero_servicios ----------
drop policy if exists bs_publico on public.barbero_servicios;
drop policy if exists bs_staff   on public.barbero_servicios;
drop policy if exists bs_admin   on public.barbero_servicios;
create policy bs_publico on public.barbero_servicios
  for select to anon using (true);
create policy bs_staff on public.barbero_servicios
  for select to authenticated using (true);
create policy bs_admin on public.barbero_servicios
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- ---------- horarios ----------
drop policy if exists horarios_publico on public.horarios;
drop policy if exists horarios_staff   on public.horarios;
drop policy if exists horarios_propio  on public.horarios;
drop policy if exists horarios_admin   on public.horarios;
create policy horarios_publico on public.horarios
  for select to anon using (activo);
create policy horarios_staff on public.horarios
  for select to authenticated using (true);
-- Cada barbero puede editar SU propia agenda
create policy horarios_propio on public.horarios
  for all to authenticated
  using (barbero_id = public.mi_barbero_id())
  with check (barbero_id = public.mi_barbero_id());
-- El jefe puede editar la de cualquiera
create policy horarios_admin on public.horarios
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- ---------- bloqueos (francos / vacaciones) ----------
drop policy if exists bloqueos_staff  on public.bloqueos;
drop policy if exists bloqueos_propio on public.bloqueos;
drop policy if exists bloqueos_admin  on public.bloqueos;
create policy bloqueos_staff on public.bloqueos
  for select to authenticated using (true);
create policy bloqueos_propio on public.bloqueos
  for all to authenticated
  using (barbero_id = public.mi_barbero_id())
  with check (barbero_id = public.mi_barbero_id());
create policy bloqueos_admin on public.bloqueos
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- ---------- turnos ----------
-- NO hay ninguna policy para 'anon': el público no lee ni escribe turnos.
drop policy if exists turnos_lectura   on public.turnos;
drop policy if exists turnos_escritura on public.turnos;
drop policy if exists turnos_admin     on public.turnos;
-- El barbero ve solo los suyos; el admin ve todos
create policy turnos_lectura on public.turnos
  for select to authenticated
  using (public.es_admin() or barbero_id = public.mi_barbero_id());
create policy turnos_escritura on public.turnos
  for all to authenticated
  using (barbero_id = public.mi_barbero_id())
  with check (barbero_id = public.mi_barbero_id());
create policy turnos_admin on public.turnos
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- ---------- productos (ropa) ----------
drop policy if exists productos_publico on public.productos;
drop policy if exists productos_staff   on public.productos;
drop policy if exists productos_admin   on public.productos;
create policy productos_publico on public.productos
  for select to anon using (activo);
create policy productos_staff on public.productos
  for select to authenticated using (true);
create policy productos_admin on public.productos
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- ---------- perfiles ----------
drop policy if exists perfiles_propio on public.perfiles;
drop policy if exists perfiles_admin  on public.perfiles;
create policy perfiles_propio on public.perfiles
  for select to authenticated using (user_id = auth.uid());
create policy perfiles_admin on public.perfiles
  for all to authenticated using (public.es_admin()) with check (public.es_admin());
