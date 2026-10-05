import { useMemo, useState } from 'react'
import { Stepper } from '@/components/ui/Stepper'
import { coincideTractor, MOTIVO_SIN_CONFIRMACION, tieneConfirmacion } from '@/lib/fechas'
import { fechaCorta, hoyISO } from '@/lib/format'
import { decidirFecha, URL_TABLERO_INVENTARIO } from '@/services/monday/fechas'
import type { DecisionFecha, EtapaFechas, ResultadoFechas, TractorFecha } from '@/types'
import { EtiquetasTractorFecha } from './EtiquetasTractorFecha'
import { useTractoresPendientes } from './useFechas'

const mensaje = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/**
 * Confirmar / Proponer Fecha de Producción.
 *
 * El proveedor informa una fecha para cada tractor. Acá BERGER responde, tractor por tractor: la
 * acepta, o le propone otra.
 *
 * Sólo aparecen los que están en "Fecha Pend Confirmar" **y tienen fecha de producción cargada**:
 * sin fecha no hay nada que aceptar ni contra qué comparar una propuesta.
 *
 * Dos pasos:
 *
 *   1. Selección — ver los tractores con su fecha bien a la vista y marcar sobre cuáles decidir.
 *   2. Decisión  — para cada uno, CONFIRMAR o PROPONER. Son dos botones grandes y excluyentes, no
 *      un desplegable: la diferencia entre aceptar la fecha del proveedor y devolverle otra es la
 *      decisión entera, y tiene que verse de un vistazo cuál quedó elegida.
 *
 * Un tractor **sin confirmación conectada** no se puede decidir de ninguna de las dos formas, y se
 * dice por qué: sin ella no hay respaldo de que DEUTZ haya mandado esa fecha.
 */
export function ConfirmarProponerFecha() {
  const { tractores, cargando, error, recargar } = useTractoresPendientes()

  const [etapa, setEtapa] = useState<EtapaFechas>('seleccion')
  const [busqueda, setBusqueda] = useState('')
  const [seleccion, setSeleccion] = useState<string[]>([])
  const [decisiones, setDecisiones] = useState<Record<string, DecisionFecha>>({})

  const [enviando, setEnviando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ResultadoFechas | null>(null)

  const visibles = useMemo(
    () => tractores.filter((t) => coincideTractor(t, busqueda)),
    [tractores, busqueda],
  )
  const elegidos = useMemo(
    () =>
      seleccion
        .map((id) => tractores.find((t) => t.id === id))
        .filter((t): t is TractorFecha => Boolean(t)),
    [seleccion, tractores],
  )

  /* Los que no se pueden guardar: sin confirmación conectada, o con "proponer" sin fecha puesta. */
  const sinConfirmacion = elegidos.filter((t) => !tieneConfirmacion(t))
  const sinDecidir = elegidos.filter((t) => {
    const d = decisiones[t.id]
    return !d || (d.tipo === 'proponer' && !d.fecha)
  })

  const alternar = (t: TractorFecha) =>
    setSeleccion((actual) =>
      actual.includes(t.id) ? actual.filter((id) => id !== t.id) : [...actual, t.id],
    )

  const quitar = (id: string) => setSeleccion((actual) => actual.filter((x) => x !== id))

  const decidir = (id: string, decision: DecisionFecha) =>
    setDecisiones((actual) => ({ ...actual, [id]: decision }))

  const reiniciar = () => {
    setSeleccion([])
    setDecisiones({})
    setResultado(null)
    setErrorEnvio(null)
    setEtapa('seleccion')
    void recargar()
  }

  const guardar = async () => {
    setEnviando(true)
    setErrorEnvio(null)
    const confirmados: string[] = []
    const propuestos: string[] = []
    const advertencias: string[] = []

    /* Uno por uno: si el quinto falla, los cuatro anteriores ya quedaron decididos y no hay nada
       que deshacer. Lo que falle se informa con el nombre del tractor. */
    for (const t of elegidos) {
      const decision = decisiones[t.id]
      if (!decision || !tieneConfirmacion(t)) continue
      try {
        await decidirFecha(t, decision)
        if (decision.tipo === 'confirmar')
          confirmados.push(`${t.nombre} · ${fechaCorta(t.fechaProd)}`)
        else propuestos.push(`${t.nombre} · ${fechaCorta(decision.fecha)}`)
      } catch (e) {
        advertencias.push(`No se pudo guardar la decisión de ${t.nombre}: ${mensaje(e)}`)
      }
    }

    setEnviando(false)
    if (confirmados.length + propuestos.length === 0 && advertencias.length > 0) {
      setErrorEnvio(advertencias.join(' · '))
      return
    }
    setResultado({ confirmados, propuestos, advertencias })
    setEtapa('listo')
  }

  /* ------------------------------------------------------------------ */
  if (etapa === 'listo' && resultado) {
    const conProblemas = resultado.advertencias.length > 0
    return (
      <div className="scroll">
        <div className="view">
          <Stepper variante="fechas" actual="listo" />

          {conProblemas && (
            <div className="aviso aviso--alerta">
              <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
              <span>
                <b>Algunas decisiones no se pudieron guardar.</b> Revisalas en monday:
                <ul style={{ margin: '6px 0 0 18px' }}>
                  {resultado.advertencias.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </span>
            </div>
          )}

          <div className="final">
            <span className="final-ic">
              <i
                className={`fa-solid ${conProblemas ? 'fa-circle-exclamation' : 'fa-check'}`}
                aria-hidden="true"
              />
            </span>
            <span className="final-tit">
              {conProblemas ? 'Fechas guardadas con observaciones' : 'Fechas guardadas'}
            </span>
            <span className="final-det">
              {resultado.confirmados.length} fecha
              {resultado.confirmados.length === 1 ? '' : 's'} confirmada
              {resultado.confirmados.length === 1 ? '' : 's'} y {resultado.propuestos.length}{' '}
              propuesta{resultado.propuestos.length === 1 ? '' : 's'} al proveedor.
            </span>

            <div className="final-datos">
              {resultado.confirmados.map((c) => (
                <span key={c} className="chip chip--verde">
                  <i className="fa-solid fa-check" aria-hidden="true" /> {c}
                </span>
              ))}
              {resultado.propuestos.map((p) => (
                <span key={p} className="chip chip--ambar">
                  <i className="fa-solid fa-calendar-day" aria-hidden="true" /> {p}
                </span>
              ))}
            </div>

            <div className="final-acciones">
              <a
                className="btn btn--borde"
                href={URL_TABLERO_INVENTARIO}
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
            variante="fechas"
            actual={etapa}
            onIr={enviando ? undefined : (e) => setEtapa(e as EtapaFechas)}
          />

          {errorEnvio && (
            <div className="aviso aviso--error">
              <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
              <span>No se pudieron guardar las fechas: {errorEnvio}</span>
            </div>
          )}

          {etapa === 'seleccion' && (
            <>
              <div className="sec-head">
                <span className="sec-num">1</span>
                <span className="sec-txt">
                  <span className="sec-tit">Fechas pendientes de confirmar</span>
                  <span className="sec-det">
                    Tractores del Inventario en <b>Fecha Pend Confirmar</b> con fecha de producción
                    cargada. Elegí sobre cuáles vas a decidir.
                  </span>
                </span>
              </div>

              {error && (
                <div className="aviso aviso--error">
                  <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
                  <span>
                    No se pudo leer el Inventario: {error}{' '}
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

              <div className="filtros">
                <div className="filtros-fila">
                  <label className="campo campo--busqueda">
                    <span className="campo-lbl">Buscar</span>
                    <input
                      className="input"
                      value={busqueda}
                      placeholder="Nombre, N° interno o modelo…"
                      onChange={(e) => setBusqueda(e.target.value)}
                    />
                  </label>
                </div>
                <span className="filtros-nota filtros-nota--sola">
                  <i className="fa-solid fa-rotate" aria-hidden="true" />
                  {visibles.length} de {tractores.length} tractor
                  {tractores.length === 1 ? '' : 'es'}
                  <button
                    type="button"
                    className="btn btn--borde btn--chico"
                    onClick={() => void recargar()}
                  >
                    Actualizar
                  </button>
                </span>
              </div>

              <div className="lista">
                <div className="lista-head">
                  <span>Tractor</span>
                </div>
                <div className="lista-body">
                  {cargando && (
                    <div className="vacio">
                      <span className="spin spin--oscuro" aria-hidden="true" />
                      <span className="vacio-tit">Buscando tractores…</span>
                    </div>
                  )}

                  {!cargando && !error && visibles.length === 0 && (
                    <div className="vacio">
                      <span className="vacio-ic">
                        <i className="fa-solid fa-calendar-check" aria-hidden="true" />
                      </span>
                      <span className="vacio-tit">No hay fechas pendientes</span>
                      <span className="vacio-det">
                        Ningún tractor está en "Fecha Pend Confirmar" con fecha de producción
                        cargada.
                      </span>
                    </div>
                  )}

                  {!cargando &&
                    visibles.map((t) => {
                      const marcado = seleccion.includes(t.id)
                      const puede = tieneConfirmacion(t)
                      return (
                        <div key={t.id} className={`opfila${marcado ? ' opfila--sel' : ''}`}>
                          <div className="opfila-head">
                            <button
                              type="button"
                              aria-pressed={marcado}
                              className="opfila-marca"
                              onClick={() => alternar(t)}
                            >
                              <span className={`trow-check${marcado ? ' trow-check--sel' : ''}`}>
                                {marcado && <i className="fa-solid fa-check" aria-hidden="true" />}
                              </span>
                              <span className="opfila-nom">{t.nombre}</span>
                            </button>

                            <span className="opfila-chips">
                              <EtiquetasTractorFecha tractor={t} />
                              {!puede && (
                                <span className="chip chip--rojo" title={MOTIVO_SIN_CONFIRMACION}>
                                  <i className="fa-solid fa-link-slash" aria-hidden="true" /> Sin
                                  confirmación
                                </span>
                              )}
                            </span>

                            {/* La fecha es LO que se está decidiendo: va grande y aparte, no como
                                una etiqueta más entre las otras seis. */}
                            <span className="fecha-prod">
                              <span className="fecha-prod-lbl">Fecha de producción</span>
                              <span className="fecha-prod-val">{fechaCorta(t.fechaProd)}</span>
                            </span>
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>
            </>
          )}

          {etapa === 'decision' && (
            <>
              <div className="sec-head">
                <span className="sec-num">2</span>
                <span className="sec-txt">
                  <span className="sec-tit">Confirmar o proponer</span>
                  <span className="sec-det">
                    Para cada tractor: aceptar la fecha del proveedor, o proponerle otra. Lo que
                    elijas queda marcado en verde o en ámbar.
                  </span>
                </span>
              </div>

              {sinConfirmacion.length > 0 && (
                <div className="aviso aviso--error">
                  <i className="fa-solid fa-link-slash" aria-hidden="true" />
                  <span>
                    <b>
                      {sinConfirmacion.length === 1
                        ? 'Hay 1 tractor sin confirmación conectada.'
                        : `Hay ${sinConfirmacion.length} tractores sin confirmación conectada.`}
                    </b>{' '}
                    {MOTIVO_SIN_CONFIRMACION} Quitalos de la selección para poder continuar:
                    <span className="aviso-chips">
                      {sinConfirmacion.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          className="chip chip--boton chip--rojo"
                          onClick={() => quitar(t.id)}
                        >
                          {t.nombre} <i className="fa-solid fa-xmark" aria-hidden="true" />
                        </button>
                      ))}
                    </span>
                  </span>
                </div>
              )}

              <div className="op-editores">
                {elegidos.map((t) => {
                  const decision = decisiones[t.id]
                  const puede = tieneConfirmacion(t)
                  const esConfirmar = decision?.tipo === 'confirmar'
                  const esProponer = decision?.tipo === 'proponer'
                  return (
                    <div
                      key={t.id}
                      className={`card card--flush op-editor${decision && puede ? '' : ' op-editor--pendiente'}`}
                    >
                      <div className="ctitle op-editor-head">
                        <span className="op-editor-nom">
                          <i className="fa-solid fa-tractor" aria-hidden="true" /> {t.nombre}
                        </span>
                        <span className="op-editor-chips">
                          <EtiquetasTractorFecha tractor={t} />
                        </span>
                      </div>

                      <div className="op-editor-cuerpo">
                        {!puede && (
                          <div className="aviso aviso--error" style={{ marginBottom: 12 }}>
                            <i className="fa-solid fa-link-slash" aria-hidden="true" />
                            <span>{MOTIVO_SIN_CONFIRMACION}</span>
                          </div>
                        )}

                        <div className="decision">
                          <button
                            type="button"
                            disabled={!puede}
                            aria-pressed={esConfirmar}
                            className={`opcion opcion--confirmar${esConfirmar ? ' opcion--elegida' : ''}`}
                            onClick={() => decidir(t.id, { tipo: 'confirmar' })}
                          >
                            <span className="opcion-ic">
                              <i className="fa-solid fa-circle-check" aria-hidden="true" />
                            </span>
                            <span className="opcion-txt">
                              <span className="opcion-tit">Confirmar fecha de producción</span>
                              <span className="opcion-det">
                                Se acepta la del proveedor: <b>{fechaCorta(t.fechaProd)}</b>
                              </span>
                            </span>
                          </button>

                          <button
                            type="button"
                            disabled={!puede}
                            aria-pressed={esProponer}
                            className={`opcion opcion--proponer${esProponer ? ' opcion--elegida' : ''}`}
                            onClick={() =>
                              decidir(t.id, {
                                tipo: 'proponer',
                                fecha: esProponer ? decision.fecha : t.fechaPropuesta || '',
                              })
                            }
                          >
                            <span className="opcion-ic">
                              <i className="fa-solid fa-calendar-day" aria-hidden="true" />
                            </span>
                            <span className="opcion-txt">
                              <span className="opcion-tit">Proponer otra fecha</span>
                              <span className="opcion-det">
                                Se le devuelve al proveedor para que la confirme
                              </span>
                            </span>
                          </button>
                        </div>

                        {esProponer && (
                          <label className="campo campo--propuesta">
                            <span className="campo-lbl">Fecha de producción propuesta</span>
                            <input
                              className="input"
                              type="date"
                              min={hoyISO()}
                              value={decision.fecha}
                              onChange={(e) =>
                                decidir(t.id, { tipo: 'proponer', fecha: e.target.value })
                              }
                            />
                            {!decision.fecha && (
                              <span className="campo-ayuda campo-ayuda--falta">
                                Elegí la fecha que le vas a proponer.
                              </span>
                            )}
                          </label>
                        )}

                        <div className="op-editor-acciones">
                          <button
                            type="button"
                            className="btn btn--borde btn--chico"
                            onClick={() => quitar(t.id)}
                          >
                            <i className="fa-solid fa-xmark" aria-hidden="true" /> Quitar de la
                            selección
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

      <footer className="pie">
        <div className="pie-info">
          <span className="font-b">
            {elegidos.length} tractor{elegidos.length === 1 ? '' : 'es'} seleccionado
            {elegidos.length === 1 ? '' : 's'}
          </span>
          <span className="xs">
            {etapa === 'seleccion'
              ? 'Elegí sobre cuáles vas a decidir la fecha'
              : `${elegidos.filter((t) => decisiones[t.id]?.tipo === 'confirmar').length} a confirmar · ${
                  elegidos.filter((t) => decisiones[t.id]?.tipo === 'proponer').length
                } a proponer`}
          </span>
        </div>

        <div className="pie-acciones">
          {etapa === 'decision' && (
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
              disabled={elegidos.length === 0}
              onClick={() => {
                setErrorEnvio(null)
                setEtapa('decision')
              }}
            >
              Continuar <i className="fa-solid fa-arrow-right" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--marca"
              /* No se guarda hasta que TODOS tengan decisión válida y confirmación conectada: una
                 tanda a medias dejaría la mitad del Inventario decidido y la otra mitad no, sin
                 forma de saber cuál es cuál al volver. */
              disabled={
                elegidos.length === 0 ||
                enviando ||
                sinConfirmacion.length > 0 ||
                sinDecidir.length > 0
              }
              onClick={() => void guardar()}
            >
              {enviando ? (
                <>
                  <span className="spin" aria-hidden="true" /> Guardando en monday…
                </>
              ) : (
                <>
                  <i className="fa-solid fa-calendar-check" aria-hidden="true" /> Guardar decisiones
                </>
              )}
            </button>
          )}
        </div>
      </footer>
    </>
  )
}
