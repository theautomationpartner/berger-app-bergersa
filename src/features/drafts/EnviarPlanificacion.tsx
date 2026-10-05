import { useMemo, useState } from 'react'
import { Stepper } from '@/components/ui/Stepper'
import { coincideDraft, ordenDePeriodo, unidadesDe } from '@/lib/drafts'
import { fechaCorta, hoyISO } from '@/lib/format'
import { DRAFT_ESTADO, URL_TABLERO_PLANIFICACION } from '@/services/monday/columns'
import { enviarPlanificacion, nombreDePlanificacion } from '@/services/monday/planificacion'
import type { Draft, EtapaEnvio, ResultadoEnvio } from '@/types'
import { EtiquetasDraft, ImportesDraft, ListaDrafts } from './ListaDrafts'
import { useDrafts } from './useDrafts'

const mensaje = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/**
 * Enviar Planificación: mandarle a DEUTZ los drafts ya planificados, con su período sugerido.
 *
 * Trae los drafts en "Periodo Prod Planificada" que efectivamente TIENEN período. Los dos
 * requisitos, no uno: un draft marcado como planificado al que alguien le borró el período en el
 * tablero no tiene nada que sugerirle al proveedor, y mandarlo sería mandar una fila vacía.
 *
 * El paso de confirmación existe porque de acá sale un mail a un tercero. Antes de crear nada se
 * ve, agrupado por período, exactamente qué se le va a decir: cuántos drafts van a cada mes y
 * cuáles. Es lo último que se puede revisar sin tener que salir a pedir disculpas.
 */
export function EnviarPlanificacion() {
  const { drafts, cargando, error, recargar } = useDrafts(DRAFT_ESTADO.PLANIFICADA)

  const [etapa, setEtapa] = useState<EtapaEnvio>('seleccion')
  const [busqueda, setBusqueda] = useState('')
  const [seleccion, setSeleccion] = useState<string[]>([])

  const [enviando, setEnviando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ResultadoEnvio | null>(null)

  const listos = useMemo(() => drafts.filter((d) => d.periodo.trim()), [drafts])
  const visibles = useMemo(
    () => listos.filter((d) => coincideDraft(d, busqueda)),
    [listos, busqueda],
  )
  const elegidos = useMemo(
    () =>
      seleccion.map((id) => listos.find((d) => d.id === id)).filter((d): d is Draft => Boolean(d)),
    [seleccion, listos],
  )

  /** Los drafts elegidos, agrupados por período: es lo que va a leer el proveedor. */
  const porPeriodo = useMemo(() => {
    const grupos = new Map<string, Draft[]>()
    for (const d of elegidos) grupos.set(d.periodo, [...(grupos.get(d.periodo) ?? []), d])
    return [...grupos.entries()]
      .map(([periodo, lista]) => ({ periodo, drafts: lista }))
      .sort((a, b) => ordenDePeriodo(a.periodo) - ordenDePeriodo(b.periodo))
  }, [elegidos])

  const alternar = (draft: Draft) =>
    setSeleccion((actual) =>
      actual.includes(draft.id) ? actual.filter((id) => id !== draft.id) : [...actual, draft.id],
    )

  const reiniciar = () => {
    setSeleccion([])
    setResultado(null)
    setErrorEnvio(null)
    setEtapa('seleccion')
    void recargar()
  }

  const confirmar = async () => {
    setEnviando(true)
    setErrorEnvio(null)
    try {
      setResultado(await enviarPlanificacion(elegidos))
      setEtapa('listo')
    } catch (e) {
      setErrorEnvio(mensaje(e))
    } finally {
      setEnviando(false)
    }
  }

  /* ------------------------------------------------------------------ */
  if (etapa === 'listo' && resultado) {
    const conProblemas = resultado.advertencias.length > 0
    return (
      <div className="scroll">
        <div className="view">
          <Stepper variante="envio" actual="listo" />

          {conProblemas && (
            <div className="aviso aviso--alerta">
              <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
              <span>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
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
              {conProblemas ? 'Planificación creada con observaciones' : 'Planificación enviada'}
            </span>
            <span className="final-det">
              Se creó <b>{resultado.nombre}</b> en Confirmación y Planificación, con{' '}
              {resultado.drafts} draft{resultado.drafts === 1 ? '' : 's'} conectado
              {resultado.drafts === 1 ? '' : 's'}.{' '}
              {conProblemas
                ? 'El envío quedó pendiente: podés dispararlo desde el tablero.'
                : 'El mail a DEUTZ con los PDF y los períodos sugeridos quedó en cola.'}
            </span>

            <div className="final-datos">
              <span className="chip chip--verde">
                <i className="fa-solid fa-paper-plane" aria-hidden="true" /> Planificación #
                {resultado.planificacionId}
              </span>
              <span className="chip chip--azul">
                <i className="fa-solid fa-file-invoice" aria-hidden="true" /> {resultado.drafts}{' '}
                draft{resultado.drafts === 1 ? '' : 's'}
              </span>
            </div>

            <div className="final-acciones">
              <a
                className="btn btn--borde"
                href={`${URL_TABLERO_PLANIFICACION}/pulses/${resultado.planificacionId}`}
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
            variante="envio"
            actual={etapa}
            onIr={enviando ? undefined : (e) => setEtapa(e as EtapaEnvio)}
          />

          {errorEnvio && (
            <div className="aviso aviso--error">
              <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
              <span>No se pudo crear la planificación: {errorEnvio}</span>
            </div>
          )}

          {etapa === 'seleccion' && (
            <>
              <div className="sec-head">
                <span className="sec-num">1</span>
                <span className="sec-txt">
                  <span className="sec-tit">Drafts planificados</span>
                  <span className="sec-det">
                    Drafts en <b>Periodo Prod Planificada</b> y con período cargado. Elegí cuáles
                    entran en esta planificación.
                  </span>
                </span>
              </div>

              <div className="filtros">
                <div className="filtros-fila">
                  <label className="campo campo--busqueda">
                    <span className="campo-lbl">Buscar por número de draft</span>
                    <input
                      className="input"
                      value={busqueda}
                      placeholder="4455007, DRAFT-014, N° de pedido…"
                      onChange={(e) => setBusqueda(e.target.value)}
                    />
                  </label>
                </div>
                <span className="filtros-nota filtros-nota--sola">
                  <i className="fa-solid fa-rotate" aria-hidden="true" />
                  {visibles.length} de {listos.length} draft{listos.length === 1 ? '' : 's'} listos
                  para enviar
                </span>
              </div>

              <ListaDrafts
                drafts={visibles}
                seleccion={seleccion}
                onAlternar={alternar}
                cargando={cargando}
                error={error}
                onReintentar={() => void recargar()}
                vacioTitulo="No hay drafts para enviar"
                vacioDetalle='Ningún draft está en "Periodo Prod Planificada" con período cargado. Asignalos desde Planificar Período de Producción.'
              />
            </>
          )}

          {etapa === 'confirmacion' && (
            <>
              <div className="sec-head">
                <span className="sec-num">2</span>
                <span className="sec-txt">
                  <span className="sec-tit">Qué se le manda al proveedor</span>
                  <span className="sec-det">
                    Esto es lo que va a recibir DEUTZ. Revisalo antes de confirmar: el mail sale
                    solo y no se puede deshacer.
                  </span>
                </span>
              </div>

              <div className="aviso aviso--info">
                <i className="fa-solid fa-envelope" aria-hidden="true" />
                <span>
                  Se le va a mandar a <b>DEUTZ</b> un mail con los <b>PDF</b> de los{' '}
                  {elegidos.length} draft{elegidos.length === 1 ? '' : 's'} y el{' '}
                  <b>período de producción sugerido</b> de cada uno.
                </span>
              </div>

              <div className="card card--flush" style={{ marginBottom: 14 }}>
                <div className="ctitle">
                  <i className="fa-solid fa-industry" aria-hidden="true" />
                  Períodos sugeridos
                </div>
                <div className="periodos">
                  {porPeriodo.map(({ periodo, drafts: lista }) => (
                    <div key={periodo} className="periodo">
                      <span className="periodo-tit">
                        <span className="chip chip--verde">{periodo}</span>
                        <span className="xs">
                          {lista.length} draft{lista.length === 1 ? '' : 's'} ·{' '}
                          {lista.reduce((n, d) => n + unidadesDe(d), 0)} unidades
                        </span>
                      </span>
                      <span className="periodo-drafts">
                        {lista.map((d) => (
                          <span key={d.id} className="chip chip--indigo">
                            Draft {d.nombre}
                          </span>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="op-editores">
                {elegidos.map((draft) => (
                  <div key={draft.id} className="card card--flush">
                    <div className="ctitle op-editor-head">
                      <span className="op-editor-nom">
                        <i className="fa-solid fa-file-invoice" aria-hidden="true" /> Draft{' '}
                        {draft.nombre}
                      </span>
                      <span className="op-editor-chips">
                        <span className="chip chip--verde">{draft.periodo}</span>
                        <span className="chip chip--indigo">
                          {unidadesDe(draft)} u. · {draft.productos.length} producto
                          {draft.productos.length === 1 ? '' : 's'}
                        </span>
                      </span>
                    </div>
                    <div className="op-editor-cuerpo">
                      <div className="opfila-chips" style={{ marginBottom: 10 }}>
                        <EtiquetasDraft draft={draft} />
                      </div>
                      <ImportesDraft draft={draft} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="aviso aviso--info" style={{ marginTop: 14, marginBottom: 0 }}>
                <i className="fa-solid fa-circle-info" aria-hidden="true" />
                <span>
                  Al confirmar se crea <b>{nombreDePlanificacion(hoyISO())}</b> en{' '}
                  <b>Confirmación y Planificación</b>, de tipo <b>PLANIFICACION</b>, con fecha{' '}
                  {fechaCorta(hoyISO())} y los {elegidos.length} draft
                  {elegidos.length === 1 ? '' : 's'} conectados.
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <footer className="pie">
        <div className="pie-info">
          <span className="font-b">
            {elegidos.length} draft{elegidos.length === 1 ? '' : 's'} seleccionado
            {elegidos.length === 1 ? '' : 's'}
          </span>
          <span className="xs">
            {porPeriodo.length === 0
              ? 'Elegí los drafts que entran en la planificación'
              : `${porPeriodo.length} período${porPeriodo.length === 1 ? '' : 's'} · ${elegidos.reduce(
                  (n, d) => n + unidadesDe(d),
                  0,
                )} unidades`}
          </span>
        </div>

        <div className="pie-acciones">
          {etapa === 'confirmacion' && (
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
                setEtapa('confirmacion')
              }}
            >
              Continuar <i className="fa-solid fa-arrow-right" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--marca"
              disabled={elegidos.length === 0 || enviando}
              onClick={() => void confirmar()}
            >
              {enviando ? (
                <>
                  <span className="spin" aria-hidden="true" /> Creando en monday…
                </>
              ) : (
                <>
                  <i className="fa-solid fa-paper-plane" aria-hidden="true" /> Enviar planificación
                </>
              )}
            </button>
          )}
        </div>
      </footer>
    </>
  )
}
