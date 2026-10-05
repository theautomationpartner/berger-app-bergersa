import { useMemo, useState } from 'react'
import { Stepper } from '@/components/ui/Stepper'
import { resumirConfirmacion, seConfirma, urlIncrustable } from '@/lib/fechas'
import { fechaCorta } from '@/lib/format'
import { URL_TABLERO_PLANIFICACION } from '@/services/monday/columns'
import { enviarConfirmacion } from '@/services/monday/confirmaciones'
import type { Confirmacion, EtapaConfirmacion } from '@/types'
import { EtiquetasTractorFecha } from './EtiquetasTractorFecha'
import { useConfirmaciones } from './useFechas'

const mensaje = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/**
 * Enviar Confirmación.
 *
 * Una confirmación junta los tractores cuyas fechas respondió el proveedor. Antes de devolvérsela
 * hay que ver qué lleva: cuáles se aceptan tal cual y a cuáles se les propone otra fecha.
 *
 * Se puede mandar sólo cuando el circuito terminó su parte —el Inventario actualizado y la planilla
 * de Google creada— y cuando alguien confirmó que revisó esa planilla. Lo primero lo dice el
 * tablero; lo segundo no lo puede saber la app, y por eso lo pregunta: de acá sale un mail al
 * proveedor con fechas que después se cumplen.
 */
export function EnviarConfirmacion() {
  const { confirmaciones, cargando, error, recargar } = useConfirmaciones()

  const [etapa, setEtapa] = useState<EtapaConfirmacion>('seleccion')
  const [elegidaId, setElegidaId] = useState<string | null>(null)
  const [revisada, setRevisada] = useState(false)

  const [enviando, setEnviando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)
  const [enviada, setEnviada] = useState<Confirmacion | null>(null)

  const elegida = confirmaciones.find((c) => c.id === elegidaId) ?? null
  const resumen = useMemo(() => (elegida ? resumirConfirmacion(elegida) : null), [elegida])
  const incrustable = elegida ? urlIncrustable(elegida.driveLink) : ''

  const reiniciar = () => {
    setElegidaId(null)
    setRevisada(false)
    setEnviada(null)
    setErrorEnvio(null)
    setEtapa('seleccion')
    void recargar()
  }

  const confirmar = async () => {
    if (!elegida) return
    setEnviando(true)
    setErrorEnvio(null)
    try {
      await enviarConfirmacion(elegida.id)
      setEnviada(elegida)
      setEtapa('listo')
    } catch (e) {
      setErrorEnvio(mensaje(e))
    } finally {
      setEnviando(false)
    }
  }

  /* ------------------------------------------------------------------ */
  if (etapa === 'listo' && enviada) {
    return (
      <div className="scroll">
        <div className="view">
          <Stepper variante="confirmacion" actual="listo" />

          <div className="final">
            <span className="final-ic">
              <i className="fa-solid fa-check" aria-hidden="true" />
            </span>
            <span className="final-tit">Confirmación enviada</span>
            <span className="final-det">
              <b>{enviada.nombre}</b> quedó en <b>Enviar</b>: la automatización del tablero se
              encarga del correo al proveedor.
            </span>

            <div className="final-acciones">
              <a
                className="btn btn--borde"
                href={`${URL_TABLERO_PLANIFICACION}/pulses/${enviada.id}`}
                target="_blank"
                rel="noreferrer"
              >
                <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /> Ver en
                monday
              </a>
              <button type="button" className="btn btn--primario" onClick={reiniciar}>
                <i className="fa-solid fa-list" aria-hidden="true" /> Volver a la lista
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="scroll">
        <div className="view">
          <Stepper
            variante="confirmacion"
            actual={etapa}
            onIr={enviando ? undefined : (e) => setEtapa(e as EtapaConfirmacion)}
          />

          {errorEnvio && (
            <div className="aviso aviso--error">
              <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
              <span>No se pudo enviar la confirmación: {errorEnvio}</span>
            </div>
          )}

          {etapa === 'seleccion' && (
            <>
              <div className="sec-head">
                <span className="sec-num">1</span>
                <span className="sec-txt">
                  <span className="sec-tit">Confirmaciones del proveedor</span>
                  <span className="sec-det">
                    Items de tipo <b>CONFIRMACION</b> en Confirmación y Planificación que todavía no
                    se mandaron. Elegí cuál vas a revisar y mandar.
                  </span>
                </span>
              </div>

              {error && (
                <div className="aviso aviso--error">
                  <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
                  <span>
                    No se pudieron leer las confirmaciones: {error}{' '}
                    <button
                      type="button"
                      className="btn btn--texto btn--chico"
                      onClick={() => void recargar()}
                    >
                      Reintentar
                    </button>
                  </span>
                </div>
              )}

              <div className="lista">
                <div className="lista-head">
                  <span>Confirmación</span>
                  <span className="lista-head-acciones">
                    <button
                      type="button"
                      className="btn btn--borde btn--chico"
                      onClick={() => void recargar()}
                    >
                      <i className="fa-solid fa-rotate" aria-hidden="true" /> Actualizar
                    </button>
                  </span>
                </div>

                <div className="lista-body">
                  {cargando && (
                    <div className="vacio">
                      <span className="spin spin--oscuro" aria-hidden="true" />
                      <span className="vacio-tit">Buscando confirmaciones…</span>
                    </div>
                  )}

                  {!cargando && !error && confirmaciones.length === 0 && (
                    <div className="vacio">
                      <span className="vacio-ic">
                        <i className="fa-solid fa-inbox" aria-hidden="true" />
                      </span>
                      <span className="vacio-tit">No hay confirmaciones pendientes de enviar</span>
                      <span className="vacio-det">
                        O todavía no llegó ninguna confirmación de DEUTZ, o las que hay ya se
                        mandaron: las que quedaron en <b>Enviado</b> no se listan.
                      </span>
                    </div>
                  )}

                  {!cargando &&
                    confirmaciones.map((c) => {
                      const marcada = c.id === elegidaId
                      const r = resumirConfirmacion(c)
                      return (
                        <button
                          key={c.id}
                          type="button"
                          aria-pressed={marcada}
                          className={`trow${marcada ? ' trow--sel' : ''}`}
                          onClick={() => setElegidaId(marcada ? null : c.id)}
                        >
                          <span className={`trow-radio${marcada ? ' trow-radio--sel' : ''}`} />
                          <span className="trow-nom">
                            <span className="trow-nom-txt">{c.nombre}</span>
                            {c.idConfirmacion && (
                              <span className="chip chip--indigo">{c.idConfirmacion}</span>
                            )}
                            <span className="chip chip--verde">
                              {r.confirmados.length} a confirmar
                            </span>
                            <span className="chip chip--ambar">
                              {r.propuestos.length} a proponer
                            </span>
                            {!r.listaParaEnviar && (
                              <span className="chip chip--rojo">
                                <i className="fa-solid fa-hourglass-half" aria-hidden="true" /> En
                                preparación
                              </span>
                            )}
                            {/* El estado del envío se muestra tal cual: "Enviar" y "Enviando" ya
                                están en marcha, "Detenido" quedó trabado. Las "Enviado" no llegan
                                hasta acá. */}
                            {c.estadoPropuesta && (
                              <span
                                className={`chip ${r.enCurso ? 'chip--azul' : 'chip--naranja'}`}
                                title="Estado del envío"
                              >
                                {c.estadoPropuesta}
                              </span>
                            )}
                          </span>
                          <span className="trow-meta">
                            <span className="trow-fecha">{fechaCorta(c.fecha)}</span>
                          </span>
                        </button>
                      )
                    })}
                </div>
              </div>
            </>
          )}

          {etapa === 'resumen' && elegida && resumen && (
            <>
              <div className="sec-head">
                <span className="sec-num">2</span>
                <span className="sec-txt">
                  <span className="sec-tit">{elegida.nombre}</span>
                  <span className="sec-det">
                    Esto es lo que se le devuelve al proveedor. Revisalo antes de mandar: el correo
                    sale solo y no se puede deshacer.
                  </span>
                </span>
              </div>

              <div className="tarjetas" style={{ marginBottom: 14 }}>
                <div className="tarjeta tarjeta--verde">
                  <span className="tarjeta-ic">
                    <i className="fa-solid fa-circle-check" aria-hidden="true" />
                  </span>
                  <span className="tarjeta-val">{resumen.confirmados.length}</span>
                  <span className="tarjeta-rot">Fechas que se confirman</span>
                  <span className="tarjeta-det">Se acepta la que informó el proveedor</span>
                </div>
                <div className="tarjeta tarjeta--ambar">
                  <span className="tarjeta-ic">
                    <i className="fa-solid fa-calendar-day" aria-hidden="true" />
                  </span>
                  <span className="tarjeta-val">{resumen.propuestos.length}</span>
                  <span className="tarjeta-rot">Fechas que se proponen</span>
                  <span className="tarjeta-det">Tienen una fecha propuesta distinta</span>
                </div>
                <div
                  className={`tarjeta ${resumen.inventarioActualizado ? 'tarjeta--verde' : 'tarjeta--rojo'}`}
                >
                  <span className="tarjeta-ic">
                    <i className="fa-solid fa-boxes-stacked" aria-hidden="true" />
                  </span>
                  <span className="tarjeta-val" style={{ fontSize: 16 }}>
                    {elegida.estadoActInventario || 'Sin estado'}
                  </span>
                  <span className="tarjeta-rot">Inventario</span>
                </div>
                <div
                  className={`tarjeta ${resumen.planillaCreada ? 'tarjeta--verde' : 'tarjeta--rojo'}`}
                >
                  <span className="tarjeta-ic">
                    <i className="fa-solid fa-table" aria-hidden="true" />
                  </span>
                  <span className="tarjeta-val" style={{ fontSize: 16 }}>
                    {elegida.creacionSheet || 'Sin estado'}
                  </span>
                  <span className="tarjeta-rot">Planilla de Google</span>
                </div>
              </div>

              {resumen.enCurso && (
                <div className="aviso aviso--info">
                  <i className="fa-solid fa-paper-plane" aria-hidden="true" />
                  <span>
                    El envío de esta confirmación ya está en <b>{elegida.estadoPropuesta}</b>.
                    Volver a mandarla no agrega nada: esperá a que la automatización termine.
                  </span>
                </div>
              )}

              {!resumen.listaParaEnviar && (
                <div className="aviso aviso--alerta">
                  <i className="fa-solid fa-hourglass-half" aria-hidden="true" />
                  <span>
                    <b>Todavía no se puede mandar.</b> Hace falta que el Inventario esté{' '}
                    <b>Actualizado</b> y que la planilla esté <b>Creada</b>. Son dos
                    automatizaciones del tablero: esperá a que terminen y volvé a actualizar.
                  </span>
                </div>
              )}

              {/* Los tractores de la confirmación, separados por lo que les va a pasar. */}
              <div className="card card--flush" style={{ marginBottom: 14 }}>
                <div className="ctitle">
                  <i className="fa-solid fa-tractor" aria-hidden="true" />
                  {elegida.tractores.length} tractor
                  {elegida.tractores.length === 1 ? '' : 'es'} en esta confirmación
                </div>
                <div className="lista-body">
                  {elegida.tractores.length === 0 && (
                    <div className="vacio">
                      <span className="vacio-tit">No tiene tractores conectados</span>
                      <span className="vacio-det">
                        Revisá la conexión al Inventario en el tablero.
                      </span>
                    </div>
                  )}
                  {elegida.tractores.map((t) => {
                    const acepta = seConfirma(t)
                    return (
                      <div key={t.id} className="opfila">
                        <div className="opfila-head">
                          <span className="opfila-nom">{t.nombre}</span>
                          <span className="opfila-chips">
                            <EtiquetasTractorFecha tractor={t} />
                          </span>
                          <span className="fechas-par">
                            <span className="fecha-prod">
                              <span className="fecha-prod-lbl">Fecha del proveedor</span>
                              <span className="fecha-prod-val">
                                {t.fechaProd ? fechaCorta(t.fechaProd) : '—'}
                              </span>
                            </span>
                            {!acepta && (
                              <span className="fecha-prod fecha-prod--propuesta">
                                <span className="fecha-prod-lbl">Fecha propuesta</span>
                                <span className="fecha-prod-val">
                                  {fechaCorta(t.fechaPropuesta)}
                                </span>
                              </span>
                            )}
                            <span className={`chip ${acepta ? 'chip--verde' : 'chip--ambar'}`}>
                              {acepta ? 'Se confirma' : 'Se propone'}
                            </span>
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* La planilla. Se incrusta cuando Google lo permite; si no, queda el botón. */}
              <div className="card card--flush" style={{ marginBottom: 14 }}>
                <div className="ctitle">
                  <i className="fa-solid fa-table" aria-hidden="true" />
                  Planilla con las fechas
                  {elegida.driveLink && (
                    <a
                      className="btn btn--borde btn--chico"
                      style={{ marginLeft: 'auto' }}
                      href={elegida.driveLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />{' '}
                      Abrir en Google
                    </a>
                  )}
                </div>

                {incrustable ? (
                  <>
                    <iframe
                      className="planilla"
                      src={incrustable}
                      title="Planilla de la confirmación"
                    />
                    <div className="aviso aviso--info" style={{ margin: 12 }}>
                      <i className="fa-solid fa-circle-info" aria-hidden="true" />
                      <span>
                        Si el recuadro aparece vacío, es porque Google pide iniciar sesión dentro
                        del iframe. Abrí la planilla con el botón de arriba y revisala ahí.
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="vacio">
                    <span className="vacio-ic">
                      <i className="fa-solid fa-link-slash" aria-hidden="true" />
                    </span>
                    <span className="vacio-tit">Esta confirmación no tiene planilla cargada</span>
                    <span className="vacio-det">
                      La crea la automatización del tablero. Sin planilla no hay qué revisar.
                    </span>
                  </div>
                )}
              </div>

              <label className="revisada">
                <input
                  type="checkbox"
                  checked={revisada}
                  onChange={(e) => setRevisada(e.target.checked)}
                />
                <span>
                  Revisé la planilla y las fechas confirmadas y propuestas son las que corresponden.
                </span>
              </label>
            </>
          )}
        </div>
      </div>

      <footer className="pie">
        <div className="pie-info">
          <span className="font-b">
            {elegida ? elegida.nombre : 'Ninguna confirmación elegida'}
          </span>
          <span className="xs">
            {resumen
              ? `${resumen.confirmados.length} a confirmar · ${resumen.propuestos.length} a proponer`
              : 'Elegí la confirmación que vas a revisar'}
          </span>
        </div>

        <div className="pie-acciones">
          {etapa === 'resumen' && (
            <button
              type="button"
              className="btn btn--texto"
              disabled={enviando}
              onClick={() => setEtapa('seleccion')}
            >
              <i className="fa-solid fa-arrow-left" aria-hidden="true" /> Volver
            </button>
          )}

          {etapa === 'seleccion' ? (
            <button
              type="button"
              className="btn btn--primario"
              disabled={!elegida}
              onClick={() => {
                setErrorEnvio(null)
                setEtapa('resumen')
              }}
            >
              Continuar <i className="fa-solid fa-arrow-right" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--marca"
              /* Tres condiciones, y ninguna la puede dar por cumplida la app: los dos estados del
                 tablero, y que alguien diga que revisó la planilla. */
              disabled={!elegida || !resumen?.listaParaEnviar || !revisada || enviando}
              onClick={() => void confirmar()}
            >
              {enviando ? (
                <>
                  <span className="spin" aria-hidden="true" /> Enviando…
                </>
              ) : (
                <>
                  <i className="fa-solid fa-paper-plane" aria-hidden="true" /> Enviar confirmación
                </>
              )}
            </button>
          )}
        </div>
      </footer>
    </>
  )
}
