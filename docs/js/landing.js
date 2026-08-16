/* =====================================================================
   BARBERÍA · Landing
   JavaScript sin frameworks: la landing tiene que cargar rápido y ser
   legible por Google. El HTML ya viene con contenido; esto lo refresca
   con lo que haya en la base de datos.
   ===================================================================== */
(function () {
  'use strict';

  var C  = window.CONFIG;
  var M  = C.MARCA;
  var sb = null;

  // window.crearCliente() devuelve Supabase real si config.js está completo,
  // o un cliente falso (modo demo) mientras no lo esté. Ver js/demo.js.
  // Si por algún motivo tampoco carga eso, la landing sigue funcionando
  // con el contenido estático que ya trae el HTML.
  try { sb = window.crearCliente({ auth: { persistSession: false } }); }
  catch (e) { console.warn('No se pudo iniciar el cliente de datos:', e); }

  // ------------------------------------------------------------------
  // Utilidades
  // ------------------------------------------------------------------
  function $(sel) { return document.querySelector(sel); }
  function plata(n) {
    return '$ ' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });
  }
  function duracion(min) {
    if (min >= 60) {
      var h = Math.floor(min / 60), r = min % 60;
      return r ? h + ' h ' + r + ' min' : h + ' h';
    }
    return min + ' min';
  }
  function iniciales(nombre) {
    return (nombre || '').split(' ').filter(Boolean).slice(0, 2)
      .map(function (p) { return p[0]; }).join('').toUpperCase();
  }
  // Escapa texto antes de meterlo en el HTML (viene de la base: nunca confiar)
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function waLink(texto) {
    return 'https://wa.me/' + M.whatsapp + '?text=' + encodeURIComponent(texto);
  }

  // ------------------------------------------------------------------
  // Nav
  // ------------------------------------------------------------------
  var nav = $('#nav');
  function alScrollear() { nav.classList.toggle('fija', window.scrollY > 40); }
  window.addEventListener('scroll', alScrollear, { passive: true });
  alScrollear();

  $('#burger').addEventListener('click', function () {
    $('#navLinks').classList.toggle('abierto');
  });
  document.querySelectorAll('#navLinks a').forEach(function (a) {
    a.addEventListener('click', function () { $('#navLinks').classList.remove('abierto'); });
  });

  // ------------------------------------------------------------------
  // Datos de marca en el HTML
  // ------------------------------------------------------------------
  $('#anio').textContent = new Date().getFullYear();
  $('#infoDireccion').textContent = M.direccion;
  $('#infoMapa').href   = M.mapa;
  $('#infoInsta').href  = 'https://instagram.com/' + M.instagram;
  $('#infoInsta2').href = 'https://instagram.com/' + M.showroom;
  $('#horarioTexto').textContent = M.horario;
  $('#infoHorario').textContent  = M.horario;
  var wa = waLink('¡Hola! Quería consultar por un turno.');
  $('#infoWhats').href = wa;
  $('#waFlotante').href = wa;
  $('#btnWhatsTienda').href = waLink('¡Hola! Quería consultar por una prenda del showroom.');
  $('#btnInstaShowroom').href = 'https://instagram.com/' + M.showroom;

  // ------------------------------------------------------------------
  // Servicios
  // ------------------------------------------------------------------
  function pintarServicios(servicios) {
    if (!servicios || !servicios.length) return;
    $('#listaServicios').innerHTML = servicios.map(function (s) {
      return '<article class="servicio">' +
        '<h3>' + esc(s.nombre) + '</h3>' +
        '<div class="precio">' + plata(s.precio) + '</div>' +
        (s.descripcion ? '<p>' + esc(s.descripcion) + '</p>' : '') +
        '<div class="duracion">' + duracion(s.duracion_min) + '</div>' +
        '</article>';
    }).join('');
  }

  // ------------------------------------------------------------------
  // Equipo
  // ------------------------------------------------------------------
  function pintarEquipo(barberos) {
    if (!barberos || !barberos.length) return;
    $('#grillaEquipo').innerHTML = barberos.map(function (b, i) {
      var foto = b.foto_url
        ? '<img src="' + esc(b.foto_url) + '" alt="' + esc(b.nombre) + '" loading="lazy">'
        : '<b>' + esc(iniciales(b.nombre)) + '</b>';
      return '<div class="barbero-card">' +
        '<span class="num-tag">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<div class="barbero-foto">' + foto + '</div>' +
        '<h3>' + esc(b.nombre) + '</h3>' +
        '<p class="bio">' + esc(b.bio || '') + '</p>' +
        '<div class="pie">' +
          '<a href="reservar.html?barbero=' + encodeURIComponent(b.id) + '">Reservar →</a>' +
          (b.instagram ? '<a class="insta" target="_blank" rel="noopener" href="https://instagram.com/' + esc(b.instagram) + '">@' + esc(b.instagram) + '</a>' : '') +
        '</div>' +
      '</div>';
    }).join('');
  }

  // ------------------------------------------------------------------
  // Tienda
  // ------------------------------------------------------------------
  // Placeholders: se reemplazan solos apenas se carguen los productos reales
  // desde el panel (Showroom).
  var PRODUCTOS_DEMO = [
    { nombre: "Buzo oversize Fallieri's", precio: 62000, talles: ['S','M','L','XL'], destacado: true },
    { nombre: 'Remera boxy negra',        precio: 32000, talles: ['S','M','L','XL'], destacado: true },
    { nombre: 'Gorra bordada',            precio: 28000, talles: ['Único'] },
    { nombre: 'Campera rompeviento',      precio: 89000, talles: ['M','L','XL'], destacado: true },
    { nombre: 'Pantalón cargo',           precio: 58000, talles: ['38','40','42','44'] },
    { nombre: 'Kit barba',                precio: 24000, talles: ['Único'] }
  ];

  function pintarTienda(productos) {
    var lista = (productos && productos.length) ? productos : PRODUCTOS_DEMO;
    $('#grillaTienda').innerHTML = lista.map(function (p) {
      var img = p.imagen_url
        ? '<img src="' + esc(p.imagen_url) + '" alt="' + esc(p.nombre) + '" loading="lazy">'
        : '<b>' + esc(p.nombre) + '</b>';
      var talles = (p.talles && p.talles.length) ? p.talles.join(' · ') : '';
      var agotado = (typeof p.stock === 'number' && p.stock <= 0);
      return '<a class="producto" target="_blank" rel="noopener" href="' +
          esc(waLink('¡Hola! Me interesa: ' + p.nombre + '. ¿Qué talles tienen?')) + '">' +
        '<div class="producto-img">' + img +
          (p.destacado ? '<span class="tag">Nuevo</span>' : '') +
          (agotado ? '<span class="tag" style="background:var(--sangre);color:#fff">Sin stock</span>' : '') +
        '</div>' +
        '<h3>' + esc(p.nombre) + '</h3>' +
        '<div class="fila"><span class="precio">' + plata(p.precio) + '</span>' +
        '<span class="talles">' + esc(talles) + '</span></div>' +
      '</a>';
    }).join('');
  }

  // ------------------------------------------------------------------
  // Carga desde Supabase
  // ------------------------------------------------------------------
  pintarTienda(null);   // deja algo visible mientras carga

  if (sb) {
    // Ojo: en barberos pedimos columnas explícitas porque el rol anónimo
    // no tiene permiso sobre user_id (ver 02_rls.sql).
    sb.from('barberos')
      .select('id,nombre,apodo,bio,foto_url,instagram,orden')
      .eq('activo', true).order('orden')
      .then(function (r) { if (!r.error) pintarEquipo(r.data); else console.warn(r.error); });

    sb.from('servicios')
      .select('id,nombre,descripcion,duracion_min,precio,orden')
      .eq('activo', true).order('orden')
      .then(function (r) { if (!r.error) pintarServicios(r.data); else console.warn(r.error); });

    sb.from('productos')
      .select('id,nombre,descripcion,precio,categoria,imagen_url,talles,stock,destacado,orden')
      .eq('activo', true).order('orden')
      .then(function (r) { if (!r.error && r.data && r.data.length) pintarTienda(r.data); });
  }

  // Service worker (PWA)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
