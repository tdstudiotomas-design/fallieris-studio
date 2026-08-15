-- =====================================================================
--  BARBERÍA · Datos de ejemplo
--  Ejecutar DESPUÉS de 03_funciones.sql. Se puede correr varias veces.
--  Cambiá nombres, precios y horarios por los reales.
-- =====================================================================

-- ---------------------------------------------------------------------
-- CONFIGURACIÓN
-- ---------------------------------------------------------------------
insert into public.config (clave, valor, descripcion) values
  ('zona_horaria',           'America/Argentina/Buenos_Aires', 'Zona horaria del local'),
  ('paso_min',               '30',  'Cada cuántos minutos arranca un turno'),
  ('anticipacion_min_horas', '2',   'Con cuánta anticipación mínima se puede reservar'),
  ('dias_max',               '30',  'Hasta cuántos días adelante se puede reservar'),
  ('cancelacion_min_horas',  '2',   'Hasta cuántas horas antes puede cancelar el cliente'),
  ('max_reservas_hora',      '4',   'Reservas máximas por teléfono por hora (anti-spam)'),
  ('max_turnos_activos',     '3',   'Turnos futuros máximos por teléfono'),
  ('nombre_local',           'FALLIERI''S STUDIO', 'Nombre del local'),
  ('whatsapp',               '5492346000000',     'COMPLETAR: WhatsApp real, sin + ni espacios'),
  ('direccion',              'Almafuerte 585, Chivilcoy (6620)', 'Dirección'),
  ('instagram',              'fallieristudio',    'Usuario de Instagram sin @'),
  ('instagram_showroom',     'fallierishowroom',  'Cuenta de la ropa'),
  ('horario_texto',          'Martes a sábado · 10–13 / 15–20', 'COMPLETAR: horario real del local')
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- BARBEROS (5)
-- Los usuarios de Instagram salen de la bio de @fallieristudio.
-- ⚠️ COMPLETAR: confirmar nombres reales y qué hace cada uno.
-- ---------------------------------------------------------------------
insert into public.barberos (id, nombre, apodo, bio, instagram, orden) values
  ('11111111-1111-4111-8111-000000000001','Valentín Fallieri','Valen','Fades, color y diseño.',            'valentin_fallieri', 1),
  ('11111111-1111-4111-8111-000000000002','Ina Fallieri',     'Ina',  'Color y estilismo.',                'inafallieri1',      2),
  ('11111111-1111-4111-8111-000000000003','Ale Fusto',        'Ale',  'Corte clásico y barba con navaja.', 'aleefusto5',        3),
  ('11111111-1111-4111-8111-000000000004','Dami Trusso',      'Dami', 'Freestyle y diseños a mano alzada.','damitrusso',        4),
  ('11111111-1111-4111-8111-000000000005','Luki',             'Luki', 'Corte prolijo sin vueltas.',        'lukitaaaa.7',       5)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- SERVICIOS
-- ---------------------------------------------------------------------
insert into public.servicios (id, nombre, descripcion, duracion_min, precio, orden) values
  ('55555555-5555-4555-8555-000000000001','Corte',            'Corte a máquina y tijera, lavado y peinado.',      30, 16000, 1),
  ('55555555-5555-4555-8555-000000000002','Corte y barba',    'El combo completo. Perfilado con navaja.',          60, 18000, 2),
  ('55555555-5555-4555-8555-000000000003','Barba',            'Perfilado, navaja y toalla caliente.',              30, 9000,  3),
  ('55555555-5555-4555-8555-000000000004','Corte niño',       'Hasta 12 años. Paciencia incluida.',                30, 12000, 4),
  ('55555555-5555-4555-8555-000000000005','Diseño / freestyle','Líneas y dibujos a mano alzada sobre el corte.',   45, 20000, 5),
  ('55555555-5555-4555-8555-000000000006','Color / decoloración','Platinado, mechas o color completo.',           90, 35000, 6)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- QUÉ HACE CADA UNO
-- ---------------------------------------------------------------------
-- Todos hacen corte, corte y barba, barba y corte de niño
insert into public.barbero_servicios (barbero_id, servicio_id)
select b.id, s.id
from public.barberos b
cross join public.servicios s
where s.id in (
  '55555555-5555-4555-8555-000000000001',
  '55555555-5555-4555-8555-000000000002',
  '55555555-5555-4555-8555-000000000003',
  '55555555-5555-4555-8555-000000000004'
)
on conflict do nothing;

-- Diseño / freestyle: Valentín y Dami
insert into public.barbero_servicios (barbero_id, servicio_id) values
  ('11111111-1111-4111-8111-000000000001','55555555-5555-4555-8555-000000000005'),
  ('11111111-1111-4111-8111-000000000004','55555555-5555-4555-8555-000000000005')
on conflict do nothing;

-- Color: Valentín e Ina. Ina lo cobra distinto (ejemplo de precio propio).
insert into public.barbero_servicios (barbero_id, servicio_id, precio) values
  ('11111111-1111-4111-8111-000000000001','55555555-5555-4555-8555-000000000006', null),
  ('11111111-1111-4111-8111-000000000002','55555555-5555-4555-8555-000000000006', 38000)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- AGENDA SEMANAL: martes a sábado, 10–13 y 15–20
-- (0=domingo ... 6=sábado)
-- ---------------------------------------------------------------------
insert into public.horarios (barbero_id, dia_semana, hora_inicio, hora_fin)
select b.id, d, f.ini, f.fin
from public.barberos b
cross join generate_series(2, 6) d
cross join (values (time '10:00', time '13:00'), (time '15:00', time '20:00')) as f(ini, fin)
where not exists (
  select 1 from public.horarios h
  where h.barbero_id = b.id and h.dia_semana = d and h.hora_inicio = f.ini
);

-- Ejemplo de agenda propia: Luki no trabaja los martes -> se borra esa franja
delete from public.horarios
where barbero_id = '11111111-1111-4111-8111-000000000005' and dia_semana = 2;

-- ---------------------------------------------------------------------
-- SHOWROOM (ropa) · lo que se vende en el local, @fallierishowroom
-- ---------------------------------------------------------------------
insert into public.productos (id, nombre, descripcion, precio, categoria, talles, stock, destacado, orden) values
  ('99999999-9999-4999-8999-000000000001','Buzo oversize Fallieri''s','Frisa pesada 400gr, print serigrafiado a mano.', 62000,'Buzos', '{S,M,L,XL}', 12, true, 1),
  ('99999999-9999-4999-8999-000000000002','Remera boxy negra',    'Algodón peinado 24/1, corte ancho.',              32000,'Remeras','{S,M,L,XL}', 20, true, 2),
  ('99999999-9999-4999-8999-000000000003','Gorra trucker',        'Bordado frontal, cierre snapback.',              28000,'Gorras', '{Único}',    15, false,3),
  ('99999999-9999-4999-8999-000000000004','Campera rompeviento',  'Nylon con forro, logo bordado en el pecho.',      89000,'Camperas','{M,L,XL}',   6, true, 4),
  ('99999999-9999-4999-8999-000000000005','Pantalón cargo',       'Gabardina con bolsillos laterales.',             58000,'Pantalones','{38,40,42,44}', 9, false,5),
  ('99999999-9999-4999-8999-000000000006','Kit barba',            'Aceite + bálsamo + peine de madera.',            24000,'Cuidado','{Único}',    25, false,6)
on conflict (id) do nothing;

-- =====================================================================
--  ACCESOS AL PANEL
--  1) Supabase -> Authentication -> Users -> "Add user" (con email y contraseña).
--  2) Copiá el UUID del usuario creado y corré UNO de estos:
--
--  -- El jefe (ve todo):
--  insert into public.perfiles (user_id, rol) values ('UUID-DEL-USUARIO','admin')
--  on conflict (user_id) do update set rol = 'admin', barbero_id = null;
--
--  -- Un barbero (ve solo lo suyo):
--  insert into public.perfiles (user_id, rol, barbero_id)
--  values ('UUID-DEL-USUARIO','barbero','11111111-1111-4111-8111-000000000001')
--  on conflict (user_id) do update set rol = 'barbero', barbero_id = excluded.barbero_id;
--  update public.barberos set user_id = 'UUID-DEL-USUARIO'
--  where id = '11111111-1111-4111-8111-000000000001';
-- =====================================================================
