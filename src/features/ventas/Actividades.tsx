/**
 * VENTA · Actividades.
 *
 * Una actividad es un contacto con el cliente: una llamada, un WhatsApp, una visita. Se carga para
 * dos cosas distintas —dejar registrado lo que ya pasó, y anotar lo que hay que hacer— y el estado
 * es lo que las separa.
 *
 * El orden de la pantalla no es casual: **primero el cliente**. Los contactos que se pueden elegir
 * son los de ESA cuenta y de ninguna otra, así que preguntarlos antes obligaría a buscar entre
 * todos los contactos del CRM a alguien que después puede no corresponder.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Desplegable } from '@/components/ui/Desplegable'
import { DesplegableMulti } from '@/components/ui/DesplegableMulti'
import { SelectorBuscable } from '@/components/ui/SelectorBuscable'
import {
  completarActividad,
  crearActividad,
  esFutura,
  estadoSegunFecha,
  etiquetasDeActividad,
  faltaParaLaActividad,
  hoyEnArgentina,
  aFechaCorta,
  misActividadesPendientes,
  nombreDeActividad,
  type ActividadPendiente,
} from '@/services/monday/actividades'
import { ESTADO_ACTIVIDAD } from '@/services/monday/columns'
import {
  contactosDelCrm,
  cuentasDelCrm,
  type ContactoCrm,
  type CuentaCrm,
} from '@/services/monday/crm'
import { SinAcceso } from '@/services/monday/sdk'

const mensaje = (e: unknown): string => (e instanceof Error ? e.message : String(e))

const VACIA = {
  tipo: '',
  fecha: hoyEnArgentina(),
  hora: '',
  descripcion: '',
  cuentaId: '',
  contactoIds: [] as string[],
}

/** La actividad futura arranca sin fecha: la de hoy no le serviría, tiene que ser posterior. */
const PROYECTADA_VACIA = { tipo: '', fecha: '', hora: '', descripcion: '' }

export function Actividades() {
  const [cuentas, setCuentas] = useState<CuentaCrm[]>([])
  const [contactos, setContactos] = useState<ContactoCrm[]>([])
  const [opciones, setOpciones] = useState({ tipos: [] as string[], estados: [] as string[] })

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)

  /** Los dos trabajos: cargar una actividad, o cerrar las que quedaron abiertas. */
  const [trabajo, setTrabajo] = useState<'cargar' | 'pendientes'>('cargar')

  const [pendientes, setPendientes] = useState<ActividadPendiente[]>([])
  const [cerrando, setCerrando] = useState<string | null>(null)

  const [datos, setDatos] = useState(VACIA)
  /** El estado elegido a mano. Vacío = el que corresponde por la fecha. */
  const [estadoElegido, setEstadoElegido] = useState('')

  /**
   * La actividad que queda agendada a partir de ésta.
   *
   * De una llamada que ya se hizo casi siempre sale un "lo vuelvo a llamar el martes". Si eso hay
   * que cargarlo en una segunda vuelta por la misma pantalla, no se carga: se anota en un papel.
   * Acá sale junto con la que se está cerrando, y queda como una actividad aparte —pendiente— en
   * el mismo cliente y con los mismos contactos.
   */
  const [proyectar, setProyectar] = useState(false)
  const [proyectada, setProyectada] = useState(PROYECTADA_VACIA)

  const recargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [c, k, et, mias] = await Promise.all([
        cuentasDelCrm(),
        contactosDelCrm(),
        etiquetasDeActividad(),
        misActividadesPendientes(),
      ])
      setCuentas(c)
      setContactos(k)
      setOpciones(et)
      setPendientes(mias)
    } catch (e) {
      setError(
        e instanceof SinAcceso
          ? 'la app tiene que abrirse desde monday para leer el CRM.'
          : mensaje(e),
      )
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void recargar()
  }, [recargar])

  /** Sólo los contactos de la cuenta elegida: los de otra no tienen nada que ver con esto. */
  const contactosDeLaCuenta = useMemo(
    () => contactos.filter((c) => datos.cuentaId && c.cuentaIds.includes(datos.cuentaId)),
    [contactos, datos.cuentaId],
  )

  /* El primer día que acepta la actividad proyectada. */
  const manana = new Date(Date.now() + 864e5).toISOString().slice(0, 10)

  const futura = esFutura(datos.fecha)
  const sugerido = estadoSegunFecha(datos.fecha)

  /* Una actividad a futuro no puede estar hecha: nadie llamó mañana. Si estaba marcada como
     completada y se mueve la fecha hacia adelante, se corrige sola en vez de quedar mintiendo. */
  const estado = futura ? ESTADO_ACTIVIDAD.PENDIENTE : estadoElegido || sugerido

  const alCambiarFecha = (fecha: string) => {
    setDatos((d) => ({ ...d, fecha }))
    if (esFutura(fecha) && estadoElegido === ESTADO_ACTIVIDAD.COMPLETADA) setEstadoElegido('')
  }

  const atrasadas = pendientes.filter((p) => p.atrasada).length

  /** Dar por hecha una de las propias. Es lo único que esta pantalla le cambia a una que ya existe. */
  const cerrar = async (a: ActividadPendiente) => {
    setCerrando(a.id)
    setErrorEnvio(null)
    try {
      await completarActividad(a.id)
      /* Se saca de la lista en el acto y no se recarga todo: lo que acaba de cerrarse ya no es
         pendiente, y esperar a monday para que desaparezca se siente roto. */
      setPendientes((v) => v.filter((x) => x.id !== a.id))
      setHecho(`${a.nombre} quedó completada.`)
    } catch (e) {
      setErrorEnvio(`No se pudo cerrar ${a.nombre}: ${mensaje(e)}`)
    } finally {
      setCerrando(null)
    }
  }

  const nombreCuenta = cuentas.find((c) => c.id === datos.cuentaId)?.nombre ?? ''
  const paraMonday = { ...datos, estado, cuentaNombre: nombreCuenta }
  const faltan = faltaParaLaActividad(paraMonday)

  /* ---------------- la actividad proyectada ---------------- */

  /* Sólo tiene sentido después de algo que ya pasó: de una llamada hecha sale "lo vuelvo a llamar
     el martes". Si la de arriba todavía no ocurrió, agendar su continuación es adivinar. */
  const puedeProyectar = estado === ESTADO_ACTIVIDAD.COMPLETADA

  const faltanProyectada = !proyectar
    ? []
    : [
        ...(proyectada.tipo ? [] : ['el tipo de la actividad futura']),
        ...(proyectada.fecha ? [] : ['la fecha de la actividad futura']),
        ...(proyectada.hora ? [] : ['la hora de la actividad futura']),
        ...(proyectada.fecha && !esFutura(proyectada.fecha)
          ? ['que la actividad futura sea posterior a hoy']
          : []),
      ]

  const guardar = async () => {
    setEnviando(true)
    setErrorEnvio(null)
    setHecho(null)
    try {
      const r = await crearActividad(paraMonday)
      const donde = nombreCuenta || 'la cuenta'

      /* La proyectada se crea después y por separado: es otra actividad, con su propia fecha y su
         propio estado. Si falla, la de arriba ya quedó: se dice y no se finge que no se creó nada. */
      if (proyectar && faltanProyectada.length === 0) {
        try {
          const p = await crearActividad({
            ...proyectada,
            estado: ESTADO_ACTIVIDAD.PENDIENTE,
            cuentaId: datos.cuentaId,
            cuentaNombre: nombreCuenta,
            contactoIds: datos.contactoIds,
          })
          setHecho(
            `${r.nombre} quedó ${estado.toLowerCase()} en ${donde}, y ${p.nombre} quedó agendada como ${ESTADO_ACTIVIDAD.PENDIENTE}.`,
          )
        } catch (e) {
          setHecho(`${r.nombre} quedó ${estado.toLowerCase()} en ${donde}.`)
          setErrorEnvio(`La actividad futura no se pudo crear: ${mensaje(e)}`)
        }
      } else {
        setHecho(`${r.nombre} quedó ${estado.toLowerCase()} en ${donde}.`)
      }

      setDatos({ ...VACIA, cuentaId: datos.cuentaId })
      setEstadoElegido('')
      setProyectar(false)
      setProyectada(PROYECTADA_VACIA)
    } catch (e) {
      setErrorEnvio(mensaje(e))
    } finally {
      setEnviando(false)
    }
  }

  /* Los estados que la app ofrece. El tablero tiene cinco; de acá salen dos, y los otros los mueve
     quien trabaja el tablero. */
  const estadosOfrecidos = [ESTADO_ACTIVIDAD.COMPLETADA, ESTADO_ACTIVIDAD.PENDIENTE].filter(
    (e) => opciones.estados.length === 0 || opciones.estados.includes(e),
  )

  return (
    <div className="scroll">
      <div className="view">
        <div className="sec-head">
          <span className="sec-num">
            <i className="fa-solid fa-calendar-check" aria-hidden="true" />
          </span>
          <span className="sec-txt">
            <span className="sec-tit">Actividades</span>
            <span className="sec-det">
              Lo que se habló con un cliente y lo que falta hablar: llamadas, WhatsApp, visitas. El
              responsable sos vos, por estar usando la app.
            </span>
          </span>
        </div>

        <div className="decision decision--grande decision--elige">
          <button
            type="button"
            aria-pressed={trabajo === 'cargar'}
            className={`opcion opcion--confirmar${trabajo === 'cargar' ? ' opcion--elegida' : ''}`}
            onClick={() => setTrabajo('cargar')}
          >
            <span className="opcion-ic">
              <i className="fa-solid fa-calendar-plus" aria-hidden="true" />
            </span>
            <span className="opcion-txt">
              <span className="opcion-tit">Cargar una actividad</span>
              <span className="opcion-det">
                Lo que se habló con un cliente, o lo que queda agendado.
              </span>
            </span>
          </button>

          <button
            type="button"
            aria-pressed={trabajo === 'pendientes'}
            className={`opcion opcion--proponer${trabajo === 'pendientes' ? ' opcion--elegida' : ''}`}
            onClick={() => setTrabajo('pendientes')}
          >
            <span className="opcion-ic">
              <i className="fa-solid fa-list-check" aria-hidden="true" />
            </span>
            <span className="opcion-txt">
              <span className="opcion-tit">Lo que tengo pendiente</span>
              <span className="opcion-det">
                Dar por hechas las actividades que quedaron abiertas.
              </span>
              <span
                className={`opcion-req ${
                  atrasadas > 0
                    ? 'opcion-req--falta'
                    : pendientes.length > 0
                      ? 'opcion-req--aviso'
                      : 'opcion-req--ok'
                }`}
              >
                <i className="fa-solid fa-clock" aria-hidden="true" />
                {pendientes.length === 0
                  ? 'Nada pendiente'
                  : atrasadas > 0
                    ? `${pendientes.length} pendiente${pendientes.length === 1 ? '' : 's'} · ${atrasadas} atrasada${atrasadas === 1 ? '' : 's'}`
                    : `${pendientes.length} pendiente${pendientes.length === 1 ? '' : 's'}`}
              </span>
            </span>
          </button>
        </div>

        {error && (
          <div className="aviso aviso--error" style={{ marginTop: 14 }}>
            <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
            <span>No se pudo leer el CRM: {error}</span>
          </div>
        )}

        {hecho && (
          <div className="aviso aviso--ok" style={{ marginTop: 14 }}>
            <i className="fa-solid fa-circle-check" aria-hidden="true" />
            <span>{hecho}</span>
          </div>
        )}

        {errorEnvio && (
          <div className="aviso aviso--error" style={{ marginTop: 14 }}>
            <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
            <span>No se pudo cargar la actividad: {errorEnvio}</span>
          </div>
        )}

        {trabajo === 'cargar' && (
          <div className="card card--flush op-editor" style={{ marginTop: 14 }}>
            <div className="ctitle op-editor-head">
              <span className="op-editor-nom">
                <i className="fa-solid fa-calendar-plus" aria-hidden="true" /> Una actividad nueva
              </span>
              <span className="op-editor-chips">
                <span className={`chip ${futura ? 'chip--ambar' : 'chip--verde'}`}>{estado}</span>
              </span>
            </div>

            <div className="op-editor-cuerpo form-moderno">
              {/* Primero el cliente: de él dependen los contactos que se pueden elegir. */}
              <div className="campo">
                <span className="campo-lbl">
                  El cliente <span className="campo-req">· obligatorio</span>
                </span>
                <SelectorBuscable
                  valor={datos.cuentaId}
                  opciones={cuentas.map((c) => ({
                    valor: c.id,
                    rotulo: c.nombre,
                    detalle: [c.cuit && `CUIT ${c.cuit}`, c.clasificacion]
                      .filter(Boolean)
                      .join(' · '),
                  }))}
                  vacio={cargando ? 'Cargando cuentas…' : 'Escribí el nombre o el CUIT'}
                  queSon="clientes"
                  bloqueado={cargando}
                  onCambiar={(v) => setDatos({ ...datos, cuentaId: v, contactoIds: [] })}
                />
              </div>

              {datos.cuentaId && (
                <div className="campo" style={{ marginTop: 14 }}>
                  <span className="campo-lbl">Contactos involucrados</span>
                  {contactosDeLaCuenta.length === 0 ? (
                    <span className="campo-ayuda campo-ayuda--aviso">
                      Esta cuenta todavía no tiene contactos cargados. La actividad se puede guardar
                      igual, pero conviene darlos de alta en «Alta de cuentas y contactos».
                    </span>
                  ) : (
                    <>
                      <DesplegableMulti
                        valores={datos.contactoIds}
                        /* Con el mail y el WhatsApp a la vista: dos personas de la misma empresa
                         pueden llamarse parecido, y lo que las distingue es cómo se les escribe. */
                        opciones={contactosDeLaCuenta.map((c) => ({
                          valor: c.id,
                          rotulo: c.nombre,
                          detalle: [c.email, c.whatsapp].filter(Boolean).join(' · '),
                        }))}
                        vacio="Elegir…"
                        buscable={contactosDeLaCuenta.length > 6}
                        onCambiar={(ids) => setDatos({ ...datos, contactoIds: ids })}
                      />
                      <span className="campo-ayuda">
                        Tildá con qué contactos se hizo o se va a efectuar la actividad.
                      </span>
                    </>
                  )}
                </div>
              )}

              <div className="datos datos--form" style={{ marginTop: 14 }}>
                <div className="campo">
                  <span className="campo-lbl">
                    Tipo de actividad <span className="campo-req">· obligatorio</span>
                  </span>
                  <Desplegable
                    valor={datos.tipo}
                    opciones={opciones.tipos}
                    vacio="Elegir…"
                    bloqueado={cargando}
                    onCambiar={(v) => setDatos({ ...datos, tipo: v })}
                  />
                </div>

                <label className="campo">
                  <span className="campo-lbl">
                    Fecha <span className="campo-req">· obligatorio</span>
                  </span>
                  <input
                    className="input"
                    type="date"
                    value={datos.fecha}
                    onChange={(e) => alCambiarFecha(e.target.value)}
                  />
                </label>

                <label className="campo">
                  <span className="campo-lbl">Hora</span>
                  <input
                    className="input"
                    type="time"
                    value={datos.hora}
                    onChange={(e) => setDatos({ ...datos, hora: e.target.value })}
                  />
                  <span className="campo-ayuda">Opcional.</span>
                </label>

                <div className="campo">
                  <span className="campo-lbl">Estado</span>
                  <Desplegable
                    valor={estado}
                    opciones={futura ? [ESTADO_ACTIVIDAD.PENDIENTE] : estadosOfrecidos}
                    bloqueado={futura || cargando}
                    onCambiar={setEstadoElegido}
                  />
                  {/* La fecha decide: lo que ya pasó se guarda como hecho y lo que viene, como
                    pendiente. Nadie llamó mañana, y una actividad futura marcada como completada
                    envenena cualquier lista de "qué me queda por hacer". */}
                  <span className={`campo-ayuda ${futura ? 'campo-ayuda--aviso' : ''}`}>
                    {futura
                      ? 'Es a futuro, así que va como Pendiente: todavía no pasó.'
                      : 'Hasta hoy inclusive se guarda como Completada.'}
                  </span>
                </div>
              </div>

              <label className="campo campo--suelto">
                <span className="campo-lbl">Descripción / resolución / observaciones</span>
                <textarea
                  className="input textarea"
                  rows={4}
                  placeholder="Qué se habló, qué quedó pendiente, con qué se sigue."
                  value={datos.descripcion}
                  onChange={(e) => setDatos({ ...datos, descripcion: e.target.value })}
                />
              </label>

              {/* ---- la actividad que queda agendada ---- */}
              {puedeProyectar && (
                <div className="proyectada">
                  <button
                    type="button"
                    className="interruptor"
                    role="switch"
                    aria-checked={proyectar}
                    onClick={() => setProyectar((v) => !v)}
                  >
                    <span
                      className={`interruptor-palanca${proyectar ? ' interruptor-palanca--on' : ''}`}
                    >
                      <span className="interruptor-bolita" />
                    </span>
                    <span className="interruptor-txt">
                      <span className="interruptor-tit">¿Querés dejar agendada la próxima?</span>
                      <span className="interruptor-det">
                        Se crea como una actividad <b>aparte</b>, pendiente, en el mismo cliente y
                        con los mismos contactos.
                      </span>
                    </span>
                  </button>

                  {proyectar && (
                    <div className="proyectada-caja">
                      <span className="proyectada-tit">
                        <i className="fa-solid fa-calendar-plus" aria-hidden="true" /> Actividad
                        proyectada
                        <small> · tiene que ser posterior a hoy</small>
                      </span>

                      <div className="datos datos--form">
                        <div className="campo">
                          <span className="campo-lbl">
                            Tipo de actividad <span className="campo-req">· obligatorio</span>
                          </span>
                          <Desplegable
                            valor={proyectada.tipo}
                            opciones={opciones.tipos}
                            vacio="Elegir…"
                            bloqueado={cargando}
                            onCambiar={(v) => setProyectada({ ...proyectada, tipo: v })}
                          />
                        </div>

                        <label className="campo">
                          <span className="campo-lbl">
                            Fecha <span className="campo-req">· obligatorio</span>
                          </span>
                          <input
                            className="input"
                            type="date"
                            /* El navegador no deja elegir una fecha pasada: es más rápido que
                             dejarlo elegir y después decirle que no. */
                            min={manana}
                            value={proyectada.fecha}
                            onChange={(e) =>
                              setProyectada({ ...proyectada, fecha: e.target.value })
                            }
                          />
                        </label>

                        <label className="campo">
                          <span className="campo-lbl">
                            Hora <span className="campo-req">· obligatorio</span>
                          </span>
                          <input
                            className="input"
                            type="time"
                            value={proyectada.hora}
                            onChange={(e) => setProyectada({ ...proyectada, hora: e.target.value })}
                          />
                        </label>
                      </div>

                      <label className="campo campo--suelto">
                        <span className="campo-lbl">Resolución / observaciones</span>
                        <textarea
                          className="input textarea"
                          rows={3}
                          placeholder="Qué hay que resolver, qué se acordó, qué quedó pendiente."
                          value={proyectada.descripcion}
                          onChange={(e) =>
                            setProyectada({ ...proyectada, descripcion: e.target.value })
                          }
                        />
                      </label>

                      {nombreCuenta && proyectada.tipo && proyectada.fecha && (
                        <span className="campo-ayuda campo-ayuda--ok">
                          Va a quedar como{' '}
                          <b>
                            {nombreDeActividad(
                              nombreCuenta,
                              proyectada.tipo,
                              proyectada.fecha,
                              proyectada.hora,
                            )}
                          </b>
                          .
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {[...faltan, ...faltanProyectada].length > 0 && (
                <span className="campo-ayuda campo-ayuda--falta" style={{ marginTop: 8 }}>
                  <i className="fa-solid fa-lock" aria-hidden="true" /> Falta{' '}
                  {[...faltan, ...faltanProyectada].join(', ')}.
                </span>
              )}

              <div className="op-editor-acciones">
                <button
                  type="button"
                  className="btn btn--texto btn--chico"
                  disabled={enviando}
                  onClick={() => {
                    setDatos(VACIA)
                    setEstadoElegido('')
                  }}
                >
                  <i className="fa-solid fa-eraser" aria-hidden="true" /> Vaciar el formulario
                </button>
                <button
                  type="button"
                  className="btn btn--primario"
                  disabled={enviando || cargando || faltan.length + faltanProyectada.length > 0}
                  onClick={() => void guardar()}
                >
                  <i className="fa-solid fa-calendar-check" aria-hidden="true" />{' '}
                  {enviando ? 'Cargando…' : 'Cargar la actividad'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= LO QUE TENGO PENDIENTE ================= */}
        {trabajo === 'pendientes' && (
          <div className="card card--flush op-editor" style={{ marginTop: 14 }}>
            <div className="ctitle op-editor-head">
              <span className="op-editor-nom">
                <i className="fa-solid fa-list-check" aria-hidden="true" /> Mis actividades abiertas
              </span>
              <span className="op-editor-chips">
                {atrasadas > 0 && (
                  <span className="chip chip--rojo">
                    {atrasadas} atrasada{atrasadas === 1 ? '' : 's'}
                  </span>
                )}
                <span className="chip chip--gris">{pendientes.length} en total</span>
              </span>
            </div>

            <div className="op-editor-cuerpo">
              {/* Sólo las propias: el tablero es de todo el equipo, y una lista con las de los
                  demás convierte "lo que me queda" en algo que hay que leer entero para encontrar
                  lo de uno. Dar por hecha la actividad de otro tampoco es algo que esta pantalla
                  tenga por qué permitir. */}
              {cargando ? (
                <div className="aviso aviso--neutro">
                  <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
                  <span>Buscando tus actividades…</span>
                </div>
              ) : pendientes.length === 0 ? (
                <div className="aviso aviso--ok">
                  <i className="fa-solid fa-circle-check" aria-hidden="true" />
                  <span>
                    No tenés ninguna actividad abierta. Acá aparecen las que figuran a tu nombre en
                    el tablero y todavía no están completadas.
                  </span>
                </div>
              ) : (
                <ul className="pendientes-lista">
                  {pendientes.map((a) => (
                    <li key={a.id} className={`pend${a.atrasada ? ' pend--atrasada' : ''}`}>
                      <span className="pend-fecha">
                        <b>{a.fecha ? aFechaCorta(a.fecha) : 'Sin fecha'}</b>
                        {a.hora && <small>{a.hora}</small>}
                        <span className={`chip ${a.atrasada ? 'chip--rojo' : 'chip--ambar'}`}>
                          {a.atrasada ? 'Atrasada' : a.estado}
                        </span>
                      </span>

                      <span className="pend-txt">
                        <span className="pend-tit">
                          {a.cuenta || 'Sin cliente'}
                          {a.tipo && <span className="pend-tipo"> · {a.tipo}</span>}
                        </span>
                        {a.contactos && <span className="pend-det">Con {a.contactos}</span>}
                        {a.descripcion && <span className="pend-det">{a.descripcion}</span>}
                      </span>

                      <button
                        type="button"
                        className="btn btn--marca btn--chico"
                        disabled={cerrando !== null}
                        onClick={() => void cerrar(a)}
                      >
                        <i className="fa-solid fa-check" aria-hidden="true" />{' '}
                        {cerrando === a.id ? 'Cerrando…' : 'Dar por hecha'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
