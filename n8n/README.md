# Automatización de recordatorios · Fallieri's Studio

Dos workflows separados, mismo criterio que usás en Dottiplast: uno dispara
(el cron que avisa), el otro escucha (la respuesta del cliente). No inventan
nada nuevo del lado de la reserva — llaman a las mismas funciones que ya usa
la web (`crear_turno`, `slots_disponibles`, `dias_disponibles`,
`cancelar_turno`), así que todo lo que ya está validado y probado en
`supabase/03_funciones.sql` sigue valiendo acá también.

## Antes de arrancar

**Bloqueante real:** necesitás un número de WhatsApp Business propio de
Fallieri's Studio, verificado en Meta Business (no un celular personal — ver
la advertencia en el `README.md` principal, sección 4). Sin eso, nada de esto
puede mandar un mensaje.

Una vez que lo tengas:

1. **Meta for Developers** → creá una app tipo "Business" → agregá el
   producto **WhatsApp** → ahí conseguís el `PHONE_NUMBER_ID` y generás un
   `ACCESS_TOKEN` (para producción, uno permanente vía System User, no el de
   prueba de 24 h).
2. En tu n8n (Easypanel), cargá estas variables de entorno:
   - `SUPABASE_URL` → la de `docs/js/config.js`
   - `SUPABASE_SERVICE_ROLE_KEY` → Supabase → Project Settings → API →
     `service_role` (esta SÍ es secreta, nunca va al front ni a un repo)
   - `SUPABASE_ANON_KEY` → la misma que ya usa la web (pública)
   - `META_PHONE_NUMBER_ID`
   - `META_WHATSAPP_TOKEN`

## Workflow 1 · `recordatorio-habituales.json` (importar tal cual)

Ya armado y probado (la lógica de decisión se testeó aparte con casos
simulados: cliente al que le toca, cliente que ya confirmó, barbero de
franco, día equivocado, cliente pausado — los 5 casos se comportan bien).

**Qué hace:** todos los días a las 9 AM, mira `clientes_habituales`, calcula
a quién le toca en exactamente 2 días, descarta a los que ya tienen turno o
cuyo barbero no atiende ese día (a esos el panel ya se lo avisa al barbero
directamente, no le escribe al cliente), y le manda un WhatsApp con 3
botones: **Sí, va** / **Cambiar horario** / **Esta semana no**.

**Para importarlo:** n8n → Workflows → Import from File → elegí este JSON.
Va a pedir que cargues las credenciales de los nodos HTTP Request (o podés
dejar los headers como están, ya usan `$env.SUPABASE_SERVICE_ROLE_KEY`, solo
tenés que tener esa variable cargada en el entorno de n8n).

**Antes de activarlo:** probalo primero con "Execute workflow" a mano y
revisá el nodo "Quién toca avisar hoy" — el panel (pestaña Habituales) te
muestra en paralelo a quién le "tocaría" esta semana, así podés comparar que
coincida.

## Workflow 2 · "Responder WhatsApp" (armar en tu n8n, guía)

Esta no te la dejo como JSON importable a ciegas: depende de cómo tenés
armado tu nodo de IA en los otros proyectos (credencial de Anthropic,
versión del nodo AI Agent), y prefiero que la conectes vos con esa base en
vez de que te tire algo que quizás no coincida con tu setup. La lógica:

**1. Webhook** — Meta manda un POST acá cada vez que alguien responde un
mensaje o aprieta un botón. Configurás esta URL como *Callback URL* en
Meta for Developers → WhatsApp → Configuration.

**2. Nodo IA (Claude)** — mismo patrón que ya usás. Prompt del sistema, más
o menos:

> Sos el asistente de turnos de Fallieri's Studio. El cliente {{nombre}}
> tenía un turno habitual con {{barbero}} el {{dia}} {{fecha}} a las {{hora}}
> ({{servicio}}). Te acaba de responder: "{{mensaje}}".
>
> Decidí una de estas 3 acciones:
> - CONFIRMAR: si dice que sí, que va, que confirma.
> - CAMBIAR: si quiere otro día u horario. Preguntale cuál si no lo dijo.
> - CANCELAR: si dice que esta semana no puede.
>
> Respondé SOLO con un JSON: {"accion": "CONFIRMAR|CAMBIAR|CANCELAR",
> "respuesta_al_cliente": "...", "nuevo_dia": "YYYY-MM-DD o null",
> "nueva_hora": "HH:MM o null"}

**3. Switch node** según `accion`:

- **CONFIRMAR** → `POST {{SUPABASE_URL}}/rest/v1/rpc/crear_turno` con la
  `anon key` (¡no la service_role! esta función ya valida todo sola, es
  la misma puerta que usa la web) — body:
  ```json
  {
    "p_barbero": "...", "p_servicio": "...",
    "p_inicio": "{{fecha}}T{{hora}}:00-03:00",
    "p_nombre": "{{cliente_nombre}}", "p_telefono": "{{cliente_telefono}}"
  }
  ```
- **CAMBIAR** → si el cliente no propuso día/hora todavía, llamar
  `dias_disponibles` / `slots_disponibles` (mismo endpoint RPC, con anon key)
  y mandarle 2-3 opciones por WhatsApp. Si ya eligió, llamar `crear_turno`
  con ese horario.
- **CANCELAR** → no hace falta llamar nada (el cliente nunca tuvo un turno
  creado todavía, solo era el recordatorio). Opcionalmente, registrar en
  `notas` de `clientes_habituales` que esta semana avisó que no viene.

**4. HTTP Request final** — responder por WhatsApp con
`respuesta_al_cliente`, mismo endpoint de envío que el Workflow 1.

## Por qué está separado en dos

Si algún día cambiás de proveedor de IA, o el número de WhatsApp cambia de
plan, solo tocás el Workflow 2. El Workflow 1 (el cron que decide a quién
avisar) no depende de ninguna IA y ya está probado — no hay riesgo de que
un cambio en el agente rompa la lógica de "a quién le toca esta semana".
