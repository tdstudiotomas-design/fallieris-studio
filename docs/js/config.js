/* =====================================================================
   FALLIERI'S STUDIO · Configuración única del proyecto
   Lo único que hay que tocar para poner la app en marcha.
   ---------------------------------------------------------------------
   La "anon key" de Supabase es PÚBLICA por diseño: viaja al navegador de
   cualquier visitante. No es un secreto y no pasa nada si se ve.
   La seguridad está en el RLS y en las funciones RPC (carpeta /supabase).
   NUNCA pongas acá la "service_role key".
   ===================================================================== */

window.CONFIG = {
  // --- Supabase -------------------------------------------------------
  // Supabase -> Project Settings -> API
  SUPABASE_URL:  'https://TU-PROYECTO.supabase.co',
  SUPABASE_ANON_KEY: 'TU-ANON-KEY',

  // --- Marca ----------------------------------------------------------
  MARCA: {
    nombre:      "FALLIERI'S",
    nombreLargo: "FALLIERI'S STUDIO",
    claim:       'Corte, color y oficio.',

    // ⚠️ COMPLETAR con el número real de la barbería (sin + ni espacios)
    whatsapp:    '5492346000000',

    instagram:   'fallieristudio',
    showroom:    'fallierishowroom',   // cuenta de la ropa
    direccion:   'Almafuerte 585, Chivilcoy (6620)',
    mapa:        'https://maps.google.com/?q=Almafuerte+585+Chivilcoy',

    // ⚠️ COMPLETAR con los horarios reales del local
    horario:     'Martes a sábado · 10–13 / 15–20',
    email:       '',
  },

  // --- Reservas -------------------------------------------------------
  DIAS_VISIBLES: 14,          // largo de la tira de días en el paso 3
  ZONA: 'America/Argentina/Buenos_Aires',
  MONEDA: 'ARS',
};
