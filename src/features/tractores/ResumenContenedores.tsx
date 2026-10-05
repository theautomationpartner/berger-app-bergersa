import { rotuloContenedor } from '@/lib/contenedores'
import type { ResumenContenedores as Resumen, Tractor } from '@/types'

interface Props {
  resumen: Resumen
  cargando: boolean
  error: string | null
  onReintentar: () => void
  /** Cuántos tractores hay elegidos: sin ninguno no hay nada que mostrar. */
  seleccionados: number
}

/** Un tractor como se lo nombra dentro de un contenedor. */
function LineaTractor({ tractor, sugerido = false }: { tractor: Tractor; sugerido?: boolean }) {
  return (
    <div className={`cont-tractor${sugerido ? ' cont-tractor--sugerido' : ''}`}>
      <i className={`fa-solid ${sugerido ? 'fa-plus' : 'fa-tractor'}`} aria-hidden="true" />
      <span className="cont-tractor-nom">{tractor.nombre}</span>
      {tractor.numInterno && <span className="chip chip--interno">N° {tractor.numInterno}</span>}
      {tractor.modelo && <span className="chip chip--magenta">{tractor.modelo}</span>}
    </div>
  )
}

/**
 * Cuántos contenedores salen con lo que hay elegido, qué lleva cada uno y qué quedó sin ubicar.
 *
 * Se actualiza con cada tractor que se marca, mientras se arma la selección. Esa es la razón de
 * ser de esta pantalla: enterarse al final de que un contenedor viaja por la mitad es tarde, y
 * saberlo mientras se elige permite sumar uno más y llenarlo.
 *
 * Lo que se ve acá es lo mismo que queda guardado en el pago como reporte para el proveedor.
 */
export function ResumenContenedores({
  resumen,
  cargando,
  error,
  onReintentar,
  seleccionados,
}: Props) {
  if (seleccionados === 0) return null

  if (cargando) {
    return (
      <div className="card card--data">
        <div className="ctitle">
          <i className="fa-solid fa-boxes-stacked" aria-hidden="true" />
          Contenedores
        </div>
        <div className="vacio">
          <span className="spin spin--oscuro" aria-hidden="true" />
          <span className="vacio-tit">Leyendo las combinaciones de contenedores…</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="aviso aviso--alerta">
        <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
        <span>
          No se pudo leer el tablero de Contenedores, así que no se puede calcular cuántos salen:{' '}
          {error}{' '}
          <button type="button" className="btn btn--texto btn--chico" onClick={onReintentar}>
            Reintentar
          </button>
        </span>
      </div>
    )
  }

  const { armados, sinContenedor, totalContenedores, totalLibres } = resumen
  let numero = 1

  return (
    <div className="card card--data">
      <div className="ctitle">
        <i className="fa-solid fa-boxes-stacked" aria-hidden="true" />
        Contenedores
        <span className="ctitle-cont">
          {totalContenedores > 0 && (
            <span className="chip chip--teal">
              {totalContenedores} contenedor{totalContenedores === 1 ? '' : 'es'}
            </span>
          )}
          {totalLibres > 0 && (
            <span className="chip chip--ambar cont-libres">
              {totalLibres} lugar{totalLibres === 1 ? '' : 'es'} sin usar
            </span>
          )}
        </span>
      </div>

      {armados.length === 0 && sinContenedor.length === 0 && (
        <p className="ingreso-nota">Elegí tractores para ver cómo se acomodan.</p>
      )}

      <div className="cont-lista">
        {armados.map((armado) => {
          const rotulo = rotuloContenedor(armado, numero)
          numero += armado.opcion.contenedores
          const completo = armado.libres === 0
          return (
            <div key={rotulo} className={`cont-caja${completo ? ' cont-caja--completo' : ''}`}>
              <div className="cont-cab">
                <span className="cont-rotulo">{rotulo}</span>
                <span className="chip chip--violeta">{armado.opcion.ruedas}</span>
                <span className={`chip ${completo ? 'chip--verde' : 'chip--ambar'} cont-carga`}>
                  {armado.tractores.length} de {armado.opcion.capacidad}
                  {completo
                    ? ' · completo'
                    : ` · ${armado.libres} libre${armado.libres === 1 ? '' : 's'}`}
                </span>
              </div>

              {armado.tractores.map((t) => (
                <LineaTractor key={t.id} tractor={t} />
              ))}

              {armado.sugerencias.length > 0 && (
                <div className="cont-sugerencia">
                  <span className="cont-sugerencia-tit">
                    <i className="fa-solid fa-lightbulb" aria-hidden="true" /> Para completarlo
                    podés sumar:
                  </span>
                  {armado.sugerencias.map((t) => (
                    <LineaTractor key={t.id} tractor={t} sugerido />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {sinContenedor.length > 0 && (
        <div className="aviso aviso--alerta cont-sin">
          <i className="fa-solid fa-circle-question" aria-hidden="true" />
          <span>
            <b>
              {sinContenedor.length} tractor{sinContenedor.length === 1 ? '' : 'es'} sin contenedor
              asignado.
            </b>{' '}
            No hay una combinación cargada que los reciba:
            <ul className="cont-sin-lista">
              {sinContenedor.map(({ tractor, motivo }) => (
                <li key={tractor.id}>
                  {tractor.nombre}
                  {tractor.modelo ? ` · ${tractor.modelo}` : ''} — {motivo}
                </li>
              ))}
            </ul>
          </span>
        </div>
      )}
    </div>
  )
}
