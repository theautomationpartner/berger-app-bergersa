/**
 * La ficha de una cuenta: quién es, con sus datos fiscales y su crédito.
 *
 * Se usa en los tres casos del pedido y después en las pantallas de BERGER. Siempre la misma
 * pieza, porque siempre se mira lo mismo: a quién se le está por vender y si puede comprar.
 *
 * El crédito se dibuja con color según cuánto se usó. No es decoración: el número solo —"usó
 * 2.800.000 de 3.250.000"— obliga a hacer una división mental antes de decidir, y la decisión es
 * justamente si se aprueba o no.
 */
import { importe } from '@/lib/format'
import type { CuentaCrm } from '@/services/monday/crm'

/** Qué tan comprometida está la línea. Los cortes los puso BERGER. */
export function tonoDeCredito(usadoPorciento: number): 'verde' | 'amarillo' | 'naranja' | 'rojo' {
  if (usadoPorciento > 90) return 'rojo'
  if (usadoPorciento > 50) return 'naranja'
  if (usadoPorciento > 30) return 'amarillo'
  return 'verde'
}

interface Props {
  cuenta: CuentaCrm
  /** Un rótulo arriba: "Concesionario", "Cliente final". */
  rotulo: string
  /** El crédito sólo se muestra donde la decisión lo necesita. */
  conCredito?: boolean
  /** Para poder sacarla y elegir otra. */
  onQuitar?: () => void
}

export function FichaCuenta({ cuenta, rotulo, conCredito, onQuitar }: Props) {
  const asignado = cuenta.creditoAsignado ?? 0
  const usado = cuenta.creditoUtilizado ?? 0
  const disponible = asignado - usado
  const porciento = asignado > 0 ? Math.min(100, Math.round((usado / asignado) * 100)) : 0
  const tono = tonoDeCredito(porciento)

  const donde = [cuenta.direccion, cuenta.ciudad, cuenta.provincia].filter(Boolean).join(', ')

  return (
    <div className="ficha">
      <div className="ficha-head">
        <span className="ficha-rotulo">{rotulo}</span>
        {onQuitar && (
          <button type="button" className="btn btn--texto btn--chico" onClick={onQuitar}>
            Cambiar
          </button>
        )}
      </div>

      <span className="ficha-nombre">{cuenta.nombre}</span>
      <span className="ficha-donde">
        <i className="fa-solid fa-location-dot" aria-hidden="true" />{' '}
        {donde || 'Sin dirección cargada'}
      </span>

      <div className="ficha-chips">
        {cuenta.cuit && <span className="chip chip--interno">CUIT {cuenta.cuit}</span>}
        {cuenta.tipoPersona && <span className="chip chip--gris">{cuenta.tipoPersona}</span>}
        {cuenta.condicionFiscal && (
          <span className="chip chip--verde">{cuenta.condicionFiscal}</span>
        )}
        {cuenta.clasificacion && <span className="chip chip--azul">{cuenta.clasificacion}</span>}
      </div>

      {conCredito && (
        <div className="credito">
          <div className="credito-cifras">
            <span className="credito-dato">
              <small>Línea asignada</small>
              <b>{importe(asignado)}</b>
            </span>
            <span className="credito-dato">
              <small>Utilizada</small>
              <b>{importe(usado)}</b>
            </span>
            <span className={`credito-dato credito-dato--${tono}`}>
              <small>Disponible</small>
              <b>{importe(disponible)}</b>
            </span>
          </div>
          <div className="credito-barra">
            <span
              className={`credito-barra-usa credito-barra-usa--${tono}`}
              style={{ width: `${porciento}%` }}
            />
          </div>
          <span className="credito-pie">
            {asignado > 0 ? `${porciento}% de la línea utilizada` : 'Sin línea de crédito asignada'}
          </span>
        </div>
      )}
    </div>
  )
}
