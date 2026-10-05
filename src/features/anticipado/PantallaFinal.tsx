import { cantidad, importe } from '@/lib/format'
import { URL_TABLERO_PAGOS } from '@/services/monday/columns'
import type { ResultadoCarga } from '@/types'

interface Props {
  resultado: ResultadoCarga
  monto: number
  onNuevaOperacion: () => void
}

/**
 * Cierre de la operación.
 *
 * Las advertencias se muestran arriba del resumen y no escondidas al pie: si un subitem no se
 * creó o un tractor quedó sin cambiar de estado, eso hay que arreglarlo a mano en monday, y una
 * pantalla que sólo dice "listo" garantiza que nadie se entere.
 */
export function PantallaFinal({ resultado, monto, onNuevaOperacion }: Props) {
  const hayProblemas = resultado.advertencias.length > 0

  return (
    <>
      {hayProblemas && (
        <div className="aviso aviso--alerta">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <span>
            <b>El pago se creó, pero quedaron cosas sin completar.</b> Revisalas en monday:
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
            className={`fa-solid ${hayProblemas ? 'fa-circle-exclamation' : 'fa-check'}`}
            aria-hidden="true"
          />
        </span>
        <span className="final-tit">
          {hayProblemas ? 'Pago cargado con observaciones' : 'Transferencia cargada'}
        </span>
        <span className="final-det">
          Se registró el pago en <b>Pagos del Inventario</b> por <b>{importe(monto)}</b>, con la
          transferencia adjunta.
        </span>

        <div className="final-datos">
          <span className="chip chip--verde">
            <i className="fa-solid fa-file-invoice-dollar" aria-hidden="true" /> Pago #
            {resultado.pagoId}
          </span>
          <span className="chip chip--azul">
            <i className="fa-solid fa-layer-group" aria-hidden="true" />{' '}
            {cantidad(resultado.subitemIds.length)} subitem
            {resultado.subitemIds.length === 1 ? '' : 's'}
          </span>
          <span className={`chip ${hayProblemas ? 'chip--ambar' : 'chip--verde'}`}>
            <i className="fa-solid fa-tractor" aria-hidden="true" />{' '}
            {cantidad(resultado.tractoresActualizados)} en Transf Cargada
          </span>
        </div>

        <div className="final-acciones">
          <a
            className="btn btn--borde"
            href={`${URL_TABLERO_PAGOS}/pulses/${resultado.pagoId}`}
            target="_blank"
            rel="noreferrer"
          >
            <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /> Ver el pago
            en monday
          </a>
          <button type="button" className="btn btn--primario" onClick={onNuevaOperacion}>
            <i className="fa-solid fa-plus" aria-hidden="true" /> Cargar otra transferencia
          </button>
        </div>
      </div>
    </>
  )
}
