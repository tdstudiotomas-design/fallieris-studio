/* =====================================================================
   BARBERÍA · Panel de administración (React 18 UMD + Babel standalone)

   Quién ve qué lo decide la base de datos, no este archivo:
     · admin   -> todo
     · barbero -> solo sus turnos, su agenda y sus ganancias
   Aunque alguien edite este JavaScript desde el navegador, el RLS de
   Postgres no le va a devolver datos de otros (ver supabase/02_rls.sql).
   ===================================================================== */

const { useState, useEffect, useMemo, useCallback } = React;
const CFG = window.CONFIG;

// window.crearCliente() devuelve Supabase real si config.js está completo,
// o un cliente falso (guarda todo en localStorage) mientras no lo esté.
// Ver js/demo.js. En modo demo, entrá con cualquier email y contraseña "demo".
const sb = window.crearCliente();

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */
const plata = (n) => '$ ' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });
const num = (n) => Number(n || 0).toLocaleString('es-AR');

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const sumarDias = (iso, dias) => {
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(a, m - 1, d + dias);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
};
const inicioDeDia = (iso) => new Date(iso + 'T00:00:00').toISOString();
const finDeDia    = (iso) => new Date(sumarDias(iso, 1) + 'T00:00:00').toISOString();
const isoDeFecha  = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Próxima fecha (YYYY-MM-DD) en la que cae ese día de la semana, saltando
// las que estén cubiertas por una pausa ("de vacaciones hasta el...").
const proximaFecha = (diaSemana, pausadoHasta) => {
  const f = new Date(); f.setHours(0, 0, 0, 0);
  for (let i = 0; i < 21; i++) {
    if (f.getDay() === diaSemana) {
      const iso = isoDeFecha(f);
      if (!pausadoHasta || iso > pausadoHasta) return iso;
    }
    f.setDate(f.getDate() + 1);
  }
  return null;
};

const hora = (iso) => new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: CFG.ZONA }).format(new Date(iso));
const fechaCorta = (iso) => new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', timeZone: CFG.ZONA }).format(new Date(iso));
const fechaLarga = (iso) => new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: CFG.ZONA }).format(new Date(iso));

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const ESTADOS = ['confirmado', 'atendido', 'cancelado', 'ausente'];

const err = (e) => (e && e.message ? e.message.replace(/^.*?:\s*/, '') : 'Error inesperado');

/* ------------------------------------------------------------------ */
/* Piezas reutilizables                                                */
/* ------------------------------------------------------------------ */
function Campo({ label, children }) {
  return <div className="campo"><label>{label}</label>{children}</div>;
}

/* Isotipo reducido (círculo + F): para la barra del panel */
function LogoMarca() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <text x="50" y="67" textAnchor="middle" fill="currentColor"
            fontFamily="'Instrument Serif',Georgia,serif" fontSize="50">F</text>
    </svg>
  );
}

/* Badge completo: para el login, donde entra grande */
function LogoBadge() {
  return (
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" strokeWidth="2" />
      <text x="100" y="96" textAnchor="middle" fill="currentColor"
            fontFamily="'Instrument Serif',Georgia,serif" fontSize="34"
            textLength="150" lengthAdjust="spacingAndGlyphs">{"FALLIERI'S"}</text>
      <path d="M44 117.5 h18 M138 117.5 h18" stroke="currentColor" strokeWidth="1.2" />
      <text x="103" y="121" textAnchor="middle" fill="currentColor"
            fontFamily="Inter,sans-serif" fontSize="10" fontWeight="500" letterSpacing="5.5">STUDIO</text>
    </svg>
  );
}

function Tarjeta({ titulo, valor, sub }) {
  return (
    <div className="tarjeta">
      <small>{titulo}</small>
      <b>{valor}</b>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

function Aviso({ children, ok }) {
  if (!children) return null;
  return <div className={'aviso' + (ok ? ' aviso--ok' : '')}>{children}</div>;
}

function Vacio({ children }) {
  return <div className="vacio" style={{ borderColor: 'var(--linea)', color: 'var(--gris)' }}>{children}</div>;
}

/* ------------------------------------------------------------------ */
/* LOGIN                                                               */
/* ------------------------------------------------------------------ */
function Login() {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setError(''); setCargando(true);
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pass });
    setCargando(false);
    if (error) setError('Email o contraseña incorrectos.');
  }

  return (
    <div className="login-caja">
      <div className="logo logo-grande" style={{ marginBottom: 18, justifyContent: 'center', width: '100%' }}><LogoBadge /></div>
      <span className="etiqueta">Acceso del staff</span>
      <div style={{ height: 24 }} />
      <Aviso>{error}</Aviso>
      <form onSubmit={entrar}>
        <Campo label="Email">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required />
        </Campo>
        <Campo label="Contraseña">
          <input type="password" value={pass} onChange={e => setPass(e.target.value)} autoComplete="current-password" required />
        </Campo>
        <button className="btn btn--bloque" disabled={cargando}>
          {cargando ? <span className="cargando" /> : 'Entrar'}
        </button>
      </form>
      <p style={{ marginTop: 20, fontSize: '.78rem', color: 'var(--gris)', textAlign: 'center' }}>
        ¿Olvidaste la contraseña? Pedísela al administrador.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AGENDA DEL DÍA                                                      */
/* ------------------------------------------------------------------ */
function Agenda({ perfil, barberos }) {
  const [fecha, setFecha] = useState(hoyISO());
  const [barberoId, setBarberoId] = useState('');
  const [turnos, setTurnos] = useState(null);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setTurnos(null); setError('');
    let q = sb.from('turnos')
      .select('*, barberos(nombre), servicios(nombre)')
      .gte('inicio', inicioDeDia(fecha))
      .lt('inicio', finDeDia(fecha))
      .order('inicio');
    if (barberoId) q = q.eq('barbero_id', barberoId);
    const { data, error } = await q;
    if (error) { setError(err(error)); setTurnos([]); return; }
    setTurnos(data || []);
  }, [fecha, barberoId]);

  useEffect(() => { cargar(); }, [cargar]);

  async function cambiarEstado(t, estado) {
    const patch = { estado };
    if (estado === 'atendido') patch.cobrado = true;
    const { error } = await sb.from('turnos').update(patch).eq('id', t.id);
    if (error) { alert(err(error)); return; }
    cargar();
  }

  const activos = (turnos || []).filter(t => t.estado !== 'cancelado');
  const atendidos = (turnos || []).filter(t => t.estado === 'atendido');
  const ingresos = atendidos.reduce((s, t) => s + Number(t.precio || 0), 0);

  return (
    <>
      <h2>Agenda</h2>
      <p style={{ color: 'var(--gris)', textTransform: 'capitalize' }}>{fechaLarga(fecha + 'T12:00:00')}</p>

      <div className="filtros" style={{ marginTop: 20 }}>
        <Campo label="Día">
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
        </Campo>
        {perfil.rol === 'admin' && (
          <Campo label="Barbero">
            <select value={barberoId} onChange={e => setBarberoId(e.target.value)}>
              <option value="">Todos</option>
              {barberos.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
          </Campo>
        )}
        <button className="btn btn--fantasma btn--chico" onClick={() => setFecha(hoyISO())}>Hoy</button>
        <button className="btn btn--fantasma btn--chico" onClick={() => setFecha(sumarDias(fecha, -1))}>← Día anterior</button>
        <button className="btn btn--fantasma btn--chico" onClick={() => setFecha(sumarDias(fecha, 1))}>Día siguiente →</button>
      </div>

      <div className="tarjetas">
        <Tarjeta titulo="Turnos del día" valor={num(activos.length)} />
        <Tarjeta titulo="Atendidos" valor={num(atendidos.length)} sub={`${activos.length - atendidos.length} pendientes`} />
        <Tarjeta titulo="Facturado" valor={plata(ingresos)} sub="Solo turnos atendidos" />
        <Tarjeta titulo="Ticket promedio" valor={plata(atendidos.length ? ingresos / atendidos.length : 0)} />
      </div>

      <Aviso>{error}</Aviso>
      {turnos === null && <span className="cargando" />}
      {turnos && turnos.length === 0 && <Vacio>No hay turnos para este día.</Vacio>}
      {turnos && turnos.length > 0 && (
        <div className="tabla-envoltorio">
          <table className="tabla">
            <thead>
              <tr>
                <th>Hora</th><th>Barbero</th><th>Cliente</th><th>Servicio</th>
                <th>Precio</th><th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {turnos.map(t => (
                <tr key={t.id} style={{ opacity: t.estado === 'cancelado' ? .45 : 1 }}>
                  <td><b>{hora(t.inicio)}</b><div className="mini">{t.duracion_min} min</div></td>
                  <td>{t.barberos ? t.barberos.nombre : '—'}</td>
                  <td>
                    {t.cliente_nombre}
                    <div className="mini">
                      <a href={`https://wa.me/${t.cliente_telefono.replace(/\D/g, '')}`} target="_blank" rel="noopener">{t.cliente_telefono}</a>
                    </div>
                    {t.notas && <div className="mini" style={{ color: 'var(--acento)' }}>“{t.notas}”</div>}
                  </td>
                  <td>{t.servicios ? t.servicios.nombre : '—'}</td>
                  <td>{plata(t.precio)}</td>
                  <td><span className={'pill ' + t.estado}>{t.estado}</span></td>
                  <td>
                    <div className="acciones-fila">
                      {t.estado !== 'atendido' && <button className="icono-btn" onClick={() => cambiarEstado(t, 'atendido')}>Atendido</button>}
                      {t.estado !== 'ausente' && <button className="icono-btn" onClick={() => cambiarEstado(t, 'ausente')}>No vino</button>}
                      {t.estado !== 'cancelado' && <button className="icono-btn peligro" onClick={() => { if (confirm('¿Cancelar este turno?')) cambiarEstado(t, 'cancelado'); }}>Cancelar</button>}
                      {t.estado !== 'confirmado' && <button className="icono-btn" onClick={() => cambiarEstado(t, 'confirmado')}>Reabrir</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* TURNOS (buscador + alta manual)                                     */
/* ------------------------------------------------------------------ */
function Turnos({ perfil, barberos, servicios, catalogo }) {
  const [desde, setDesde] = useState(hoyISO());
  const [hasta, setHasta] = useState(sumarDias(hoyISO(), 14));
  const [barberoId, setBarberoId] = useState('');
  const [estado, setEstado] = useState('');
  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState(null);
  const [error, setError] = useState('');
  const [abrirAlta, setAbrirAlta] = useState(false);

  const cargar = useCallback(async () => {
    setLista(null); setError('');
    let q = sb.from('turnos')
      .select('*, barberos(nombre), servicios(nombre)')
      .gte('inicio', inicioDeDia(desde))
      .lt('inicio', finDeDia(hasta))
      .order('inicio');
    if (barberoId) q = q.eq('barbero_id', barberoId);
    if (estado) q = q.eq('estado', estado);
    const { data, error } = await q.limit(500);
    if (error) { setError(err(error)); setLista([]); return; }
    setLista(data || []);
  }, [desde, hasta, barberoId, estado]);

  useEffect(() => { cargar(); }, [cargar]);

  const filtrados = useMemo(() => {
    if (!lista) return null;
    const t = busca.trim().toLowerCase();
    if (!t) return lista;
    return lista.filter(x =>
      (x.cliente_nombre || '').toLowerCase().includes(t) ||
      (x.cliente_telefono || '').includes(t) ||
      (x.codigo || '').toLowerCase().includes(t));
  }, [lista, busca]);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2>Turnos</h2>
          <p style={{ color: 'var(--gris)' }}>Todo lo reservado en el rango elegido.</p>
        </div>
        <button className="btn btn--chico" onClick={() => setAbrirAlta(v => !v)}>
          {abrirAlta ? 'Cerrar' : '+ Cargar turno a mano'}
        </button>
      </div>

      {abrirAlta && (
        <AltaTurno perfil={perfil} barberos={barberos} servicios={servicios} catalogo={catalogo}
                   onListo={() => { setAbrirAlta(false); cargar(); }} />
      )}

      <div className="filtros" style={{ marginTop: 20 }}>
        <Campo label="Desde"><input type="date" value={desde} onChange={e => setDesde(e.target.value)} /></Campo>
        <Campo label="Hasta"><input type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></Campo>
        {perfil.rol === 'admin' && (
          <Campo label="Barbero">
            <select value={barberoId} onChange={e => setBarberoId(e.target.value)}>
              <option value="">Todos</option>
              {barberos.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
          </Campo>
        )}
        <Campo label="Estado">
          <select value={estado} onChange={e => setEstado(e.target.value)}>
            <option value="">Todos</option>
            {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </Campo>
        <Campo label="Buscar">
          <input placeholder="Nombre, teléfono o código" value={busca} onChange={e => setBusca(e.target.value)} />
        </Campo>
      </div>

      <Aviso>{error}</Aviso>
      {filtrados === null && <span className="cargando" />}
      {filtrados && filtrados.length === 0 && <Vacio>No hay turnos con esos filtros.</Vacio>}
      {filtrados && filtrados.length > 0 && (
        <div className="tabla-envoltorio">
          <table className="tabla">
            <thead>
              <tr><th>Fecha</th><th>Hora</th><th>Barbero</th><th>Cliente</th><th>Servicio</th><th>Precio</th><th>Estado</th><th>Código</th></tr>
            </thead>
            <tbody>
              {filtrados.map(t => (
                <tr key={t.id}>
                  <td>{fechaCorta(t.inicio)}</td>
                  <td>{hora(t.inicio)}</td>
                  <td>{t.barberos ? t.barberos.nombre : '—'}</td>
                  <td>{t.cliente_nombre}<div className="mini">{t.cliente_telefono}</div></td>
                  <td>{t.servicios ? t.servicios.nombre : '—'}</td>
                  <td>{plata(t.precio)}</td>
                  <td><span className={'pill ' + t.estado}>{t.estado}</span></td>
                  <td className="mini">{t.codigo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {filtrados && filtrados.length > 0 && (
        <p style={{ color: 'var(--gris)', fontSize: '.82rem', marginTop: 12 }}>
          {filtrados.length} turnos · {plata(filtrados.filter(t => t.estado === 'atendido').reduce((s, t) => s + Number(t.precio || 0), 0))} facturado
        </p>
      )}
    </>
  );
}

/* Alta manual (para el cliente que cae al local o llama por teléfono) */
function AltaTurno({ perfil, barberos, servicios, catalogo, onListo }) {
  const propio = perfil.rol === 'barbero' ? perfil.barbero_id : '';
  const [f, setF] = useState({
    barbero_id: propio || (barberos[0] ? barberos[0].id : ''),
    servicio_id: '', fecha: hoyISO(), hora: '10:00',
    cliente_nombre: '', cliente_telefono: '', notas: ''
  });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const disponibles = useMemo(() => catalogo
    .filter(c => c.barbero_id === f.barbero_id && c.servicios)
    .map(c => ({
      id: c.servicio_id,
      nombre: c.servicios.nombre,
      duracion_min: c.duracion_min || c.servicios.duracion_min,
      precio: c.precio != null ? c.precio : c.servicios.precio
    })), [catalogo, f.barbero_id]);

  useEffect(() => {
    if (disponibles.length && !disponibles.find(s => s.id === f.servicio_id)) {
      setF(v => ({ ...v, servicio_id: disponibles[0].id }));
    }
  }, [disponibles]);

  async function guardar(e) {
    e.preventDefault();
    setError(''); setGuardando(true);
    const s = disponibles.find(x => x.id === f.servicio_id);
    if (!s) { setError('Elegí un servicio.'); setGuardando(false); return; }
    const inicio = new Date(`${f.fecha}T${f.hora}:00`);
    const fin = new Date(inicio.getTime() + s.duracion_min * 60000);
    const codigo = Array.from({ length: 8 }, () => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('');
    const { error } = await sb.from('turnos').insert({
      barbero_id: f.barbero_id, servicio_id: f.servicio_id,
      inicio: inicio.toISOString(), fin: fin.toISOString(),
      duracion_min: s.duracion_min, precio: s.precio,
      cliente_nombre: f.cliente_nombre, cliente_telefono: f.cliente_telefono,
      notas: f.notas || null, codigo, origen: 'panel'
    });
    setGuardando(false);
    if (error) {
      setError(/exclu|superpos|conflict/i.test(error.message)
        ? 'Ese barbero ya tiene un turno en ese horario.'
        : err(error));
      return;
    }
    onListo();
  }

  return (
    <form className="caja" onSubmit={guardar} style={{ marginTop: 20 }}>
      <h3>Cargar turno a mano</h3>
      <Aviso>{error}</Aviso>
      <div className="fila-form">
        {perfil.rol === 'admin' && (
          <Campo label="Barbero">
            <select value={f.barbero_id} onChange={set('barbero_id')}>
              {barberos.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
          </Campo>
        )}
        <Campo label="Servicio">
          <select value={f.servicio_id} onChange={set('servicio_id')}>
            {disponibles.map(s => <option key={s.id} value={s.id}>{s.nombre} · {plata(s.precio)}</option>)}
          </select>
        </Campo>
        <Campo label="Fecha"><input type="date" value={f.fecha} onChange={set('fecha')} required /></Campo>
        <Campo label="Hora"><input type="time" value={f.hora} onChange={set('hora')} required /></Campo>
        <Campo label="Cliente"><input value={f.cliente_nombre} onChange={set('cliente_nombre')} required /></Campo>
        <Campo label="Teléfono"><input value={f.cliente_telefono} onChange={set('cliente_telefono')} required /></Campo>
        <Campo label="Notas"><input value={f.notas} onChange={set('notas')} /></Campo>
      </div>
      <button className="btn btn--chico" disabled={guardando} style={{ marginTop: 14 }}>
        {guardando ? <span className="cargando" /> : 'Guardar turno'}
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* ESTADÍSTICAS                                                        */
/* ------------------------------------------------------------------ */
function Estadisticas({ perfil }) {
  const [desde, setDesde] = useState(sumarDias(hoyISO(), -29));
  const [hasta, setHasta] = useState(hoyISO());
  const [filas, setFilas] = useState(null);
  const [porServicio, setPorServicio] = useState([]);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setFilas(null); setError('');
    const [r1, r2] = await Promise.all([
      sb.rpc('estadisticas', { p_desde: desde, p_hasta: hasta }),
      sb.from('turnos').select('precio,estado,servicios(nombre)')
        .gte('inicio', inicioDeDia(desde)).lt('inicio', finDeDia(hasta)).limit(2000)
    ]);
    if (r1.error) { setError(err(r1.error)); setFilas([]); return; }
    setFilas(r1.data || []);

    const mapa = {};
    (r2.data || []).filter(t => t.estado === 'atendido').forEach(t => {
      const n = t.servicios ? t.servicios.nombre : 'Otro';
      mapa[n] = mapa[n] || { nombre: n, cantidad: 0, ingresos: 0 };
      mapa[n].cantidad++;
      mapa[n].ingresos += Number(t.precio || 0);
    });
    setPorServicio(Object.values(mapa).sort((a, b) => b.ingresos - a.ingresos));
  }, [desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  const total = useMemo(() => (filas || []).reduce((acc, f) => ({
    turnos: acc.turnos + f.turnos,
    atendidos: acc.atendidos + f.atendidos,
    cancelados: acc.cancelados + f.cancelados,
    ingresos: acc.ingresos + Number(f.ingresos || 0)
  }), { turnos: 0, atendidos: 0, cancelados: 0, ingresos: 0 }), [filas]);

  const maxIngreso = Math.max(1, ...(filas || []).map(f => Number(f.ingresos || 0)));

  const rangos = [
    ['Hoy', hoyISO(), hoyISO()],
    ['Últimos 7 días', sumarDias(hoyISO(), -6), hoyISO()],
    ['Últimos 30 días', sumarDias(hoyISO(), -29), hoyISO()],
    ['Este mes', hoyISO().slice(0, 8) + '01', hoyISO()]
  ];

  return (
    <>
      <h2>Estadísticas</h2>
      <p style={{ color: 'var(--gris)' }}>
        {perfil.rol === 'admin' ? 'Cortes y ganancias de todo el equipo.' : 'Tus cortes y tus ganancias.'}
      </p>

      <div className="filtros" style={{ marginTop: 20 }}>
        <Campo label="Desde"><input type="date" value={desde} onChange={e => setDesde(e.target.value)} /></Campo>
        <Campo label="Hasta"><input type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></Campo>
        {rangos.map(([txt, d, h]) => (
          <button key={txt} className="btn btn--fantasma btn--chico"
                  onClick={() => { setDesde(d); setHasta(h); }}>{txt}</button>
        ))}
      </div>

      <div className="tarjetas">
        <Tarjeta titulo="Cortes atendidos" valor={num(total.atendidos)} sub={`${num(total.turnos)} turnos reservados`} />
        <Tarjeta titulo="Ganancia" valor={plata(total.ingresos)} sub="Suma de turnos atendidos" />
        <Tarjeta titulo="Ticket promedio" valor={plata(total.atendidos ? total.ingresos / total.atendidos : 0)} />
        <Tarjeta titulo="Cancelados" valor={num(total.cancelados)}
                 sub={total.turnos ? `${Math.round(total.cancelados / (total.turnos + total.cancelados) * 100)}% del total` : ''} />
      </div>

      <Aviso>{error}</Aviso>
      {filas === null && <span className="cargando" />}

      {filas && filas.length > 0 && (
        <div className="sub-seccion">
          <h3 style={{ marginBottom: 16 }}>Por barbero</h3>
          <div className="tabla-envoltorio">
            <table className="tabla">
              <thead>
                <tr><th>Barbero</th><th>Atendidos</th><th>Reservados</th><th>Cancelados</th><th>Ganancia</th><th style={{ width: '28%' }}></th></tr>
              </thead>
              <tbody>
                {filas.map(f => (
                  <tr key={f.barbero_id}>
                    <td><b>{f.barbero}</b></td>
                    <td>{num(f.atendidos)}</td>
                    <td>{num(f.turnos)}</td>
                    <td>{num(f.cancelados)}</td>
                    <td><b>{plata(f.ingresos)}</b></td>
                    <td>
                      <div className="barra-progreso">
                        <i style={{ width: (Number(f.ingresos || 0) / maxIngreso * 100) + '%' }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {porServicio.length > 0 && (
        <div className="sub-seccion">
          <h3 style={{ marginBottom: 16 }}>Servicios más pedidos</h3>
          <div className="tabla-envoltorio">
            <table className="tabla">
              <thead><tr><th>Servicio</th><th>Cantidad</th><th>Ganancia</th></tr></thead>
              <tbody>
                {porServicio.map(s => (
                  <tr key={s.nombre}>
                    <td>{s.nombre}</td><td>{num(s.cantidad)}</td><td>{plata(s.ingresos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* HORARIOS Y BLOQUEOS                                                 */
/* ------------------------------------------------------------------ */
function Horarios({ perfil, barberos }) {
  const inicial = perfil.rol === 'barbero' ? perfil.barbero_id : (barberos[0] ? barberos[0].id : '');
  const [barberoId, setBarberoId] = useState(inicial);
  const [franjas, setFranjas] = useState(null);
  const [bloqueos, setBloqueos] = useState(null);
  const [nueva, setNueva] = useState({ dia_semana: 2, hora_inicio: '10:00', hora_fin: '13:00' });
  const [bloq, setBloq] = useState({ inicio: '', fin: '', motivo: '' });
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    if (!barberoId) return;
    setError('');
    const [h, b] = await Promise.all([
      sb.from('horarios').select('*').eq('barbero_id', barberoId).order('dia_semana').order('hora_inicio'),
      sb.from('bloqueos').select('*').eq('barbero_id', barberoId).gte('fin', new Date().toISOString()).order('inicio')
    ]);
    if (h.error) setError(err(h.error));
    setFranjas(h.data || []);
    setBloqueos(b.data || []);
  }, [barberoId]);

  useEffect(() => { cargar(); }, [cargar]);

  async function agregarFranja(e) {
    e.preventDefault();
    const { error } = await sb.from('horarios').insert({
      barbero_id: barberoId,
      dia_semana: Number(nueva.dia_semana),
      hora_inicio: nueva.hora_inicio,
      hora_fin: nueva.hora_fin
    });
    if (error) { setError(err(error)); return; }
    cargar();
  }
  async function borrarFranja(id) {
    if (!confirm('¿Borrar esta franja horaria?')) return;
    const { error } = await sb.from('horarios').delete().eq('id', id);
    if (error) { setError(err(error)); return; }
    cargar();
  }
  async function alternarFranja(f) {
    await sb.from('horarios').update({ activo: !f.activo }).eq('id', f.id);
    cargar();
  }
  async function agregarBloqueo(e) {
    e.preventDefault();
    const { error } = await sb.from('bloqueos').insert({
      barbero_id: barberoId,
      inicio: new Date(bloq.inicio).toISOString(),
      fin: new Date(bloq.fin).toISOString(),
      motivo: bloq.motivo || null
    });
    if (error) { setError(err(error)); return; }
    setBloq({ inicio: '', fin: '', motivo: '' });
    cargar();
  }
  async function borrarBloqueo(id) {
    await sb.from('bloqueos').delete().eq('id', id);
    cargar();
  }

  return (
    <>
      <h2>Horarios</h2>
      <p style={{ color: 'var(--gris)' }}>
        Lo que se carga acá es lo que la web ofrece a los clientes. Si un día no está cargado, no se puede reservar.
      </p>

      {perfil.rol === 'admin' && (
        <div className="filtros" style={{ marginTop: 20 }}>
          <Campo label="Barbero">
            <select value={barberoId} onChange={e => setBarberoId(e.target.value)}>
              {barberos.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
          </Campo>
        </div>
      )}

      <Aviso>{error}</Aviso>

      <div className="sub-seccion">
        <div className="tabla-envoltorio">
          <table className="tabla">
            <thead><tr><th>Día</th><th>Franjas</th></tr></thead>
            <tbody>
              {DIAS.map((d, i) => {
                const delDia = (franjas || []).filter(f => f.dia_semana === i);
                return (
                  <tr key={i}>
                    <td style={{ width: 160 }}><b>{d}</b></td>
                    <td>
                      {delDia.length === 0 && <span className="mini">Cerrado</span>}
                      <div className="acciones-fila">
                        {delDia.map(f => (
                          <span key={f.id} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            border: '1px solid var(--linea)', padding: '5px 8px',
                            opacity: f.activo ? 1 : .4
                          }}>
                            {f.hora_inicio.slice(0, 5)} – {f.hora_fin.slice(0, 5)}
                            <button className="icono-btn" onClick={() => alternarFranja(f)}>{f.activo ? 'Pausar' : 'Activar'}</button>
                            <button className="icono-btn peligro" onClick={() => borrarFranja(f.id)}>✕</button>
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <form className="caja" onSubmit={agregarFranja} style={{ marginTop: 20 }}>
          <h3>Agregar franja</h3>
          <div className="fila-form">
            <Campo label="Día">
              <select value={nueva.dia_semana} onChange={e => setNueva({ ...nueva, dia_semana: e.target.value })}>
                {DIAS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </Campo>
            <Campo label="Desde"><input type="time" value={nueva.hora_inicio} onChange={e => setNueva({ ...nueva, hora_inicio: e.target.value })} /></Campo>
            <Campo label="Hasta"><input type="time" value={nueva.hora_fin} onChange={e => setNueva({ ...nueva, hora_fin: e.target.value })} /></Campo>
            <button className="btn btn--chico">Agregar</button>
          </div>
        </form>
      </div>

      <div className="sub-seccion">
        <h3 style={{ marginBottom: 12 }}>Francos y vacaciones</h3>
        <p style={{ color: 'var(--gris)', fontSize: '.88rem' }}>
          Un bloqueo tapa la agenda en ese rango, aunque el horario semanal diga que está abierto.
        </p>
        {bloqueos && bloqueos.length === 0 && <Vacio>Sin bloqueos cargados.</Vacio>}
        {bloqueos && bloqueos.length > 0 && (
          <div className="tabla-envoltorio">
            <table className="tabla">
              <thead><tr><th>Desde</th><th>Hasta</th><th>Motivo</th><th></th></tr></thead>
              <tbody>
                {bloqueos.map(b => (
                  <tr key={b.id}>
                    <td>{fechaCorta(b.inicio)} {hora(b.inicio)}</td>
                    <td>{fechaCorta(b.fin)} {hora(b.fin)}</td>
                    <td>{b.motivo || '—'}</td>
                    <td><button className="icono-btn peligro" onClick={() => borrarBloqueo(b.id)}>Borrar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form className="caja" onSubmit={agregarBloqueo} style={{ marginTop: 20 }}>
          <h3>Bloquear un rango</h3>
          <div className="fila-form">
            <Campo label="Desde"><input type="datetime-local" value={bloq.inicio} onChange={e => setBloq({ ...bloq, inicio: e.target.value })} required /></Campo>
            <Campo label="Hasta"><input type="datetime-local" value={bloq.fin} onChange={e => setBloq({ ...bloq, fin: e.target.value })} required /></Campo>
            <Campo label="Motivo"><input value={bloq.motivo} onChange={e => setBloq({ ...bloq, motivo: e.target.value })} placeholder="Vacaciones, franco, curso…" /></Campo>
            <button className="btn btn--chico">Bloquear</button>
          </div>
        </form>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* HABITUALES ("VIP") · clientes que vienen siempre el mismo día y hora */
/* No reserva nada solo: es el patrón que un workflow externo (n8n) usa */
/* para mandar el recordatorio por WhatsApp. Acá solo se carga y se ve  */
/* quién "toca" esta semana.                                            */
/* ------------------------------------------------------------------ */
function Habituales({ perfil, barberos, servicios, catalogo }) {
  const propio = perfil.rol === 'barbero' ? perfil.barbero_id : '';
  const [lista, setLista] = useState(null);
  const [horarios, setHorarios] = useState([]);
  const [bloqueos, setBloqueos] = useState([]);
  const [turnos, setTurnos] = useState([]);
  const [barberoId, setBarberoId] = useState('');
  const [abrirAlta, setAbrirAlta] = useState(false);
  const [editando, setEditando] = useState(null);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setError('');
    const desde = hoyISO(), hasta = sumarDias(hoyISO(), 21);
    let qh = sb.from('clientes_habituales').select('*').order('dia_semana').order('hora');
    if (barberoId) qh = qh.eq('barbero_id', barberoId);
    const [h, hor, bl, tu] = await Promise.all([
      qh,
      sb.from('horarios').select('barbero_id,dia_semana,hora_inicio,hora_fin,activo'),
      sb.from('bloqueos').select('barbero_id,inicio,fin').gte('fin', inicioDeDia(desde)).lte('inicio', finDeDia(hasta)),
      sb.from('turnos').select('barbero_id,cliente_telefono,inicio,estado')
        .gte('inicio', inicioDeDia(desde)).lte('inicio', finDeDia(hasta)).neq('estado', 'cancelado')
    ]);
    if (h.error) { setError(err(h.error)); setLista([]); return; }
    setLista(h.data || []);
    setHorarios(hor.data || []);
    setBloqueos(bl.data || []);
    setTurnos(tu.data || []);
  }, [barberoId]);

  useEffect(() => { cargar(); }, [cargar]);

  function duracionDe(row) {
    const c = catalogo.find(x => x.barbero_id === row.barbero_id && x.servicio_id === row.servicio_id);
    const s = servicios.find(x => x.id === row.servicio_id);
    return (c && c.duracion_min) || (s && s.duracion_min) || 30;
  }

  function estadoDe(row) {
    if (!row.activo) return { texto: 'Pausado', tipo: 'pausado', fecha: null };
    const fecha = proximaFecha(row.dia_semana, row.pausado_hasta);
    if (!fecha) return { texto: 'Sin próxima fecha', tipo: 'pausado', fecha: null };

    const inicio = new Date(`${fecha}T${row.hora}:00`);
    const fin = new Date(inicio.getTime() + duracionDe(row) * 60000);

    const yaConfirmado = turnos.some(t =>
      t.barbero_id === row.barbero_id &&
      t.cliente_telefono === row.cliente_telefono &&
      isoDeFecha(new Date(t.inicio)) === fecha);
    if (yaConfirmado) return { texto: 'Ya tiene turno esta semana', tipo: 'ok', fecha };

    const horarioActivo = horarios.some(h =>
      h.barbero_id === row.barbero_id && h.dia_semana === row.dia_semana && h.activo &&
      row.hora >= h.hora_inicio.slice(0, 5) && row.hora < h.hora_fin.slice(0, 5));
    const bloqueado = bloqueos.some(b =>
      (b.barbero_id === row.barbero_id || !b.barbero_id) &&
      new Date(b.inicio) < fin && new Date(b.fin) > inicio);

    if (!horarioActivo || bloqueado) {
      return { texto: 'Sin turno esta semana — el barbero no atiende ese día/horario', tipo: 'conflicto', fecha };
    }
    return { texto: 'Pendiente de confirmar', tipo: 'pendiente', fecha };
  }

  async function alternarActivo(row) {
    await sb.from('clientes_habituales').update({ activo: !row.activo }).eq('id', row.id);
    cargar();
  }
  async function borrar(id) {
    if (!confirm('¿Borrar este cliente habitual?')) return;
    await sb.from('clientes_habituales').delete().eq('id', id);
    cargar();
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2>Habituales</h2>
          <p style={{ color: 'var(--gris)' }}>
            Clientes que vienen siempre el mismo día. Esto no reserva nada solo:
            avisa cuándo le toca a cada uno y si hay algún problema con su horario habitual.
          </p>
        </div>
        <button className="btn btn--chico" onClick={() => { setEditando(null); setAbrirAlta(v => !v); }}>
          {abrirAlta ? 'Cerrar' : '+ Nuevo cliente habitual'}
        </button>
      </div>

      {perfil.rol === 'admin' && (
        <div className="filtros" style={{ marginTop: 20 }}>
          <Campo label="Barbero">
            <select value={barberoId} onChange={e => setBarberoId(e.target.value)}>
              <option value="">Todos</option>
              {barberos.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
          </Campo>
        </div>
      )}

      {(abrirAlta || editando) && (
        <FormaHabitual
          perfil={perfil} barberos={barberos} servicios={servicios} catalogo={catalogo}
          propio={propio} editando={editando}
          onListo={() => { setAbrirAlta(false); setEditando(null); cargar(); }}
          onCancelar={() => { setAbrirAlta(false); setEditando(null); }}
        />
      )}

      <Aviso>{error}</Aviso>
      {lista === null && <span className="cargando" />}
      {lista && lista.length === 0 && <Vacio>Todavía no cargaste clientes habituales.</Vacio>}
      {lista && lista.length > 0 && (
        <div className="tabla-envoltorio" style={{ marginTop: 20 }}>
          <table className="tabla">
            <thead>
              <tr><th>Cliente</th><th>Barbero</th><th>Servicio</th><th>Día y hora</th><th>Esta semana</th><th></th></tr>
            </thead>
            <tbody>
              {lista.map(row => {
                const b = barberos.find(x => x.id === row.barbero_id);
                const s = servicios.find(x => x.id === row.servicio_id);
                const est = estadoDe(row);
                return (
                  <tr key={row.id} style={{ opacity: row.activo ? 1 : .5 }}>
                    <td>
                      <b>{row.cliente_nombre}</b>
                      <div className="mini">
                        <a href={`https://wa.me/${row.cliente_telefono.replace(/\D/g, '')}`} target="_blank" rel="noopener">{row.cliente_telefono}</a>
                      </div>
                      {row.notas && <div className="mini">“{row.notas}”</div>}
                    </td>
                    <td>{b ? b.nombre : '—'}</td>
                    <td>{s ? s.nombre : '—'}</td>
                    <td>{DIAS[row.dia_semana]} · {row.hora}</td>
                    <td>
                      <span className={'pill ' + (est.tipo === 'ok' ? 'atendido' : est.tipo === 'conflicto' ? 'ausente' : est.tipo === 'pausado' ? 'cancelado' : 'confirmado')}>
                        {est.tipo === 'ok' ? 'Confirmado' : est.tipo === 'conflicto' ? 'Conflicto' : est.tipo === 'pausado' ? 'Pausado' : 'Pendiente'}
                      </span>
                      <div className="mini" style={{ marginTop: 4 }}>{est.texto}{est.fecha ? ` (${fechaCorta(est.fecha + 'T12:00:00')})` : ''}</div>
                    </td>
                    <td>
                      <div className="acciones-fila">
                        <button className="icono-btn" onClick={() => { setAbrirAlta(false); setEditando(row); }}>Editar</button>
                        <button className="icono-btn" onClick={() => alternarActivo(row)}>{row.activo ? 'Pausar' : 'Activar'}</button>
                        <button className="icono-btn peligro" onClick={() => borrar(row.id)}>Borrar</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function FormaHabitual({ perfil, barberos, servicios, catalogo, propio, editando, onListo, onCancelar }) {
  const [f, setF] = useState(editando ? {
    barbero_id: editando.barbero_id, servicio_id: editando.servicio_id,
    cliente_nombre: editando.cliente_nombre, cliente_telefono: editando.cliente_telefono,
    dia_semana: editando.dia_semana, hora: editando.hora, activo: editando.activo,
    pausado_hasta: editando.pausado_hasta || '', notas: editando.notas || ''
  } : {
    barbero_id: propio || (barberos[0] ? barberos[0].id : ''),
    servicio_id: '', cliente_nombre: '', cliente_telefono: '', activo: true,
    dia_semana: 5, hora: '18:00', pausado_hasta: '', notas: ''
  });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const disponibles = useMemo(() => catalogo
    .filter(c => c.barbero_id === f.barbero_id && c.servicios)
    .map(c => ({ id: c.servicio_id, nombre: c.servicios.nombre })), [catalogo, f.barbero_id]);

  useEffect(() => {
    if (disponibles.length && !disponibles.find(s => s.id === f.servicio_id)) {
      setF(v => ({ ...v, servicio_id: disponibles[0].id }));
    }
  }, [disponibles]);

  async function guardar(e) {
    e.preventDefault();
    setError(''); setGuardando(true);
    if (!f.servicio_id) { setError('Elegí un servicio.'); setGuardando(false); return; }
    const datos = {
      barbero_id: f.barbero_id, servicio_id: f.servicio_id,
      cliente_nombre: f.cliente_nombre, cliente_telefono: f.cliente_telefono,
      dia_semana: Number(f.dia_semana), hora: f.hora, activo: !!f.activo,
      pausado_hasta: f.pausado_hasta || null, notas: f.notas || null
    };
    const { error } = editando
      ? await sb.from('clientes_habituales').update(datos).eq('id', editando.id)
      : await sb.from('clientes_habituales').insert(datos);
    setGuardando(false);
    if (error) { setError(err(error)); return; }
    onListo();
  }

  return (
    <form className="caja" onSubmit={guardar} style={{ marginTop: 20 }}>
      <h3>{editando ? 'Editar cliente habitual' : 'Nuevo cliente habitual'}</h3>
      <Aviso>{error}</Aviso>
      <div className="fila-form">
        {perfil.rol === 'admin' && (
          <Campo label="Barbero">
            <select value={f.barbero_id} onChange={set('barbero_id')}>
              {barberos.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
          </Campo>
        )}
        <Campo label="Servicio">
          <select value={f.servicio_id} onChange={set('servicio_id')}>
            {disponibles.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </Campo>
        <Campo label="Cliente"><input value={f.cliente_nombre} onChange={set('cliente_nombre')} required /></Campo>
        <Campo label="Teléfono"><input value={f.cliente_telefono} onChange={set('cliente_telefono')} placeholder="+549..." required /></Campo>
        <Campo label="Día">
          <select value={f.dia_semana} onChange={set('dia_semana')}>
            {DIAS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </Campo>
        <Campo label="Hora"><input type="time" value={f.hora} onChange={set('hora')} required /></Campo>
        <Campo label="Pausado hasta (opcional)"><input type="date" value={f.pausado_hasta} onChange={set('pausado_hasta')} /></Campo>
        <Campo label="Notas"><input value={f.notas} onChange={set('notas')} placeholder="Ej: prefiere fade bajo" /></Campo>
      </div>
      <div className="acciones-fila">
        <button className="btn btn--chico" disabled={guardando}>{guardando ? <span className="cargando" /> : 'Guardar'}</button>
        <button type="button" className="btn btn--fantasma btn--chico" onClick={onCancelar}>Cancelar</button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* EQUIPO (solo admin)                                                 */
/* ------------------------------------------------------------------ */
function Equipo({ barberos, servicios, catalogo, recargar }) {
  const [editando, setEditando] = useState(null);
  const [error, setError] = useState('');

  const vacio = { nombre: '', apodo: '', bio: '', foto_url: '', instagram: '', orden: barberos.length + 1, activo: true };

  async function guardar(e) {
    e.preventDefault();
    const b = editando;
    const datos = {
      nombre: b.nombre, apodo: b.apodo || null, bio: b.bio || null,
      foto_url: b.foto_url || null, instagram: b.instagram || null,
      orden: Number(b.orden) || 0, activo: !!b.activo
    };
    const { error } = b.id
      ? await sb.from('barberos').update(datos).eq('id', b.id)
      : await sb.from('barberos').insert(datos);
    if (error) { setError(err(error)); return; }
    setEditando(null); setError(''); recargar();
  }

  async function alternarServicio(barberoId, servicioId, tiene) {
    const { error } = tiene
      ? await sb.from('barbero_servicios').delete().eq('barbero_id', barberoId).eq('servicio_id', servicioId)
      : await sb.from('barbero_servicios').insert({ barbero_id: barberoId, servicio_id: servicioId });
    if (error) { setError(err(error)); return; }
    recargar();
  }

  async function precioPropio(barberoId, servicioId, valor) {
    const precio = valor === '' ? null : Number(valor);
    const { error } = await sb.from('barbero_servicios').update({ precio })
      .eq('barbero_id', barberoId).eq('servicio_id', servicioId);
    if (error) setError(err(error)); else recargar();
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div><h2>Equipo</h2><p style={{ color: 'var(--gris)' }}>Barberos y qué servicio hace cada uno.</p></div>
        <button className="btn btn--chico" onClick={() => setEditando(vacio)}>+ Nuevo barbero</button>
      </div>

      <Aviso>{error}</Aviso>

      {editando && (
        <form className="caja" onSubmit={guardar} style={{ marginTop: 20 }}>
          <h3>{editando.id ? 'Editar barbero' : 'Nuevo barbero'}</h3>
          <div className="fila-form">
            <Campo label="Nombre"><input value={editando.nombre} onChange={e => setEditando({ ...editando, nombre: e.target.value })} required /></Campo>
            <Campo label="Apodo"><input value={editando.apodo || ''} onChange={e => setEditando({ ...editando, apodo: e.target.value })} /></Campo>
            <Campo label="Instagram (sin @)"><input value={editando.instagram || ''} onChange={e => setEditando({ ...editando, instagram: e.target.value })} /></Campo>
            <Campo label="Foto (URL)"><input value={editando.foto_url || ''} onChange={e => setEditando({ ...editando, foto_url: e.target.value })} /></Campo>
            <Campo label="Orden"><input type="number" value={editando.orden} onChange={e => setEditando({ ...editando, orden: e.target.value })} /></Campo>
            <Campo label="Activo">
              <select value={editando.activo ? '1' : '0'} onChange={e => setEditando({ ...editando, activo: e.target.value === '1' })}>
                <option value="1">Sí</option><option value="0">No</option>
              </select>
            </Campo>
          </div>
          <Campo label="Bio corta">
            <textarea rows="2" value={editando.bio || ''} onChange={e => setEditando({ ...editando, bio: e.target.value })} />
          </Campo>
          <div className="acciones-fila">
            <button className="btn btn--chico">Guardar</button>
            <button type="button" className="btn btn--fantasma btn--chico" onClick={() => setEditando(null)}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="tabla-envoltorio" style={{ marginTop: 20 }}>
        <table className="tabla">
          <thead><tr><th>Barbero</th><th>Servicios que hace</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {barberos.map(b => (
              <tr key={b.id}>
                <td>
                  <b>{b.nombre}</b>
                  <div className="mini">{b.apodo || ''}</div>
                  {!b.user_id && <div className="mini" style={{ color: 'var(--sangre)' }}>Sin acceso al panel</div>}
                </td>
                <td>
                  <div className="acciones-fila">
                    {servicios.map(s => {
                      const rel = catalogo.find(c => c.barbero_id === b.id && c.servicio_id === s.id);
                      return (
                        <span key={s.id} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          border: '1px solid var(--linea)', padding: '4px 8px',
                          opacity: rel ? 1 : .45
                        }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0, fontSize: '.78rem' }}>
                            <input type="checkbox" checked={!!rel} onChange={() => alternarServicio(b.id, s.id, !!rel)} />
                            {s.nombre}
                          </label>
                          {rel && (
                            <input
                              style={{ width: 90, padding: '2px 6px', fontSize: '.75rem' }}
                              placeholder={String(s.precio)}
                              defaultValue={rel.precio != null ? rel.precio : ''}
                              onBlur={e => precioPropio(b.id, s.id, e.target.value)}
                              title="Precio propio (vacío = precio general)"
                            />
                          )}
                        </span>
                      );
                    })}
                  </div>
                </td>
                <td><span className={'pill ' + (b.activo ? 'atendido' : 'cancelado')}>{b.activo ? 'activo' : 'inactivo'}</span></td>
                <td><button className="icono-btn" onClick={() => setEditando(b)}>Editar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="caja" style={{ marginTop: 24 }}>
        <h3>Dar acceso al panel a un barbero</h3>
        <p style={{ color: 'var(--gris)', fontSize: '.88rem', margin: 0 }}>
          1. En Supabase → <b>Authentication → Users → Add user</b>, creá el usuario con su email y una contraseña.<br />
          2. Copiá el UUID del usuario.<br />
          3. En <b>SQL Editor</b>, corré:
        </p>
        <pre style={{ background: 'var(--tinta)', padding: 14, overflowX: 'auto', fontSize: '.78rem', border: '1px solid var(--linea)' }}>
{`insert into perfiles (user_id, rol, barbero_id)
values ('UUID-DEL-USUARIO', 'barbero', 'UUID-DEL-BARBERO')
on conflict (user_id) do update
  set rol = 'barbero', barbero_id = excluded.barbero_id;

update barberos set user_id = 'UUID-DEL-USUARIO'
where id = 'UUID-DEL-BARBERO';`}
        </pre>
        <p style={{ color: 'var(--gris)', fontSize: '.82rem', margin: 0 }}>
          Los UUID de cada barbero están en Supabase → Table Editor → barberos.
        </p>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* SERVICIOS (solo admin)                                              */
/* ------------------------------------------------------------------ */
function Servicios({ servicios, recargar }) {
  const vacio = { nombre: '', descripcion: '', duracion_min: 30, precio: 0, activo: true, orden: servicios.length + 1 };
  const [ed, setEd] = useState(null);
  const [error, setError] = useState('');

  async function guardar(e) {
    e.preventDefault();
    const datos = {
      nombre: ed.nombre, descripcion: ed.descripcion || null,
      duracion_min: Number(ed.duracion_min), precio: Number(ed.precio),
      activo: !!ed.activo, orden: Number(ed.orden) || 0
    };
    const { error } = ed.id
      ? await sb.from('servicios').update(datos).eq('id', ed.id)
      : await sb.from('servicios').insert(datos);
    if (error) { setError(err(error)); return; }
    setEd(null); setError(''); recargar();
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div><h2>Servicios</h2><p style={{ color: 'var(--gris)' }}>La duración define cuánto ocupa el turno en la agenda.</p></div>
        <button className="btn btn--chico" onClick={() => setEd(vacio)}>+ Nuevo servicio</button>
      </div>

      <Aviso>{error}</Aviso>

      {ed && (
        <form className="caja" onSubmit={guardar} style={{ marginTop: 20 }}>
          <h3>{ed.id ? 'Editar servicio' : 'Nuevo servicio'}</h3>
          <div className="fila-form">
            <Campo label="Nombre"><input value={ed.nombre} onChange={e => setEd({ ...ed, nombre: e.target.value })} required /></Campo>
            <Campo label="Duración (min)"><input type="number" min="5" step="5" value={ed.duracion_min} onChange={e => setEd({ ...ed, duracion_min: e.target.value })} required /></Campo>
            <Campo label="Precio"><input type="number" min="0" step="500" value={ed.precio} onChange={e => setEd({ ...ed, precio: e.target.value })} required /></Campo>
            <Campo label="Orden"><input type="number" value={ed.orden} onChange={e => setEd({ ...ed, orden: e.target.value })} /></Campo>
            <Campo label="Activo">
              <select value={ed.activo ? '1' : '0'} onChange={e => setEd({ ...ed, activo: e.target.value === '1' })}>
                <option value="1">Sí</option><option value="0">No</option>
              </select>
            </Campo>
          </div>
          <Campo label="Descripción">
            <input value={ed.descripcion || ''} onChange={e => setEd({ ...ed, descripcion: e.target.value })} />
          </Campo>
          <div className="acciones-fila">
            <button className="btn btn--chico">Guardar</button>
            <button type="button" className="btn btn--fantasma btn--chico" onClick={() => setEd(null)}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="tabla-envoltorio" style={{ marginTop: 20 }}>
        <table className="tabla">
          <thead><tr><th>Servicio</th><th>Duración</th><th>Precio</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {servicios.map(s => (
              <tr key={s.id}>
                <td><b>{s.nombre}</b><div className="mini">{s.descripcion || ''}</div></td>
                <td>{s.duracion_min} min</td>
                <td>{plata(s.precio)}</td>
                <td><span className={'pill ' + (s.activo ? 'atendido' : 'cancelado')}>{s.activo ? 'activo' : 'oculto'}</span></td>
                <td><button className="icono-btn" onClick={() => setEd(s)}>Editar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* TIENDA (solo admin)                                                 */
/* ------------------------------------------------------------------ */
function Tienda() {
  const [lista, setLista] = useState(null);
  const [ed, setEd] = useState(null);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    const { data, error } = await sb.from('productos').select('*').order('orden');
    if (error) { setError(err(error)); setLista([]); return; }
    setLista(data || []);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const vacio = { nombre: '', descripcion: '', precio: 0, categoria: '', imagen_url: '', talles: '', stock: 0, destacado: false, activo: true, orden: (lista || []).length + 1 };

  async function guardar(e) {
    e.preventDefault();
    const datos = {
      nombre: ed.nombre, descripcion: ed.descripcion || null, precio: Number(ed.precio),
      categoria: ed.categoria || null, imagen_url: ed.imagen_url || null,
      talles: String(ed.talles || '').split(',').map(t => t.trim()).filter(Boolean),
      stock: Number(ed.stock) || 0, destacado: !!ed.destacado, activo: !!ed.activo,
      orden: Number(ed.orden) || 0
    };
    const { error } = ed.id
      ? await sb.from('productos').update(datos).eq('id', ed.id)
      : await sb.from('productos').insert(datos);
    if (error) { setError(err(error)); return; }
    setEd(null); setError(''); cargar();
  }

  async function borrar(id) {
    if (!confirm('¿Borrar este producto?')) return;
    await sb.from('productos').delete().eq('id', id);
    cargar();
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div><h2>Tienda</h2><p style={{ color: 'var(--gris)' }}>Lo que se muestra en la sección de ropa de la web.</p></div>
        <button className="btn btn--chico" onClick={() => setEd(vacio)}>+ Nuevo producto</button>
      </div>

      <Aviso>{error}</Aviso>

      {ed && (
        <form className="caja" onSubmit={guardar} style={{ marginTop: 20 }}>
          <h3>{ed.id ? 'Editar producto' : 'Nuevo producto'}</h3>
          <div className="fila-form">
            <Campo label="Nombre"><input value={ed.nombre} onChange={e => setEd({ ...ed, nombre: e.target.value })} required /></Campo>
            <Campo label="Precio"><input type="number" min="0" step="500" value={ed.precio} onChange={e => setEd({ ...ed, precio: e.target.value })} /></Campo>
            <Campo label="Categoría"><input value={ed.categoria || ''} onChange={e => setEd({ ...ed, categoria: e.target.value })} placeholder="Buzos, Remeras…" /></Campo>
            <Campo label="Talles (separados por coma)"><input value={Array.isArray(ed.talles) ? ed.talles.join(', ') : (ed.talles || '')} onChange={e => setEd({ ...ed, talles: e.target.value })} /></Campo>
            <Campo label="Stock"><input type="number" min="0" value={ed.stock} onChange={e => setEd({ ...ed, stock: e.target.value })} /></Campo>
            <Campo label="Orden"><input type="number" value={ed.orden} onChange={e => setEd({ ...ed, orden: e.target.value })} /></Campo>
            <Campo label="Destacado">
              <select value={ed.destacado ? '1' : '0'} onChange={e => setEd({ ...ed, destacado: e.target.value === '1' })}>
                <option value="0">No</option><option value="1">Sí</option>
              </select>
            </Campo>
            <Campo label="Visible">
              <select value={ed.activo ? '1' : '0'} onChange={e => setEd({ ...ed, activo: e.target.value === '1' })}>
                <option value="1">Sí</option><option value="0">No</option>
              </select>
            </Campo>
          </div>
          <Campo label="Imagen (URL)">
            <input value={ed.imagen_url || ''} onChange={e => setEd({ ...ed, imagen_url: e.target.value })} placeholder="https://…" />
          </Campo>
          <Campo label="Descripción">
            <input value={ed.descripcion || ''} onChange={e => setEd({ ...ed, descripcion: e.target.value })} />
          </Campo>
          <div className="acciones-fila">
            <button className="btn btn--chico">Guardar</button>
            <button type="button" className="btn btn--fantasma btn--chico" onClick={() => setEd(null)}>Cancelar</button>
          </div>
        </form>
      )}

      {lista === null && <span className="cargando" />}
      {lista && lista.length === 0 && <Vacio>Todavía no cargaste productos.</Vacio>}
      {lista && lista.length > 0 && (
        <div className="tabla-envoltorio" style={{ marginTop: 20 }}>
          <table className="tabla">
            <thead><tr><th>Producto</th><th>Precio</th><th>Talles</th><th>Stock</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {lista.map(p => (
                <tr key={p.id}>
                  <td><b>{p.nombre}</b><div className="mini">{p.categoria || ''}</div></td>
                  <td>{plata(p.precio)}</td>
                  <td className="mini">{(p.talles || []).join(' · ')}</td>
                  <td>{p.stock}</td>
                  <td><span className={'pill ' + (p.activo ? 'atendido' : 'cancelado')}>{p.activo ? 'visible' : 'oculto'}</span></td>
                  <td>
                    <div className="acciones-fila">
                      <button className="icono-btn" onClick={() => setEd(p)}>Editar</button>
                      <button className="icono-btn peligro" onClick={() => borrar(p.id)}>Borrar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* PANEL                                                               */
/* ------------------------------------------------------------------ */
function Panel({ sesion, perfil }) {
  const [tab, setTab] = useState('agenda');
  const [barberos, setBarberos] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [catalogo, setCatalogo] = useState([]);

  const recargar = useCallback(async () => {
    const [b, s, c] = await Promise.all([
      sb.from('barberos').select('*').order('orden'),
      sb.from('servicios').select('*').order('orden'),
      sb.from('barbero_servicios').select('barbero_id,servicio_id,precio,duracion_min,servicios(id,nombre,duracion_min,precio,activo)')
    ]);
    setBarberos(b.data || []);
    setServicios(s.data || []);
    setCatalogo(c.data || []);
  }, []);

  useEffect(() => { recargar(); }, [recargar]);

  const tabs = perfil.rol === 'admin'
    ? [['agenda', 'Agenda'], ['turnos', 'Turnos'], ['stats', 'Estadísticas'], ['horarios', 'Horarios'], ['habituales', 'Habituales'], ['equipo', 'Equipo'], ['servicios', 'Servicios'], ['tienda', 'Tienda']]
    : [['agenda', 'Mi agenda'], ['turnos', 'Mis turnos'], ['stats', 'Mis números'], ['horarios', 'Mi horario'], ['habituales', 'Mis habituales']];

  return (
    <>
      <div className="panel-barra">
        <div className="contenedor">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <a href="index.html" className="logo" aria-label={CFG.MARCA.nombreLargo}>
              <LogoMarca /><span className="marca">{CFG.MARCA.nombre}</span>
            </a>
            <span className="etiqueta">Panel</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span className="quien">
              {sesion.user.email} · <b style={{ color: 'var(--acento)' }}>{perfil.rol}</b>
            </span>
            <button className="btn btn--fantasma btn--chico" onClick={() => sb.auth.signOut()}>Salir</button>
          </div>
        </div>
      </div>

      <div className="contenedor">
        <div className="panel-tabs">
          {tabs.map(([k, txt]) => (
            <button key={k} className={tab === k ? 'activo' : ''} onClick={() => setTab(k)}>{txt}</button>
          ))}
        </div>
      </div>

      <div className="contenedor panel-cuerpo">
        {tab === 'agenda'    && <Agenda perfil={perfil} barberos={barberos} />}
        {tab === 'turnos'    && <Turnos perfil={perfil} barberos={barberos} servicios={servicios} catalogo={catalogo} />}
        {tab === 'stats'     && <Estadisticas perfil={perfil} />}
        {tab === 'horarios'  && <Horarios perfil={perfil} barberos={barberos} />}
        {tab === 'habituales' && <Habituales perfil={perfil} barberos={barberos} servicios={servicios} catalogo={catalogo} />}
        {tab === 'equipo'    && <Equipo barberos={barberos} servicios={servicios} catalogo={catalogo} recargar={recargar} />}
        {tab === 'servicios' && <Servicios servicios={servicios} recargar={recargar} />}
        {tab === 'tienda'    && <Tienda />}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* APP                                                                 */
/* ------------------------------------------------------------------ */
function App() {
  const [sesion, setSesion] = useState(undefined);   // undefined = cargando
  const [perfil, setPerfil] = useState(undefined);

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSesion(data.session || null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => {
      setSesion(s || null);
      setPerfil(undefined);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!sesion) { setPerfil(null); return; }
    sb.from('perfiles').select('*').eq('user_id', sesion.user.id).maybeSingle()
      .then(({ data }) => setPerfil(data || null));
  }, [sesion]);

  if (sesion === undefined) return <div className="contenedor" style={{ paddingTop: 60 }}><span className="cargando" /></div>;
  if (!sesion) return <Login />;
  if (perfil === undefined) return <div className="contenedor" style={{ paddingTop: 60 }}><span className="cargando" /></div>;
  if (!perfil) {
    return (
      <div className="login-caja">
        <h3>Sin permisos</h3>
        <p style={{ color: 'var(--gris)' }}>
          Tu usuario existe pero todavía no tiene un perfil asignado. Pedile al administrador que te dé de alta.
        </p>
        <button className="btn btn--fantasma btn--bloque" onClick={() => sb.auth.signOut()}>Salir</button>
      </div>
    );
  }
  return <Panel sesion={sesion} perfil={perfil} />;
}

ReactDOM.createRoot(document.getElementById('app')).render(<App />);
