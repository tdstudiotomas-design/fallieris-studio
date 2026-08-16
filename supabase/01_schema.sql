-- =====================================================================
--  BARBERÍA · Esquema de base de datos (Supabase / PostgreSQL)
--  Ejecutar en: Supabase -> SQL Editor -> New query
--  Orden: 01_schema -> 02_rls -> 03_funciones -> 04_seed
-- =====================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid / gen_random_bytes
create extension if not exists "btree_gist"; -- constraint anti-superposición

-- ---------------------------------------------------------------------
-- CONFIGURACIÓN (clave/valor). NO guardar secretos acá: es de lectura pública.
-- ---------------------------------------------------------------------
create table if not exists public.config (
  clave       text primary key,
  valor       text not null,
  descripcion text
);

-- ---------------------------------------------------------------------
-- BARBEROS
-- ---------------------------------------------------------------------
create table if not exists public.barberos (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null check (length(nombre) between 2 and 60),
  apodo      text,
  bio        text,
  foto_url   text,
  instagram  text,
  activo     boolean not null default true,
  orden      int not null default 0,
  -- Vínculo con el usuario de Supabase Auth (para que entre al panel)
  user_id    uuid unique references auth.users(id) on delete set null,
  creado_en  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- SERVICIOS (catálogo general)
-- ---------------------------------------------------------------------
create table if not exists public.servicios (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null check (length(nombre) between 2 and 60),
  descripcion  text,
  duracion_min int  not null check (duracion_min between 5 and 480),
  precio       numeric(12,2) not null check (precio >= 0),
  activo       boolean not null default true,
  orden        int not null default 0
);

-- ---------------------------------------------------------------------
-- QUÉ SERVICIO HACE CADA BARBERO (con precio/duración propios opcionales)
-- ---------------------------------------------------------------------
create table if not exists public.barbero_servicios (
  barbero_id   uuid not null references public.barberos(id)  on delete cascade,
  servicio_id  uuid not null references public.servicios(id) on delete cascade,
  precio       numeric(12,2) check (precio >= 0),
  duracion_min int check (duracion_min between 5 and 480),
  primary key (barbero_id, servicio_id)
);

-- ---------------------------------------------------------------------
-- AGENDA SEMANAL DE CADA BARBERO
-- dia_semana: 0=domingo, 1=lunes ... 6=sábado (igual que extract(dow))
-- Se pueden cargar varias franjas por día (ej: 10-13 y 15-20)
-- ---------------------------------------------------------------------
create table if not exists public.horarios (
  id          uuid primary key default gen_random_uuid(),
  barbero_id  uuid not null references public.barberos(id) on delete cascade,
  dia_semana  smallint not null check (dia_semana between 0 and 6),
  hora_inicio time not null,
  hora_fin    time not null,
  activo      boolean not null default true,
  constraint horario_valido check (hora_fin > hora_inicio)
);
create index if not exists horarios_barbero_dia_idx on public.horarios (barbero_id, dia_semana);

-- ---------------------------------------------------------------------
-- CLIENTES HABITUALES ("VIP"): el que viene siempre el mismo día y hora.
-- Esto NO reserva nada solo. Es el patrón que usa el panel para avisar
-- "a fulano le toca esta semana" y que un workflow externo (n8n) puede
-- leer para mandarle un WhatsApp de confirmación unos días antes.
-- La reserva real sigue pasando siempre por crear_turno().
-- ---------------------------------------------------------------------
create table if not exists public.clientes_habituales (
  id               uuid primary key default gen_random_uuid(),
  barbero_id       uuid not null references public.barberos(id)  on delete cascade,
  servicio_id      uuid not null references public.servicios(id) on delete cascade,
  cliente_nombre   text not null check (length(cliente_nombre) between 2 and 60),
  cliente_telefono text not null,
  dia_semana       smallint not null check (dia_semana between 0 and 6),
  hora             time not null,
  activo           boolean not null default true,
  -- Para pausar sin borrar el patrón (vacaciones del cliente, etc.)
  pausado_hasta    date,
  notas            text,
  creado_en        timestamptz not null default now()
);
create index if not exists clientes_habituales_barbero_idx on public.clientes_habituales (barbero_id, dia_semana);
create index if not exists clientes_habituales_tel_idx     on public.clientes_habituales (cliente_telefono);

-- ---------------------------------------------------------------------
-- BLOQUEOS: vacaciones, francos, feriados, cortes de luz, etc.
-- barbero_id NULL = bloquea a TODO el local
-- ---------------------------------------------------------------------
create table if not exists public.bloqueos (
  id         uuid primary key default gen_random_uuid(),
  barbero_id uuid references public.barberos(id) on delete cascade,
  inicio     timestamptz not null,
  fin        timestamptz not null,
  motivo     text,
  creado_en  timestamptz not null default now(),
  constraint bloqueo_valido check (fin > inicio)
);
create index if not exists bloqueos_rango_idx on public.bloqueos using gist (tstzrange(inicio, fin));

-- ---------------------------------------------------------------------
-- TURNOS
-- ---------------------------------------------------------------------
create table if not exists public.turnos (
  id               uuid primary key default gen_random_uuid(),
  barbero_id       uuid not null references public.barberos(id)  on delete restrict,
  servicio_id      uuid not null references public.servicios(id) on delete restrict,
  inicio           timestamptz not null,
  fin              timestamptz not null,
  duracion_min     int not null,
  precio           numeric(12,2) not null default 0,
  -- Datos del cliente (NUNCA se exponen al público, ver 02_rls.sql)
  cliente_nombre   text not null,
  cliente_telefono text not null,
  cliente_email    text,
  notas            text,
  estado           text not null default 'confirmado'
                   check (estado in ('confirmado','atendido','cancelado','ausente')),
  -- Código que se le da al cliente para que pueda cancelar sin loguearse
  codigo           text not null unique,
  origen           text not null default 'web' check (origen in ('web','panel')),
  cobrado          boolean not null default false,
  creado_en        timestamptz not null default now(),
  constraint turno_valido check (fin > inicio),
  -- Dos turnos del mismo barbero NO pueden pisarse. Lo garantiza la base,
  -- no el JavaScript: aunque dos personas reserven en el mismo milisegundo.
  constraint turnos_sin_superposicion
    exclude using gist (
      barbero_id with =,
      tstzrange(inicio, fin) with &&
    ) where (estado <> 'cancelado')
);
create index if not exists turnos_inicio_idx  on public.turnos (inicio);
create index if not exists turnos_barbero_idx on public.turnos (barbero_id, inicio);
create index if not exists turnos_tel_idx     on public.turnos (cliente_telefono);

-- ---------------------------------------------------------------------
-- TIENDA DE ROPA (catálogo, no e-commerce: se consulta por WhatsApp)
-- ---------------------------------------------------------------------
create table if not exists public.productos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  descripcion text,
  precio      numeric(12,2) not null default 0 check (precio >= 0),
  categoria   text,
  imagen_url  text,
  talles      text[] default '{}',
  stock       int not null default 0,
  destacado   boolean not null default false,
  activo      boolean not null default true,
  orden       int not null default 0,
  creado_en   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- PERFILES: quién puede entrar al panel y con qué permisos
-- rol 'admin'   -> ve y edita todo
-- rol 'barbero' -> ve solo su propia agenda y sus propias ganancias
-- ---------------------------------------------------------------------
create table if not exists public.perfiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  rol        text not null default 'barbero' check (rol in ('admin','barbero')),
  barbero_id uuid references public.barberos(id) on delete set null,
  creado_en  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- ANTI-ABUSO: registro de intentos de reserva para limitar frecuencia
-- ---------------------------------------------------------------------
create table if not exists public.intentos_reserva (
  id        bigserial primary key,
  clave     text not null,          -- teléfono normalizado
  creado_en timestamptz not null default now()
);
create index if not exists intentos_clave_idx on public.intentos_reserva (clave, creado_en desc);
