import { useCallback, useEffect, useMemo, useState } from 'react'
import { Desplegable } from '@/components/ui/Desplegable'
import { TEAM_LISTA, USUARIO } from '@/services/monday/columns'
import { SinAcceso } from '@/services/monday/sdk'
import {
  crearUsuario,
  desactivarUsuario,
  etiquetasDeListaBlanca,
  faltaParaElAlta,
  usuariosDeListaBlanca,
  type AltaUsuario,
} from '@/services/monday/usuarios'
import type { UsuarioListaBlanca } from '@/types'

const mensaje = (e: unknown): string => (e instanceof Error ? e.message : String(e))

const VACIO: AltaUsuario = {
  alias: '',
  nombreCompleto: '',
  email: '',
  telefono: '',
  apps: [],
  team: '',
  tableros: [],
}

/** Dos trabajos distintos, como en el resto de la app: dar de alta y dar de baja. */
type Trabajo = 'alta' | 'baja'

/**
 * Registro de Usuario.
 *
 * Da de alta gente en la 🔒Lista Blanca, que es el tablero que decide quién entra a la app. Por
 * eso es la operación más acotada de todas: **sólo Administración** la ve, se crea siempre como
 * `INVITADO` y `Activo`, y de alguien ya creado lo único que se puede cambiar desde acá es pasarlo
 * a `Inactivo`.
 *
 * Lo que pasa después no lo hace la app: al crearse la fila, una automatización manda la
 * invitación y, si es despachante, lo suma al equipo y a los tableros. Al pasarlo a `Inactivo`,
 * otra lo desactiva en monday. Acá se deja el dato; el circuito lo mueve Make.
 */
export function RegistroUsuario() {
  const [trabajo, setTrabajo] = useState<Trabajo>('alta')

  const [datos, setDatos] = useState<AltaUsuario>(VACIO)
  const [opciones, setOpciones] = useState({
    apps: [] as string[],
    teams: [] as string[],
    tableros: [] as string[],
  })

  const [usuarios, setUsuarios] = useState<UsuarioListaBlanca[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [enviando, setEnviando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)
  const [creado, setCreado] = useState<string | null>(null)
  const [desactivando, setDesactivando] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')

  const recargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      setUsuarios(await usuariosDeListaBlanca())
    } catch (e) {
      setUsuarios([])
      setError(
        e instanceof SinAcceso
          ? 'la app tiene que abrirse desde monday para leer la Lista Blanca.'
          : mensaje(e),
      )
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void recargar()
  }, [recargar])

  useEffect(() => {
    etiquetasDeListaBlanca()
      .then(setOpciones)
      .catch(() => setOpciones({ apps: [], teams: [], tableros: [] }))
  }, [])

  const esDespachante = datos.team === TEAM_LISTA.DESPACHANTES
  const faltan = faltaParaElAlta(datos)

  /** Los INVITADOS activos: los únicos que esta pantalla puede dar de baja. */
  const invitadosActivos = useMemo(
    () =>
      usuarios.filter((u) => u.tipoUsuario === USUARIO.INVITADO && u.estado !== USUARIO.INACTIVO),
    [usuarios],
  )

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    if (!texto) return invitadosActivos
    return invitadosActivos.filter((u) =>
      [u.alias, u.nombreCompleto, u.email, u.team]
        .filter(Boolean)
        .some((campo) => campo.toLowerCase().includes(texto)),
    )
  }, [invitadosActivos, busqueda])

  const alternarApp = (app: string) =>
    setDatos((d) => ({
      ...d,
      apps: d.apps.includes(app) ? d.apps.filter((x) => x !== app) : [...d.apps, app],
    }))

  const alternarTablero = (t: string) =>
    setDatos((d) => ({
      ...d,
      tableros: d.tableros.includes(t) ? d.tableros.filter((x) => x !== t) : [...d.tableros, t],
    }))

  const guardar = async () => {
    setEnviando(true)
    setErrorEnvio(null)
    setCreado(null)
    try {
      const r = await crearUsuario(datos)
      setCreado(r.nombre)
      setDatos(VACIO)
      await recargar()
    } catch (e) {
      setErrorEnvio(mensaje(e))
    } finally {
      setEnviando(false)
    }
  }

  const darDeBaja = async (u: UsuarioListaBlanca) => {
    setDesactivando(u.id)
    setErrorEnvio(null)
    try {
      await desactivarUsuario(u.id)
      /* Se actualiza la fila en memoria: recargar entero haría desaparecer de golpe al que se
         acaba de desactivar, sin que se vea que la acción salió bien. */
      setUsuarios((a) => a.map((x) => (x.id === u.id ? { ...x, estado: USUARIO.INACTIVO } : x)))
    } catch (e) {
      setErrorEnvio(`No se pudo desactivar a ${u.alias}: ${mensaje(e)}`)
    } finally {
      setDesactivando(null)
    }
  }

  return (
    <div className="scroll">
      <div className="view">
        <div className="sec-head">
          <span className="sec-num">
            <i className="fa-solid fa-user-shield" aria-hidden="true" />
          </span>
          <span className="sec-txt">
            <span className="sec-tit">Registro de Usuario</span>
            <span className="sec-det">
              Quién entra a la app y a qué. Se da de alta siempre como <b>{USUARIO.INVITADO}</b> y{' '}
              <b>{USUARIO.ACTIVO}</b>; la invitación y los permisos en monday los manda una
              automatización apenas se crea la fila.
            </span>
          </span>
        </div>

        <div className="decision decision--grande">
          <button
            type="button"
            aria-pressed={trabajo === 'alta'}
            className={`opcion opcion--confirmar${trabajo === 'alta' ? ' opcion--elegida' : ''}`}
            onClick={() => setTrabajo('alta')}
          >
            <span className="opcion-ic">
              <i className="fa-solid fa-user-plus" aria-hidden="true" />
            </span>
            <span className="opcion-txt">
              <span className="opcion-tit">Dar de alta</span>
              <span className="opcion-det">
                Crear la fila en la Lista Blanca y disparar la invitación.
              </span>
            </span>
          </button>

          <button
            type="button"
            aria-pressed={trabajo === 'baja'}
            className={`opcion opcion--proponer${trabajo === 'baja' ? ' opcion--elegida' : ''}`}
            onClick={() => setTrabajo('baja')}
          >
            <span className="opcion-ic">
              <i className="fa-solid fa-user-slash" aria-hidden="true" />
            </span>
            <span className="opcion-txt">
              <span className="opcion-tit">Desactivar un invitado</span>
              <span className="opcion-det">
                Pasarlo a <b>{USUARIO.INACTIVO}</b>: le corta el acceso en el acto.
              </span>
              <span className="opcion-req opcion-req--aviso">
                <i className="fa-solid fa-users" aria-hidden="true" />
                {invitadosActivos.length} invitado{invitadosActivos.length === 1 ? '' : 's'} activo
                {invitadosActivos.length === 1 ? '' : 's'}
              </span>
            </span>
          </button>
        </div>

        {error && (
          <div className="aviso aviso--error" style={{ marginTop: 14 }}>
            <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
            <span>No se pudo leer la Lista Blanca: {error}</span>
          </div>
        )}

        {errorEnvio && (
          <div className="aviso aviso--error" style={{ marginTop: 14 }}>
            <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
            <span>{errorEnvio}</span>
          </div>
        )}

        {/* ---------------- Alta ---------------- */}
        {trabajo === 'alta' && (
          <>
            {creado && (
              <div className="aviso aviso--ok" style={{ marginTop: 14 }}>
                <i className="fa-solid fa-circle-check" aria-hidden="true" />
                <span>
                  <b>{creado}</b> quedó creado en la Lista Blanca. La invitación y los permisos en
                  monday los manda la automatización; puede tardar un momento.
                </span>
              </div>
            )}

            <div className="card card--flush op-editor" style={{ marginTop: 14 }}>
              <div className="ctitle op-editor-head">
                <span className="op-editor-nom">
                  <i className="fa-solid fa-id-card" aria-hidden="true" /> Datos de la persona
                </span>
                <span className="op-editor-chips">
                  <span className="chip chip--verde">{USUARIO.ACTIVO}</span>
                  <span className="chip chip--indigo">{USUARIO.INVITADO}</span>
                </span>
              </div>

              <div className="op-editor-cuerpo">
                <div className="datos datos--form">
                  <label className="campo">
                    <span className="campo-lbl">
                      Nombre completo <span className="campo-req">· obligatorio</span>
                    </span>
                    <input
                      className="input"
                      value={datos.nombreCompleto}
                      placeholder="Ej: María Gómez"
                      onChange={(e) => setDatos({ ...datos, nombreCompleto: e.target.value })}
                    />
                  </label>

                  <label className="campo">
                    <span className="campo-lbl">Alias de usuario</span>
                    <input
                      className="input"
                      value={datos.alias}
                      placeholder={datos.nombreCompleto.trim() || 'Se usa el nombre completo'}
                      onChange={(e) => setDatos({ ...datos, alias: e.target.value })}
                    />
                    <span className="campo-ayuda">
                      Si lo dejás vacío se usa el nombre completo: es el nombre de la fila y monday
                      no acepta items sin nombre.
                    </span>
                  </label>

                  <label className="campo">
                    <span className="campo-lbl">
                      Email <span className="campo-req">· obligatorio</span>
                    </span>
                    <input
                      className="input"
                      type="email"
                      value={datos.email}
                      placeholder="nombre@empresa.com"
                      onChange={(e) => setDatos({ ...datos, email: e.target.value })}
                    />
                    <span className="campo-ayuda">A esta dirección le llega la invitación.</span>
                  </label>

                  <label className="campo">
                    <span className="campo-lbl">Teléfono</span>
                    <input
                      className="input"
                      value={datos.telefono}
                      placeholder="Opcional"
                      onChange={(e) => setDatos({ ...datos, telefono: e.target.value })}
                    />
                  </label>

                  <div className="campo">
                    <span className="campo-lbl">
                      Equipo <span className="campo-req">· obligatorio</span>
                    </span>
                    <Desplegable
                      valor={datos.team}
                      opciones={opciones.teams}
                      vacio="Elegir un equipo…"
                      onCambiar={(v) =>
                        /* Cambiar de equipo limpia los tableros: son del despachante, y dejarlos
                           cargados en alguien de Administración deja la fila diciendo algo que no
                           es. */
                        setDatos({ ...datos, team: v, tableros: [] })
                      }
                    />
                  </div>
                </div>

                <div className="campo" style={{ marginTop: 12 }}>
                  <span className="campo-lbl">
                    Apps habilitadas <span className="campo-req">· obligatorio</span>
                  </span>
                  <div className="opciones-chips">
                    {opciones.apps.map((app) => (
                      <button
                        key={app}
                        type="button"
                        aria-pressed={datos.apps.includes(app)}
                        className={`chip chip--boton${
                          datos.apps.includes(app) ? ' chip--activo' : ''
                        }`}
                        onClick={() => alternarApp(app)}
                      >
                        {app}
                      </button>
                    ))}
                    {opciones.apps.length === 0 && (
                      <span className="campo-ayuda">
                        No se pudieron leer las apps del tablero. Recargá la pantalla.
                      </span>
                    )}
                  </div>
                </div>

                {/* Los tableros son SÓLO del despachante: a alguien de Administración no se le
                    piden porque entra a todo. */}
                {esDespachante && (
                  <div className="campo" style={{ marginTop: 12 }}>
                    <span className="campo-lbl">
                      Tableros del despachante <span className="campo-req">· obligatorio</span>
                    </span>
                    <div className="opciones-chips">
                      {opciones.tableros.map((t) => (
                        <button
                          key={t}
                          type="button"
                          aria-pressed={datos.tableros.includes(t)}
                          className={`chip chip--boton${
                            datos.tableros.includes(t) ? ' chip--activo' : ''
                          }`}
                          onClick={() => alternarTablero(t)}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    <span className="campo-ayuda">
                      A estos tableros lo suma la automatización cuando acepta la invitación.
                    </span>
                  </div>
                )}

                {faltan.length > 0 && (
                  <span className="campo-ayuda campo-ayuda--falta" style={{ marginTop: 10 }}>
                    <i className="fa-solid fa-lock" aria-hidden="true" /> Falta {faltan.join(', ')}.
                  </span>
                )}

                <div className="op-editor-acciones">
                  <button
                    type="button"
                    className="btn btn--texto btn--chico"
                    disabled={enviando}
                    onClick={() => setDatos(VACIO)}
                  >
                    <i className="fa-solid fa-eraser" aria-hidden="true" /> Vaciar el formulario
                  </button>
                  <button
                    type="button"
                    className="btn btn--primario"
                    disabled={faltan.length > 0 || enviando}
                    onClick={() => void guardar()}
                  >
                    {enviando ? (
                      <>
                        <span className="spin" aria-hidden="true" /> Creando…
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-user-plus" aria-hidden="true" /> Crear el usuario
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ---------------- Baja ---------------- */}
        {trabajo === 'baja' && (
          <>
            <div className="filtros" style={{ marginTop: 14 }}>
              <div className="filtros-fila">
                <label className="campo campo--busqueda">
                  <span className="campo-lbl">Buscar</span>
                  <input
                    className="input"
                    value={busqueda}
                    placeholder="Buscar un invitado…"
                    onChange={(e) => setBusqueda(e.target.value)}
                  />
                  <span className="campo-ayuda campo-ayuda--ejemplo">
                    Alias, nombre completo, email o equipo
                  </span>
                </label>
              </div>
            </div>

            {cargando && (
              <div className="vacio">
                <span className="spin spin--oscuro" aria-hidden="true" />
                <span className="vacio-tit">Leyendo la Lista Blanca…</span>
              </div>
            )}

            {!cargando && !error && visibles.length === 0 && (
              <div className="vacio">
                <span className="vacio-ic">
                  <i className="fa-solid fa-users-slash" aria-hidden="true" />
                </span>
                <span className="vacio-tit">
                  {busqueda.trim() ? 'Nadie coincide con la búsqueda' : 'No hay invitados activos'}
                </span>
                <span className="vacio-det">
                  Esta pantalla sólo desactiva usuarios <b>{USUARIO.INVITADO}</b>. A un MIEMBRO o a
                  un ADMIN se lo desactiva desde monday.
                </span>
              </div>
            )}

            <div className="op-editores">
              {!cargando &&
                visibles.map((u) => {
                  const inactivo = u.estado === USUARIO.INACTIVO
                  return (
                    <div key={u.id} className="card card--flush op-editor">
                      <div className="ctitle op-editor-head">
                        <span className="op-editor-nom">
                          <i className="fa-solid fa-user" aria-hidden="true" /> {u.alias}
                        </span>
                        <span className="op-editor-chips">
                          <span className={`chip ${inactivo ? 'chip--gris' : 'chip--verde'}`}>
                            {u.estado || 'Sin estado'}
                          </span>
                          <span className="chip chip--indigo">{u.tipoUsuario}</span>
                          {u.team && <span className="chip chip--azul">{u.team}</span>}
                        </span>
                      </div>

                      <div className="op-editor-cuerpo">
                        <div className="datos datos--lectura">
                          <div className="campo">
                            <span className="campo-lbl">Nombre completo</span>
                            <span className="campo-fijo">{u.nombreCompleto || '—'}</span>
                          </div>
                          <div className="campo">
                            <span className="campo-lbl">Email</span>
                            <span className="campo-fijo">{u.email || '—'}</span>
                          </div>
                          <div className="campo">
                            <span className="campo-lbl">Teléfono</span>
                            <span className="campo-fijo">{u.telefono || '—'}</span>
                          </div>
                          {u.tableros && (
                            <div className="campo">
                              <span className="campo-lbl">Tableros</span>
                              <span className="campo-fijo">{u.tableros}</span>
                            </div>
                          )}
                        </div>

                        <div className="op-editor-acciones">
                          <button
                            type="button"
                            className="btn btn--marca btn--chico"
                            disabled={inactivo || desactivando === u.id}
                            onClick={() => void darDeBaja(u)}
                          >
                            {desactivando === u.id ? (
                              <>
                                <span className="spin" aria-hidden="true" /> Desactivando…
                              </>
                            ) : inactivo ? (
                              <>
                                <i className="fa-solid fa-check" aria-hidden="true" /> Ya está
                                inactivo
                              </>
                            ) : (
                              <>
                                <i className="fa-solid fa-user-slash" aria-hidden="true" /> Pasar a{' '}
                                {USUARIO.INACTIVO}
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
