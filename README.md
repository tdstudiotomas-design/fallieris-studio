# Fallieri's Studio · Web + turnos online + panel

Web para **Fallieri's Studio** (Almafuerte 585, Chivilcoy): 5 barberos con agenda
propia, showroom de ropa (`@fallierishowroom`) y turnos online.
Tres pantallas, una sola base de datos.

**Identidad**: monocroma, fiel al logo. Negro `#0B0B0C`, blanco hueso `#F2F0EB`
y gris plata `#C9C6BF` como único acento. Títulos en serif (Instrument Serif),
textos y etiquetas en Inter. El logo está reconstruido en SVG dentro del HTML:
usa `currentColor`, así que funciona igual sobre fondo negro y sobre fondo claro,
y escala sin pixelarse. Si aparece el archivo original, se reemplaza el `<svg>`
del nav y del footer por un `<img>` y listo.

| Pantalla | Archivo | Para quién |
|---|---|---|
| Landing | `docs/index.html` | Público. Servicios, equipo, tienda, ubicación. |
| Reserva | `docs/reservar.html` | Público. 4 pasos: barbero → servicio → día y hora → datos. |
| Panel | `docs/admin.html` | Staff. Agenda, turnos, estadísticas, horarios, equipo, servicios, tienda. |

Stack: HTML estático + React 18 (UMD) + Supabase (PostgreSQL) + nginx en Easypanel.
Sin build, sin `npm install`. Se edita un archivo y se sube.

---

## 0. Probarla ya, sin Supabase (modo demo)

La app arranca en **modo demo** apenas la abrís, sin tocar nada: mientras
`docs/js/config.js` tenga los datos de ejemplo, `js/demo.js` reemplaza a
Supabase por una base falsa que vive en el `localStorage` del navegador.

Sirve para mostrarle la app a Fallieri's *antes* de pagar Supabase o un dominio:

1. Abrís `reservar.html` y sacás un turno de verdad, con tu nombre y tu celular.
2. Abrís `admin.html`, entrás con **cualquier email** y la contraseña **`demo`**,
   y ese turno está ahí, en la agenda, listo para marcar "Atendido".
3. Ya trae 30 días de turnos de ejemplo cargados, así las **Estadísticas**
   no arrancan vacías.

Abajo de todo aparece un cartel que dice "Demo" — así nadie confunde estos
datos con los reales. Para vaciar la demo y arrancar de cero: abrir la consola
del navegador (F12) y escribir `reiniciarDemo()`.

En el momento en que pongas la `SUPABASE_URL` y la `SUPABASE_ANON_KEY` reales
en `config.js`, el modo demo se apaga solo y la app pasa a usar la base de
datos real. No hay que borrar `js/demo.js` ni tocar nada más.

> Antes de mostrarla al cliente: cambiá el email/teléfono/nombre de prueba que
> uses, y contale que lo que ve en el panel son datos de mentira, no clientes
> reales.

---

## 1. Puesta en marcha (para producción)

### a) Base de datos

En Supabase → **SQL Editor**, correr **en este orden**:

1. `supabase/01_schema.sql` — tablas
2. `supabase/02_rls.sql` — seguridad
3. `supabase/03_funciones.sql` — funciones de reserva
4. `supabase/04_seed.sql` — datos de ejemplo (cambiar por los reales)

### b) Conectar el front

En `docs/js/config.js`, reemplazar:

```js
SUPABASE_URL: 'https://TU-PROYECTO.supabase.co',
SUPABASE_ANON_KEY: 'TU-ANON-KEY',
```

Se sacan de Supabase → **Project Settings → API**. En el mismo archivo se
cambian nombre, WhatsApp, dirección, Instagram y horarios del local.

> La `anon key` es **pública**: viaja al navegador de cualquier visitante y no
> pasa nada. La `service_role key` **nunca** va acá.

### c) Crear el usuario administrador

1. Supabase → **Authentication → Users → Add user** (email + contraseña).
2. Copiar el UUID que quedó creado.
3. SQL Editor:

```sql
insert into perfiles (user_id, rol) values ('UUID-DEL-USUARIO', 'admin')
on conflict (user_id) do update set rol = 'admin';
```

Para cada barbero que quiera entrar al panel, lo mismo pero con
`rol = 'barbero'` y su `barbero_id` (las instrucciones exactas están dentro
del panel, en la pestaña **Equipo**).

### d) Deploy

**Opción rápida y gratis — GitHub Pages** (mientras no haya lugar en Easypanel):
Settings del repo → **Pages** → Source: `Deploy from a branch` → Branch: `main` /
`docs`. Queda andando en `https://tu-usuario.github.io/tu-repo/`. Sirve tal cual
está: no necesita Dockerfile ni build. Los cambios se ven un par de minutos
después de cada `git push`. Las cabeceras de seguridad de `nginx.conf` (CSP,
etc.) **no aplican acá** — no importa mientras la protección real (RLS +
RPC) siga en Postgres, ver sección 2. Antes de pasar a producción de verdad,
migrar a Easypanel o al VPS.

**Producción — Easypanel o el VPS propio (Contabo):**
App → Source: este repo → Build: **Dockerfile**.
Nada más: `Dockerfile` + `nginx.conf` ya están listos. Mismo Dockerfile sirve
para un VPS con Docker corriendo a mano (`docker build -t fallieris . && docker run -p 80:80 fallieris`).

Para probar en local sin Docker, cualquier servidor estático sobre `docs/`:

```bash
npx serve docs
```

---

## 2. Cómo está resuelta la seguridad

Esta es la parte que más pediste, así que va explicada en detalle.

### El problema real

En una web estática, **todo el JavaScript es público**. Cualquiera abre la
consola del navegador y ve la clave de Supabase. Entonces la pregunta no es
"cómo escondo la clave" (imposible), sino **qué puede hacer alguien que tiene
esa clave**. Acá: casi nada.

### Las cinco capas

**1. RLS activado en todas las tablas.**
El visitante anónimo solo puede **leer** barberos activos, servicios, horarios
y productos. Sobre la tabla `turnos` no tiene ningún permiso: no puede listar
los datos de otros clientes ni insertar un turno a mano. Si intenta un
`insert` desde la consola, Postgres lo rechaza.

**2. Una sola puerta para reservar.**
Reservar es llamar a la función `crear_turno()`, que corre **dentro de la base
de datos**. Ahí se valida:

- que el nombre, el teléfono y el email tengan forma de nombre, teléfono y email;
- que ese barbero realmente ofrezca ese servicio;
- que el horario pedido esté en la lista de horarios libres reales;
- que no sea un horario pasado ni más allá del límite de días.

**El precio y la duración los pone el servidor**, no el navegador. Aunque
alguien edite el JavaScript para mandar `precio: 1`, el turno se guarda con el
precio de la tabla.

**3. La base impide los turnos superpuestos.**
No es una validación de JavaScript: es una restricción `EXCLUDE` de PostgreSQL.
Si dos personas confirman el mismo horario en el mismo instante, la segunda
recibe "ese horario acaba de ser ocupado". No hay forma de duplicar un turno.

**4. Anti-spam.**
Un `honeypot` (campo invisible que solo completan los bots), un máximo de
4 intentos por hora por teléfono y un máximo de 3 turnos futuros activos por
teléfono. Todo configurable en la tabla `config`, sin tocar código.

**5. El panel separa por rol.**
Login real con Supabase Auth. Un barbero ve **solo sus turnos y sus números**;
el jefe ve todo. Eso lo decide Postgres con RLS, no el JavaScript: aunque un
barbero manipule la app desde el navegador, la base no le devuelve los datos de
los demás.

### Lo que queda en tus manos

- **No subir nunca la `service_role key`** al front ni al repo.
- En Supabase → Authentication → Policies, dejar activada la protección de
  contraseñas filtradas y exigir contraseñas largas al staff.
- Los datos de los clientes (nombre, teléfono, email) son datos personales:
  no compartir exportaciones por WhatsApp ni dejarlas en carpetas públicas.

---

## 3. Cómo agregar cosas

Está pensado para que crecer sea barato:

| Quiero… | Dónde se toca |
|---|---|
| Cambiar precios, servicios o duraciones | Panel → Servicios (sin tocar código) |
| Que un barbero deje de hacer un servicio | Panel → Equipo → destildar el servicio |
| Cambiar horarios o cargar vacaciones | Panel → Horarios |
| Cargar o sacar ropa de la web | Panel → Tienda |
| Cargar un cliente habitual ("VIP") | Panel → Habituales |
| Cambiar el color de acento | `docs/css/estilos.css`, variable `--acento` |
| Cambiar textos del local | `docs/js/config.js` → `MARCA` |
| Cambiar cada cuántos minutos arranca un turno | tabla `config`, clave `paso_min` |
| Agregar una sección a la landing | `docs/index.html` + un bloque en `estilos.css` |

Para una función nueva del flujo de reserva, el patrón es siempre el mismo:
una función SQL en `supabase/03_funciones.sql` con `security definer` + un
`grant execute` al final, y una llamada `sb.rpc(...)` desde el front.

---

## 4. Clientes habituales ("VIP") y recordatorio por WhatsApp con IA

**Lo que ya está construido** (panel → pestaña **Habituales**): se carga un
patrón por cliente — barbero, servicio, día de la semana, hora, teléfono — y
el panel muestra, para cada uno, si esta semana ya tiene turno confirmado, si
está "pendiente" (no se le avisó todavía) o si hay un **conflicto** (el
barbero no atiende ese día: franco, vacaciones, cambió el horario). Esto NO
reserva nada solo: es la lista de a quién hay que avisarle y cuándo.

**Lo que falta** es el envío del mensaje y la reprogramación automática, y
eso vive fuera de esta web, en **n8n** — mismo patrón que ya usás en Dottiplast
y en el SaaS de gestión: n8n orquesta, Meta Cloud API manda el WhatsApp,
Claude interpreta la respuesta, y la base de datos sigue siendo la única
fuente de verdad (n8n se conecta con la `service_role key`, que bypassea el
RLS, tal como en tus otros proyectos; para reservar/reprogramar usa las
mismas funciones `crear_turno`/`slots_disponibles` que ya usa la web, con la
`anon key`, porque esas ya validan todo del lado del servidor).

El workflow del cron (a quién avisarle cada día) ya está armado y **probado**
en [`n8n/recordatorio-habituales.json`](n8n/recordatorio-habituales.json),
listo para importar. El de la respuesta con IA queda documentado paso a paso
en [`n8n/README.md`](n8n/README.md), junto con el requisito **no negociable**
de tener un número de WhatsApp Business propio del negocio (no un celular
personal — Meta lo detecta y lo termina bloqueando).

---

## 5. Próximos pasos recomendados

Ordenados por lo que más impacto tiene sobre lo que menos:

1. **Recordatorio por WhatsApp 24 h antes, para TODOS los turnos** (no solo
   habituales). Es lo que más baja los ausentes en general. Mismo mecanismo
   que el punto 4, pero disparado por cualquier turno del día siguiente en
   vez de por el patrón de un cliente habitual.
2. **Email de confirmación automático.** Una Edge Function de Supabase con
   Resend, disparada por trigger al insertar el turno.
3. **Seña para reservar.** Si hay muchos ausentes, cobrar una seña con Mercado
   Pago mata el problema de raíz. Requiere una Edge Function que confirme el
   pago antes de dar el turno por válido.
4. **Cloudflare Turnstile** en el formulario de reserva. Hoy alcanza con el
   honeypot + límites por teléfono; si alguna vez aparece spam en serio, este
   es el paso siguiente.
5. **Fotos reales.** Las de los barberos y las prendas cargan por URL desde el
   panel: se pueden subir a Supabase Storage y pegar el link.
6. **Ficha de cliente.** Con el teléfono ya se puede armar el historial:
   cuántas veces vino, con quién, cuánto gastó.
7. **Comisiones por barbero.** Un porcentaje por barbero en la tabla `barberos`
   y las estadísticas ya calculan cuánto se lleva cada uno.

---

## Estructura

```
Barberias/
├── Dockerfile
├── nginx.conf
├── README.md
├── supabase/
│   ├── 01_schema.sql
│   ├── 02_rls.sql
│   ├── 03_funciones.sql
│   └── 04_seed.sql
└── docs/                    ← también sirve como fuente de GitHub Pages
    ├── index.html          landing
    ├── reservar.html       flujo de turnos
    ├── admin.html          panel
    ├── manifest.json
    ├── sw.js
    ├── robots.txt
    ├── css/estilos.css
    └── js/
        ├── config.js       ← lo único que hay que configurar
        ├── demo.js         ← modo demo sin Supabase (se apaga solo)
        ├── landing.js
        ├── reservar.js
        └── admin.js
```

> Se llama `docs/` y no `public/` a propósito: es una de las dos carpetas que
> GitHub Pages permite servir directo, sin build ni Action extra.
