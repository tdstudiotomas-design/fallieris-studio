/* =====================================================================
   FALLIERI'S STUDIO · MODO DEMO
   ---------------------------------------------------------------------
   Para qué sirve: mostrarle la app al cliente ANTES de tener Supabase.
   Reemplaza al cliente de Supabase por uno falso que guarda todo en el
   navegador (localStorage). El turno que saca el cliente aparece de
   verdad en el panel, en el mismo dispositivo.

   Se activa solo cuando:
     · config.js todavía tiene los datos de ejemplo, o
     · la URL termina en ?demo=1

   Apenas pongas la URL y la anon key reales, se apaga solo y la app pasa
   a usar Supabase. No hay que borrar este archivo ni tocar nada.

   ⚠️ Esto NO es la lógica de producción. Los turnos de verdad los valida
   Postgres (ver supabase/03_funciones.sql). Acá se replica de forma
   simplificada, solo para que la demo se sienta real.
   ===================================================================== */
(function () {
  'use strict';

  var LLAVE = 'fallieris_demo_v2';
  var PASO_MIN = 30;
  var ANTICIPACION_HS = 2;

  /* ---------------------------------------------------------------- */
  /* Datos de la demo                                                  */
  /* ---------------------------------------------------------------- */
  var BARBEROS = [
    { id: 'b1', nombre: 'Valentín Fallieri', apodo: 'Valen', bio: 'Fades, color y diseño.',             instagram: 'valentin_fallieri', activo: true, orden: 1, user_id: 'u1' },
    { id: 'b2', nombre: 'Ina Fallieri',      apodo: 'Ina',   bio: 'Color y estilismo.',                 instagram: 'inafallieri1',      activo: true, orden: 2, user_id: null },
    { id: 'b3', nombre: 'Ale Fusto',         apodo: 'Ale',   bio: 'Corte clásico y barba con navaja.',  instagram: 'aleefusto5',        activo: true, orden: 3, user_id: null },
    { id: 'b4', nombre: 'Dami Trusso',       apodo: 'Dami',  bio: 'Freestyle y diseños a mano alzada.', instagram: 'damitrusso',        activo: true, orden: 4, user_id: null },
    { id: 'b5', nombre: 'Luki',              apodo: 'Luki',  bio: 'Corte prolijo sin vueltas.',         instagram: 'lukitaaaa.7',       activo: true, orden: 5, user_id: null }
  ];

  var SERVICIOS = [
    { id: 's1', nombre: 'Corte',              descripcion: 'Corte a máquina y tijera, lavado y peinado.',   duracion_min: 30, precio: 16000, activo: true, orden: 1 },
    { id: 's2', nombre: 'Corte y barba',      descripcion: 'El combo completo. Perfilado con navaja.',      duracion_min: 60, precio: 18000, activo: true, orden: 2 },
    { id: 's3', nombre: 'Barba',              descripcion: 'Perfilado, navaja y toalla caliente.',          duracion_min: 30, precio: 9000,  activo: true, orden: 3 },
    { id: 's4', nombre: 'Corte niño',         descripcion: 'Hasta 12 años. Paciencia incluida.',            duracion_min: 30, precio: 12000, activo: true, orden: 4 },
    { id: 's5', nombre: 'Diseño / freestyle', descripcion: 'Líneas y dibujos a mano alzada sobre el corte.', duracion_min: 45, precio: 20000, activo: true, orden: 5 },
    { id: 's6', nombre: 'Color',              descripcion: 'Platinado, mechas o color completo.',           duracion_min: 90, precio: 35000, activo: true, orden: 6 }
  ];

  var PRODUCTOS = [
    { id: 'p1', nombre: "Buzo oversize Fallieri's", descripcion: 'Frisa pesada 400gr, print serigrafiado.', precio: 62000, categoria: 'Buzos',   talles: ['S','M','L','XL'],       stock: 12, destacado: true,  activo: true, orden: 1 },
    { id: 'p2', nombre: 'Remera boxy negra',        descripcion: 'Algodón peinado 24/1, corte ancho.',      precio: 32000, categoria: 'Remeras', talles: ['S','M','L','XL'],       stock: 20, destacado: true,  activo: true, orden: 2 },
    { id: 'p3', nombre: 'Gorra bordada',            descripcion: 'Bordado frontal, cierre snapback.',       precio: 28000, categoria: 'Gorras',  talles: ['Único'],                stock: 15, destacado: false, activo: true, orden: 3 },
    { id: 'p4', nombre: 'Campera rompeviento',      descripcion: 'Nylon con forro, logo en el pecho.',      precio: 89000, categoria: 'Camperas',talles: ['M','L','XL'],           stock: 6,  destacado: true,  activo: true, orden: 4 },
    { id: 'p5', nombre: 'Pantalón cargo',           descripcion: 'Gabardina con bolsillos laterales.',      precio: 58000, categoria: 'Pantalones', talles: ['38','40','42','44'], stock: 9,  destacado: false, activo: true, orden: 5 },
    { id: 'p6', nombre: 'Kit barba',                descripcion: 'Aceite + bálsamo + peine de madera.',     precio: 24000, categoria: 'Cuidado', talles: ['Único'],                stock: 25, destacado: false, activo: true, orden: 6 }
  ];

  // Quién hace qué (mismo criterio que el seed de Supabase)
  var CATALOGO = [];
  BARBEROS.forEach(function (b) {
    ['s1', 's2', 's3', 's4'].forEach(function (s) {
      CATALOGO.push({ barbero_id: b.id, servicio_id: s, precio: null, duracion_min: null });
    });
  });
  CATALOGO.push({ barbero_id: 'b1', servicio_id: 's5', precio: null,  duracion_min: null });
  CATALOGO.push({ barbero_id: 'b4', servicio_id: 's5', precio: null,  duracion_min: null });
  CATALOGO.push({ barbero_id: 'b1', servicio_id: 's6', precio: null,  duracion_min: null });
  CATALOGO.push({ barbero_id: 'b2', servicio_id: 's6', precio: 38000, duracion_min: null });

  // Agenda: martes a sábado, 10–13 y 15–20. Luki no trabaja los martes.
  var HORARIOS = [];
  BARBEROS.forEach(function (b) {
    [2, 3, 4, 5, 6].forEach(function (d) {
      if (b.id === 'b5' && d === 2) return;
      HORARIOS.push({ id: b.id + '-' + d + '-a', barbero_id: b.id, dia_semana: d, hora_inicio: '10:00:00', hora_fin: '13:00:00', activo: true });
      HORARIOS.push({ id: b.id + '-' + d + '-b', barbero_id: b.id, dia_semana: d, hora_inicio: '15:00:00', hora_fin: '20:00:00', activo: true });
    });
  });

  var NOMBRES = ['Franco Giménez','Matías Pereyra','Iván Rodríguez','Thiago Almada','Nicolás Suárez',
                 'Lautaro Benítez','Joaquín Ramos','Bruno Vera','Santino Ledesma','Gonzalo Ferreyra',
                 'Julián Acosta','Facundo Ortiz','Tomás Aguirre','Ramiro Cabrera','Elías Moyano'];

  /* Historial: 45 turnos de los últimos 30 días para que las estadísticas
     del panel no arranquen vacías, más algunos turnos próximos. */
  function generarTurnos() {
    var turnos = [];
    var n = 0;
    function agregar(dias, hh, estado) {
      var b = BARBEROS[n % 5];
      var rel = CATALOGO.filter(function (c) { return c.barbero_id === b.id; });
      var r = rel[(n * 3) % rel.length];
      var s = SERVICIOS.filter(function (x) { return x.id === r.servicio_id; })[0];
      var d = new Date();
      d.setDate(d.getDate() + dias);
      d.setHours(hh, 0, 0, 0);
      if (d.getDay() === 0 || d.getDay() === 1) return;   // cerrado
      var dur = r.duracion_min || s.duracion_min;
      turnos.push({
        id: 't' + (++n),
        barbero_id: b.id, servicio_id: s.id,
        inicio: d.toISOString(),
        fin: new Date(d.getTime() + dur * 60000).toISOString(),
        duracion_min: dur,
        precio: r.precio != null ? r.precio : s.precio,
        cliente_nombre: NOMBRES[n % NOMBRES.length],
        cliente_telefono: '11' + (30000000 + n * 137911),
        cliente_email: null, notas: null,
        estado: estado, codigo: 'DEMO' + String(n).padStart(4, '0'),
        origen: 'web', cobrado: estado === 'atendido',
        creado_en: new Date(d.getTime() - 86400000).toISOString()
      });
    }
    for (var dia = -30; dia <= -1; dia++) {
      [10, 11, 16, 17, 18, 19].forEach(function (h) {
        if ((dia + h) % 3 === 0) agregar(dia, h, (dia + h) % 11 === 0 ? 'cancelado' : 'atendido');
      });
    }
    [10, 16, 18].forEach(function (h) { agregar(0, h, 'confirmado'); });
    [11, 17].forEach(function (h) { agregar(1, h, 'confirmado'); });
    return turnos;
  }

  /* ---------------------------------------------------------------- */
  /* Estado persistente                                                */
  /* ---------------------------------------------------------------- */
  var DB;
  function cargar() {
    try {
      var guardado = localStorage.getItem(LLAVE);
      if (guardado) { DB = JSON.parse(guardado); return; }
    } catch (e) { /* modo incógnito o storage bloqueado */ }
    DB = {
      barberos: BARBEROS, servicios: SERVICIOS, barbero_servicios: CATALOGO,
      horarios: HORARIOS, productos: PRODUCTOS, turnos: generarTurnos(),
      bloqueos: [], perfiles: [{ user_id: 'u1', rol: 'admin', barbero_id: null }]
    };
    guardar();
  }
  function guardar() {
    try { localStorage.setItem(LLAVE, JSON.stringify(DB)); } catch (e) {}
  }

  /* ---------------------------------------------------------------- */
  /* Helpers                                                           */
  /* ---------------------------------------------------------------- */
  function uid() { return 'x' + Math.random().toString(36).slice(2, 10); }
  function ok(data) { return Promise.resolve({ data: data, error: null }); }
  function falla(msg) { return Promise.resolve({ data: null, error: { message: msg } }); }
  function copiar(o) { return JSON.parse(JSON.stringify(o)); }

  function servicioDe(id) { return DB.servicios.filter(function (s) { return s.id === id; })[0]; }
  function barberoDe(id)  { return DB.barberos.filter(function (b) { return b.id === id; })[0]; }

  function relacion(barberoId, servicioId) {
    return DB.barbero_servicios.filter(function (c) {
      return c.barbero_id === barberoId && c.servicio_id === servicioId;
    })[0];
  }

  // Le pega los objetos relacionados a cada fila, como hace PostgREST
  function hidratar(tabla, filas) {
    if (tabla === 'turnos') {
      return filas.map(function (t) {
        var b = barberoDe(t.barbero_id), s = servicioDe(t.servicio_id);
        return Object.assign({}, t, {
          barberos: b ? { nombre: b.nombre } : null,
          servicios: s ? { nombre: s.nombre } : null
        });
      });
    }
    if (tabla === 'barbero_servicios') {
      return filas.map(function (c) {
        return Object.assign({}, c, { servicios: copiar(servicioDe(c.servicio_id)) || null });
      });
    }
    return filas;
  }

  /* ---------------------------------------------------------------- */
  /* Horarios libres (versión simplificada de slots_disponibles)       */
  /* ---------------------------------------------------------------- */
  function slotsLibres(barberoId, servicioId, fecha) {
    var rel = relacion(barberoId, servicioId);
    var srv = servicioDe(servicioId);
    var b = barberoDe(barberoId);
    if (!rel || !srv || !srv.activo || !b || !b.activo) return [];

    var dur = rel.duracion_min || srv.duracion_min;
    var base = new Date(fecha + 'T12:00:00');
    var dow = base.getDay();
    var limite = Date.now() + ANTICIPACION_HS * 3600000;
    var libres = [];

    DB.horarios.filter(function (h) {
      return h.barbero_id === barberoId && h.dia_semana === dow && h.activo;
    }).forEach(function (h) {
      var t = new Date(fecha + 'T' + h.hora_inicio);
      var cierre = new Date(fecha + 'T' + h.hora_fin);
      while (t.getTime() + dur * 60000 <= cierre.getTime()) {
        var ini = new Date(t), fin = new Date(t.getTime() + dur * 60000);
        var chocaTurno = DB.turnos.some(function (x) {
          return x.barbero_id === barberoId && x.estado !== 'cancelado' &&
                 new Date(x.inicio) < fin && new Date(x.fin) > ini;
        });
        var chocaBloqueo = DB.bloqueos.some(function (bl) {
          return (bl.barbero_id === barberoId || !bl.barbero_id) &&
                 new Date(bl.inicio) < fin && new Date(bl.fin) > ini;
        });
        if (!chocaTurno && !chocaBloqueo && ini.getTime() > limite) libres.push(ini.toISOString());
        t = new Date(t.getTime() + PASO_MIN * 60000);
      }
    });
    return libres.sort();
  }

  function fechaLocal(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* ---------------------------------------------------------------- */
  /* Funciones RPC                                                     */
  /* ---------------------------------------------------------------- */
  var RPC = {
    slots_disponibles: function (p) {
      return ok(slotsLibres(p.p_barbero, p.p_servicio, p.p_fecha).map(function (i) { return { inicio: i }; }));
    },

    dias_disponibles: function (p) {
      var dias = Math.min(Math.max(p.p_dias || 14, 1), 31);
      var salida = [], hoy = new Date();
      for (var i = 0; i < dias; i++) {
        var d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i);
        var f = fechaLocal(d);
        salida.push({ fecha: f, cupos: slotsLibres(p.p_barbero, p.p_servicio, f).length });
      }
      return ok(salida);
    },

    crear_turno: function (p) {
      if ((p.p_trampa || '').trim() !== '') return falla('Solicitud inválida.');

      var nombre = (p.p_nombre || '').replace(/\s+/g, ' ').trim();
      var tel = (p.p_telefono || '').replace(/[^0-9+]/g, '');
      if (nombre.length < 3) return falla('Ingresá tu nombre y apellido.');
      if (tel.length < 8)    return falla('El teléfono no parece válido.');

      var activos = DB.turnos.filter(function (t) {
        return t.cliente_telefono === tel && t.estado === 'confirmado' && new Date(t.inicio) > new Date();
      }).length;
      if (activos >= 3) return falla('Ya tenés 3 turnos reservados. Cancelá uno antes de sacar otro.');

      var libres = slotsLibres(p.p_barbero, p.p_servicio, fechaLocal(new Date(p.p_inicio)));
      if (libres.indexOf(p.p_inicio) === -1) return falla('Ese horario ya no está disponible. Elegí otro.');

      var rel = relacion(p.p_barbero, p.p_servicio);
      var srv = servicioDe(p.p_servicio);
      var b = barberoDe(p.p_barbero);
      var dur = rel.duracion_min || srv.duracion_min;
      var precio = rel.precio != null ? rel.precio : srv.precio;
      var codigo = Math.random().toString(16).slice(2, 10).toUpperCase();

      DB.turnos.push({
        id: uid(), barbero_id: p.p_barbero, servicio_id: p.p_servicio,
        inicio: p.p_inicio, fin: new Date(new Date(p.p_inicio).getTime() + dur * 60000).toISOString(),
        duracion_min: dur, precio: precio,
        cliente_nombre: nombre, cliente_telefono: tel,
        cliente_email: p.p_email || null, notas: p.p_notas || null,
        estado: 'confirmado', codigo: codigo, origen: 'web', cobrado: false,
        creado_en: new Date().toISOString()
      });
      guardar();

      return ok({
        ok: true, codigo: codigo, barbero: b.nombre, servicio: srv.nombre,
        precio: precio, inicio: p.p_inicio, duracion_min: dur
      });
    },

    cancelar_turno: function (p) {
      var codigo = (p.p_codigo || '').trim().toUpperCase();
      var tel = (p.p_telefono || '').replace(/[^0-9+]/g, '');
      var t = DB.turnos.filter(function (x) { return x.codigo === codigo && x.cliente_telefono === tel; })[0];
      if (!t) return falla('No encontramos ese turno. Revisá el código y el teléfono.');
      if (t.estado === 'cancelado') return ok({ ok: true, mensaje: 'Ese turno ya estaba cancelado.' });
      if (new Date(t.inicio).getTime() < Date.now() + 2 * 3600000) {
        return falla('Faltan menos de 2 h para el turno. Avisanos por WhatsApp.');
      }
      t.estado = 'cancelado';
      guardar();
      return ok({ ok: true, mensaje: 'Turno cancelado.' });
    },

    estadisticas: function (p) {
      var desde = new Date(p.p_desde + 'T00:00:00').getTime();
      var hasta = new Date(p.p_hasta + 'T23:59:59').getTime();
      return ok(DB.barberos.map(function (b) {
        var t = DB.turnos.filter(function (x) {
          var m = new Date(x.inicio).getTime();
          return x.barbero_id === b.id && m >= desde && m <= hasta;
        });
        return {
          barbero_id: b.id, barbero: b.nombre,
          turnos:     t.filter(function (x) { return x.estado !== 'cancelado'; }).length,
          atendidos:  t.filter(function (x) { return x.estado === 'atendido'; }).length,
          cancelados: t.filter(function (x) { return x.estado === 'cancelado'; }).length,
          ingresos:   t.filter(function (x) { return x.estado === 'atendido'; })
                       .reduce(function (s, x) { return s + Number(x.precio || 0); }, 0)
        };
      }).sort(function (a, b) { return b.ingresos - a.ingresos; }));
    }
  };

  /* ---------------------------------------------------------------- */
  /* Constructor de consultas (imita la API de supabase-js)            */
  /* ---------------------------------------------------------------- */
  function consulta(tabla) {
    var st = { filtros: [], orden: [], limite: null, accion: 'select', valores: null, single: false };

    function ejecutar() {
      if (!DB[tabla]) return falla('Tabla inexistente en la demo: ' + tabla);
      var filas = DB[tabla];

      if (st.accion === 'insert') {
        var nuevas = (Array.isArray(st.valores) ? st.valores : [st.valores]).map(function (v) {
          return Object.assign({ id: uid(), creado_en: new Date().toISOString() }, v);
        });
        // Choque de horarios: mismo control que la restricción EXCLUDE de Postgres
        if (tabla === 'turnos') {
          for (var i = 0; i < nuevas.length; i++) {
            var n = nuevas[i];
            var choca = DB.turnos.some(function (x) {
              return x.barbero_id === n.barbero_id && x.estado !== 'cancelado' &&
                     new Date(x.inicio) < new Date(n.fin) && new Date(x.fin) > new Date(n.inicio);
            });
            if (choca) return falla('Ese barbero ya tiene un turno en ese horario.');
          }
        }
        DB[tabla] = filas.concat(nuevas);
        guardar();
        return ok(nuevas);
      }

      var elegidas = filas.filter(function (f) {
        return st.filtros.every(function (fn) { return fn(f); });
      });

      if (st.accion === 'update') {
        elegidas.forEach(function (f) { Object.assign(f, st.valores); });
        guardar();
        return ok(elegidas);
      }
      if (st.accion === 'delete') {
        DB[tabla] = filas.filter(function (f) { return elegidas.indexOf(f) === -1; });
        guardar();
        return ok([]);
      }

      var salida = elegidas.slice();
      st.orden.forEach(function (o) {
        salida.sort(function (a, b) {
          var x = a[o[0]], y = b[o[0]];
          if (x === y) return 0;
          return (x > y ? 1 : -1) * o[1];
        });
      });
      if (st.limite) salida = salida.slice(0, st.limite);
      salida = hidratar(tabla, copiar(salida));
      return ok(st.single ? (salida[0] || null) : salida);
    }

    var api = {
      select: function () { return api; },
      insert: function (v) { st.accion = 'insert'; st.valores = v; return api; },
      update: function (v) { st.accion = 'update'; st.valores = v; return api; },
      delete: function () { st.accion = 'delete'; return api; },
      eq:  function (c, v) { st.filtros.push(function (f) { return f[c] === v; }); return api; },
      neq: function (c, v) { st.filtros.push(function (f) { return f[c] !== v; }); return api; },
      gte: function (c, v) { st.filtros.push(function (f) { return f[c] >= v; }); return api; },
      lt:  function (c, v) { st.filtros.push(function (f) { return f[c] < v; }); return api; },
      order: function (c, o) { st.orden.push([c, (o && o.ascending === false) ? -1 : 1]); return api; },
      limit: function (n) { st.limite = n; return api; },
      maybeSingle: function () { st.single = true; return api; },
      single: function () { st.single = true; return api; },
      then: function (res, rej) { return ejecutar().then(res, rej); }
    };
    return api;
  }

  /* ---------------------------------------------------------------- */
  /* Auth de mentira                                                   */
  /* ---------------------------------------------------------------- */
  var sesion = null;
  var oyentes = [];
  try { sesion = JSON.parse(sessionStorage.getItem(LLAVE + '_sesion') || 'null'); } catch (e) {}

  function avisar() {
    oyentes.forEach(function (fn) { fn('CAMBIO', sesion); });
  }

  var auth = {
    getSession: function () { return Promise.resolve({ data: { session: sesion }, error: null }); },
    onAuthStateChange: function (fn) {
      oyentes.push(fn);
      return { data: { subscription: { unsubscribe: function () { oyentes = oyentes.filter(function (o) { return o !== fn; }); } } } };
    },
    signInWithPassword: function (c) {
      if ((c.password || '') !== 'demo') {
        return Promise.resolve({ data: null, error: { message: 'Contraseña incorrecta' } });
      }
      // Cualquier email con "barbero" adentro entra como barbero; el resto, como jefe
      var esBarbero = /barbero/i.test(c.email || '');
      var user = { id: esBarbero ? 'u2' : 'u1', email: c.email };
      DB.perfiles = [
        { user_id: 'u1', rol: 'admin', barbero_id: null },
        { user_id: 'u2', rol: 'barbero', barbero_id: 'b1' }
      ];
      guardar();
      sesion = { user: user };
      try { sessionStorage.setItem(LLAVE + '_sesion', JSON.stringify(sesion)); } catch (e) {}
      avisar();
      return Promise.resolve({ data: { session: sesion }, error: null });
    },
    signOut: function () {
      sesion = null;
      try { sessionStorage.removeItem(LLAVE + '_sesion'); } catch (e) {}
      avisar();
      return Promise.resolve({ error: null });
    }
  };

  /* ---------------------------------------------------------------- */
  /* Cartel de "estás viendo una demo"                                 */
  /* ---------------------------------------------------------------- */
  function cartel() {
    function pintar() {
      if (document.getElementById('cartelDemo')) return;
      var d = document.createElement('div');
      d.id = 'cartelDemo';
      d.className = 'cartel-demo';
      d.innerHTML = '<b>Demo</b> · datos de prueba, se guardan solo en este dispositivo' +
        (location.pathname.indexOf('admin') === -1
          ? ' · <a href="admin.html">ver el panel</a>'
          : ' · entrá con cualquier email y la contraseña <b>demo</b>');
      document.body.appendChild(d);
    }
    if (document.body) pintar();
    else document.addEventListener('DOMContentLoaded', pintar);
  }

  /* ---------------------------------------------------------------- */
  /* Punto de entrada: lo usan landing.js, reservar.js y admin.js      */
  /* ---------------------------------------------------------------- */
  window.crearCliente = function (opciones) {
    var c = window.CONFIG;
    var sinConfigurar = !c || c.SUPABASE_URL.indexOf('TU-PROYECTO') !== -1;
    var forzado = location.search.indexOf('demo=1') !== -1;

    if (!sinConfigurar && !forzado) {
      window.MODO_DEMO = false;
      return window.supabase.createClient(c.SUPABASE_URL, c.SUPABASE_ANON_KEY, opciones);
    }

    window.MODO_DEMO = true;
    cargar();
    cartel();
    return { from: consulta, rpc: function (n, p) {
      return RPC[n] ? RPC[n](p || {}) : falla('Función no disponible en la demo: ' + n);
    }, auth: auth };
  };

  // Para reiniciar la demo desde la consola: reiniciarDemo()
  window.reiniciarDemo = function () {
    try { localStorage.removeItem(LLAVE); sessionStorage.removeItem(LLAVE + '_sesion'); } catch (e) {}
    location.reload();
  };
})();
