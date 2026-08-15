/* =====================================================================
   BARBERÍA · Flujo de reserva (React 18 UMD + Babel standalone)
   4 pasos: barbero -> servicio -> día y hora -> datos.

   IMPORTANTE (seguridad):
   Esta pantalla NO escribe en ninguna tabla. Solo llama a 3 funciones
   del servidor: dias_disponibles, slots_disponibles y crear_turno.
   El precio, la duración y la validez del horario los decide Postgres.
   Si alguien manipula el JavaScript, no consigue nada.
   ===================================================================== */

const { useState, useEffect, useCallback, useMemo } = React;
const CFG = window.CONFIG;
const MARCA = CFG.MARCA;

// window.crearCliente() devuelve Supabase real si config.js está completo,
// o un cliente falso (guarda todo en localStorage) mientras no lo esté.
// Ver js/demo.js.
const sb = window.crearCliente({ auth: { persistSession: false } });

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */
const plata = (n) => '$ ' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });

const duracionTexto = (min) => {
  if (min >= 60) { const h = Math.floor(min / 60), r = min % 60; return r ? `${h} h ${r} min` : `${h} h`; }
  return `${min} min`;
};

const iniciales = (n) => (n || '').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

// Muestra la hora SIEMPRE en la zona del local, aunque el cliente esté de viaje
const hora = (iso) => new Intl.DateTimeFormat('es-AR', {
  hour: '2-digit', minute: '2-digit', hour12: false, timeZone: CFG.ZONA
}).format(new Date(iso));

const fechaLarga = (iso) => new Intl.DateTimeFormat('es-AR', {
  weekday: 'long', day: 'numeric', month: 'long', timeZone: CFG.ZONA
}).format(new Date(iso));

// 'YYYY-MM-DD' -> Date local sin corrimiento de zona
const deFecha = (s) => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); };

const DIAS_CORTOS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const MESES_CORTOS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

const waLink = (t) => `https://wa.me/${MARCA.whatsapp}?text=${encodeURIComponent(t)}`;

// Traduce el error crudo de Postgres a algo que entienda una persona
const mensajeError = (error) => {
  if (!error) return 'Algo salió mal. Probá de nuevo.';
  const m = error.message || '';
  if (m.includes('Failed to fetch')) return 'No pudimos conectarnos. Revisá tu internet.';
  // Los raise exception nuestros vienen limpios; los internos, no
  if (/permission denied|JWT|row-level/i.test(m)) return 'No autorizado.';
  return m.replace(/^.*?:\s*/, '') || 'Algo salió mal.';
};

/* ------------------------------------------------------------------ */
/* Piezas de interfaz                                                  */
/* ------------------------------------------------------------------ */
// Logo reconstruido en SVG: toma el color del texto que lo rodea, así funciona
// igual sobre fondo claro y oscuro, y escala sin pixelarse.
// Versión reducida (círculo + F) para tamaños chicos.
function LogoMarca() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <text x="50" y="67" textAnchor="middle" fill="currentColor"
            fontFamily="'Instrument Serif',Georgia,serif" fontSize="50">F</text>
    </svg>
  );
}

function Barra() {
  return (
    <div className="barra">
      <div className="contenedor">
        <a href="index.html" className="logo" aria-label={MARCA.nombreLargo}>
          <LogoMarca /><span className="marca">{MARCA.nombre} <small>Studio</small></span>
        </a>
        <a href="index.html" className="etiqueta" style={{ letterSpacing: '.22em' }}>Salir</a>
      </div>
    </div>
  );
}

function Pasos({ paso }) {
  return (
    <>
      <div className="pasos">
        {[1, 2, 3, 4].map(n => <i key={n} className={n <= paso ? 'hecho' : ''} />)}
      </div>
      <span className="paso-num">Paso {paso} de 4</span>
    </>
  );
}

function Resumen({ barbero, servicio, inicio }) {
  if (!barbero) return null;
  return (
    <div className="resumen">
      <span className="etiqueta">Tu reserva</span>
      <div className="fila"><span>Barbero</span><b>{barbero.nombre}</b></div>
      {servicio && <div className="fila"><span>Servicio</span><b>{servicio.nombre} · {duracionTexto(servicio.duracion_min)}</b></div>}
      {servicio && <div className="fila"><span>Precio</span><b>{plata(servicio.precio)}</b></div>}
      {inicio && <div className="fila"><span>Cuándo</span><b style={{ textTransform: 'capitalize' }}>{fechaLarga(inicio)} · {hora(inicio)}</b></div>}
    </div>
  );
}

function Aviso({ children, ok }) {
  if (!children) return null;
  return <div className={'aviso' + (ok ? ' aviso--ok' : '')}>{children}</div>;
}

/* ------------------------------------------------------------------ */
/* PASO 1 · Barbero                                                    */
/* ------------------------------------------------------------------ */
function PasoBarbero({ barberos, onElegir }) {
  return (
    <>
      <h2>Elegí con quién<br />te querés cortar</h2>
      <p className="bajada">Cada barbero tiene su agenda. Después elegís servicio y horario.</p>
      {barberos.length === 0 && <div className="vacio">No hay barberos disponibles en este momento.</div>}
      {barberos.map(b => (
        <button key={b.id} className="opcion" onClick={() => onElegir(b)}>
          <span className="avatar">{b.foto_url ? <img src={b.foto_url} alt="" /> : iniciales(b.nombre)}</span>
          <span className="texto">
            <b>{b.nombre}</b>
            <small>{b.bio || `Reservar con ${b.nombre.split(' ')[0]}`}</small>
          </span>
          <span style={{ opacity: .35 }}>→</span>
        </button>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* PASO 2 · Servicio                                                   */
/* ------------------------------------------------------------------ */
function PasoServicio({ barbero, servicios, onElegir, onVolver }) {
  return (
    <>
      <button className="volver" onClick={onVolver}>← Volver</button>
      <h2>Elegí el servicio</h2>
      <p className="bajada">Te atenderá <b>{barbero.nombre}</b>.</p>
      <Resumen barbero={barbero} />
      {servicios.length === 0 && <div className="vacio">Este barbero todavía no tiene servicios cargados.</div>}
      {servicios.map(s => (
        <button key={s.id} className="opcion" onClick={() => onElegir(s)}>
          <span className="texto">
            <b>{s.nombre}</b>
            <small>{s.descripcion || duracionTexto(s.duracion_min)}</small>
          </span>
          <span className="precio">{plata(s.precio)}</span>
        </button>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* PASO 3 · Día y hora                                                 */
/* ------------------------------------------------------------------ */
function PasoHorario({ barbero, servicio, onElegir, onVolver }) {
  const [dias, setDias] = useState(null);
  const [fecha, setFecha] = useState(null);
  const [slots, setSlots] = useState(null);
  const [error, setError] = useState('');

  // Días con cupo
  useEffect(() => {
    let vivo = true;
    sb.rpc('dias_disponibles', {
      p_barbero: barbero.id, p_servicio: servicio.id, p_dias: CFG.DIAS_VISIBLES
    }).then(({ data, error }) => {
      if (!vivo) return;
      if (error) { setError(mensajeError(error)); setDias([]); return; }
      setDias(data || []);
      const primero = (data || []).find(d => d.cupos > 0);
      if (primero) setFecha(primero.fecha);
    });
    return () => { vivo = false; };
  }, [barbero.id, servicio.id]);

  // Horarios del día elegido
  useEffect(() => {
    if (!fecha) { setSlots(null); return; }
    let vivo = true;
    setSlots(null);
    sb.rpc('slots_disponibles', {
      p_barbero: barbero.id, p_servicio: servicio.id, p_fecha: fecha
    }).then(({ data, error }) => {
      if (!vivo) return;
      if (error) { setError(mensajeError(error)); setSlots([]); return; }
      setSlots((data || []).map(r => r.inicio));
    });
    return () => { vivo = false; };
  }, [fecha, barbero.id, servicio.id]);

  return (
    <>
      <button className="volver" onClick={onVolver}>← Volver</button>
      <h2>Elegí día y hora</h2>
      <p className="bajada">Solo mostramos los horarios que están realmente libres.</p>
      <Resumen barbero={barbero} servicio={servicio} />
      <Aviso>{error}</Aviso>

      <span className="etiqueta">Próximos {CFG.DIAS_VISIBLES} días</span>
      <div className="tira-dias">
        {dias === null && <div style={{ padding: '20px 0' }}><span className="cargando" /></div>}
        {dias && dias.map(d => {
          const f = deFecha(d.fecha);
          return (
            <button key={d.fecha}
              className={'dia' + (fecha === d.fecha ? ' activo' : '')}
              disabled={d.cupos === 0}
              title={d.cupos === 0 ? 'Sin turnos disponibles' : `${d.cupos} horarios libres`}
              onClick={() => setFecha(d.fecha)}>
              <small>{DIAS_CORTOS[f.getDay()]}</small>
              <b>{f.getDate()}</b>
              <small>{MESES_CORTOS[f.getMonth()]}</small>
            </button>
          );
        })}
      </div>

      {fecha && (
        <div style={{ marginTop: 24 }}>
          <span className="etiqueta" style={{ textTransform: 'uppercase' }}>{fechaLarga(deFecha(fecha))}</span>
          <div style={{ height: 12 }} />
          {slots === null && <span className="cargando" />}
          {slots && slots.length === 0 && <div className="vacio">No quedan horarios ese día. Probá con otro.</div>}
          {slots && slots.length > 0 && (
            <>
              <div className="grilla-horas">
                {slots.map(s => (
                  <button key={s} className="hora" onClick={() => onElegir(s)}>{hora(s)}</button>
                ))}
              </div>
              <p className="ayuda" style={{ marginTop: 12, fontSize: '.8rem', color: 'rgba(11,11,12,.5)' }}>
                Duración del turno: {duracionTexto(servicio.duracion_min)}
              </p>
            </>
          )}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* PASO 4 · Datos del cliente                                          */
/* ------------------------------------------------------------------ */
function PasoDatos({ barbero, servicio, inicio, onListo, onVolver }) {
  const [form, setForm] = useState({ nombre: '', telefono: '', email: '', notas: '', trampa: '' });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const cambiar = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function enviar(e) {
    e.preventDefault();
    if (enviando) return;
    setError(''); setEnviando(true);
    const { data, error } = await sb.rpc('crear_turno', {
      p_barbero: barbero.id,
      p_servicio: servicio.id,
      p_inicio: inicio,
      p_nombre: form.nombre,
      p_telefono: form.telefono,
      p_email: form.email,
      p_notas: form.notas,
      p_trampa: form.trampa
    });
    setEnviando(false);
    if (error) { setError(mensajeError(error)); return; }
    onListo(data);
  }

  return (
    <>
      <button className="volver" onClick={onVolver}>← Volver</button>
      <h2>Tus datos</h2>
      <p className="bajada">Para confirmar el turno y reconocerte si volvés.</p>
      <Resumen barbero={barbero} servicio={servicio} inicio={inicio} />
      <Aviso>{error}</Aviso>

      <form onSubmit={enviar} noValidate>
        <div className="campo">
          <label htmlFor="nombre">Nombre y apellido <em>*</em></label>
          <input id="nombre" value={form.nombre} onChange={cambiar('nombre')}
                 autoComplete="name" maxLength={60} required />
        </div>
        <div className="campo">
          <label htmlFor="tel">Teléfono <em>*</em></label>
          <input id="tel" type="tel" value={form.telefono} onChange={cambiar('telefono')}
                 placeholder="11 5555-5555" autoComplete="tel" maxLength={20} required />
          <div className="ayuda">Lo usamos para avisarte si pasa algo con el turno.</div>
        </div>
        <div className="campo">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={form.email} onChange={cambiar('email')}
                 autoComplete="email" maxLength={120} />
        </div>
        <div className="campo">
          <label htmlFor="notas">¿Algo que quieras aclarar?</label>
          <textarea id="notas" rows="3" maxLength={300} value={form.notas} onChange={cambiar('notas')}
                    placeholder="Ej: vengo con mi hijo, quiero el mismo corte de la última vez…" />
        </div>

        {/* Honeypot: invisible para las personas, irresistible para los bots */}
        <div className="trampa" aria-hidden="true">
          <label>No completar</label>
          <input tabIndex={-1} autoComplete="off" value={form.trampa} onChange={cambiar('trampa')} />
        </div>

        <button className="btn btn--oscuro btn--bloque" disabled={enviando}>
          {enviando ? <span className="cargando" /> : 'Confirmar turno'}
        </button>
        <p className="ayuda" style={{ textAlign: 'center', marginTop: 14 }}>
          No se paga nada por adelantado. Abonás en el local.
        </p>
      </form>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* PANTALLA FINAL                                                      */
/* ------------------------------------------------------------------ */
function Listo({ turno }) {
  const texto = `¡Hola! Reservé un turno con ${turno.barbero} el ${fechaLarga(turno.inicio)} a las ${hora(turno.inicio)}. Código: ${turno.codigo}`;
  return (
    <div className="exito">
      <div className="tilde">✓</div>
      <h2>Turno confirmado</h2>
      <p className="bajada" style={{ textTransform: 'capitalize' }}>
        {fechaLarga(turno.inicio)} · {hora(turno.inicio)}
      </p>
      <div style={{ textAlign: 'left', marginTop: 8 }}>
        <Resumen
          barbero={{ nombre: turno.barbero }}
          servicio={{ nombre: turno.servicio, duracion_min: turno.duracion_min, precio: turno.precio }}
          inicio={turno.inicio}
        />
      </div>
      <span className="etiqueta">Tu código de turno</span>
      <div className="codigo">{turno.codigo}</div>
      <p className="ayuda" style={{ color: 'rgba(11,11,12,.55)' }}>
        Guardalo: con este código y tu teléfono podés cancelar desde la web.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 24 }}>
        <a className="btn btn--oscuro" target="_blank" rel="noopener" href={waLink(texto)}>Avisar por WhatsApp</a>
        <a className="btn btn--fantasma" style={{ color: 'var(--tinta)', borderColor: 'var(--linea-clara)' }} href="index.html">Volver al inicio</a>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* CANCELAR TURNO (#cancelar)                                          */
/* ------------------------------------------------------------------ */
function Cancelar() {
  const [codigo, setCodigo] = useState('');
  const [tel, setTel] = useState('');
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError(''); setMsg(null); setEnviando(true);
    const { data, error } = await sb.rpc('cancelar_turno', { p_codigo: codigo, p_telefono: tel });
    setEnviando(false);
    if (error) { setError(mensajeError(error)); return; }
    setMsg(data.mensaje);
  }

  return (
    <>
      <a className="volver" href="reservar.html" style={{ display: 'inline-block' }}>← Volver</a>
      <h2>Cancelar un turno</h2>
      <p className="bajada">Necesitás el código que te dimos al reservar y el teléfono que cargaste.</p>
      <Aviso>{error}</Aviso>
      <Aviso ok>{msg}</Aviso>
      <form onSubmit={enviar}>
        <div className="campo">
          <label>Código del turno <em>*</em></label>
          <input value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())}
                 placeholder="A1B2C3D4" maxLength={12} required style={{ letterSpacing: '.2em' }} />
        </div>
        <div className="campo">
          <label>Teléfono <em>*</em></label>
          <input type="tel" value={tel} onChange={e => setTel(e.target.value)} maxLength={20} required />
        </div>
        <button className="btn btn--oscuro btn--bloque" disabled={enviando}>
          {enviando ? <span className="cargando" /> : 'Cancelar turno'}
        </button>
      </form>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* APP                                                                 */
/* ------------------------------------------------------------------ */
function App() {
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [barberos, setBarberos] = useState([]);
  const [catalogo, setCatalogo] = useState([]);   // barbero_servicios + servicios
  const [barbero, setBarbero] = useState(null);
  const [servicio, setServicio] = useState(null);
  const [inicio, setInicio] = useState(null);
  const [turno, setTurno] = useState(null);
  const [modoCancelar, setModoCancelar] = useState(location.hash === '#cancelar');

  useEffect(() => {
    const onHash = () => setModoCancelar(location.hash === '#cancelar');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Carga inicial
  useEffect(() => {
    (async () => {
      const [rb, rs] = await Promise.all([
        sb.from('barberos').select('id,nombre,apodo,bio,foto_url,instagram,orden').eq('activo', true).order('orden'),
        sb.from('barbero_servicios').select('barbero_id,servicio_id,precio,duracion_min,servicios(id,nombre,descripcion,duracion_min,precio,activo,orden)')
      ]);
      if (rb.error || rs.error) {
        setErrorCarga(mensajeError(rb.error || rs.error));
        setCargando(false);
        return;
      }
      setBarberos(rb.data || []);
      setCatalogo(rs.data || []);
      setCargando(false);

      // ?barbero=<uuid> desde la landing: salta al paso 2
      const pedido = new URLSearchParams(location.search).get('barbero');
      if (pedido) {
        const b = (rb.data || []).find(x => x.id === pedido);
        if (b) setBarbero(b);
      }
    })();
  }, []);

  // Servicios reales del barbero elegido (con su precio/duración propios)
  const serviciosDelBarbero = useMemo(() => {
    if (!barbero) return [];
    return catalogo
      .filter(r => r.barbero_id === barbero.id && r.servicios && r.servicios.activo)
      .map(r => ({
        id: r.servicios.id,
        nombre: r.servicios.nombre,
        descripcion: r.servicios.descripcion,
        duracion_min: r.duracion_min || r.servicios.duracion_min,
        precio: r.precio != null ? r.precio : r.servicios.precio,
        orden: r.servicios.orden
      }))
      .sort((a, b) => a.orden - b.orden);
  }, [barbero, catalogo]);

  const paso = turno ? 4 : (!barbero ? 1 : !servicio ? 2 : !inicio ? 3 : 4);

  let contenido;
  if (modoCancelar) {
    contenido = <Cancelar />;
  } else if (cargando) {
    contenido = <p className="etiqueta"><span className="cargando" /> Cargando…</p>;
  } else if (errorCarga) {
    contenido = (
      <>
        <Aviso>{errorCarga}</Aviso>
        <p>No pudimos cargar la agenda. Escribinos por WhatsApp y te damos el turno a mano.</p>
        <a className="btn btn--oscuro" target="_blank" rel="noopener" href={waLink('¡Hola! Quería sacar un turno.')}>Escribir por WhatsApp</a>
      </>
    );
  } else if (turno) {
    contenido = <Listo turno={turno} />;
  } else if (!barbero) {
    contenido = <PasoBarbero barberos={barberos} onElegir={setBarbero} />;
  } else if (!servicio) {
    contenido = <PasoServicio barbero={barbero} servicios={serviciosDelBarbero}
                              onElegir={setServicio} onVolver={() => setBarbero(null)} />;
  } else if (!inicio) {
    contenido = <PasoHorario barbero={barbero} servicio={servicio}
                             onElegir={setInicio} onVolver={() => setServicio(null)} />;
  } else {
    contenido = <PasoDatos barbero={barbero} servicio={servicio} inicio={inicio}
                           onListo={setTurno} onVolver={() => setInicio(null)} />;
  }

  return (
    <>
      <Barra />
      <div className="reserva-cuerpo">
        {!modoCancelar && !turno && !cargando && !errorCarga && <Pasos paso={paso} />}
        {contenido}
        {!modoCancelar && !turno && (
          <p style={{ marginTop: 40, textAlign: 'center', fontSize: '.82rem', color: 'rgba(11,11,12,.45)' }}>
            ¿Ya tenés un turno y no podés venir? <a href="#cancelar" style={{ textDecoration: 'underline' }}>Cancelalo acá</a>.
          </p>
        )}
      </div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('app')).render(<App />);
