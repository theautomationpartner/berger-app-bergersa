/**
 * La tarjeta de un pedido: quién lo pidió, qué pidió y en qué anda.
 *
 * La comparten las tres pantallas —Mis pedidos, Aprobar y Asignar— porque las tres miran el mismo
 * pedido desde distintos lugares, y un pedido que se ve distinto en cada pantalla es un pedido del
 * que hay que volver a aprender cada vez. Lo que cambia es lo que se puede hacer con él, y eso
 * entra como `children`.
 */
import type { ReactNode } from 'react'
import { Plata } from '@/components/ui/Plata'
import { APROBACION, ESTADO_PEDIDO, PEDIDO_PARA, TIPO_PEDIDO } from '@/services/monday/columns'
import type { PedidoLeido, UnidadLeida } from '@/services/monday/pedidosBerger'

/** El color del estado. Es lo primero que se mira, y conviene no tener que leerlo para saberlo. */
export function tonoDeEstado(estado: string): string {
  switch (estado) {
    case ESTADO_PEDIDO.APROBADO:
      return 'chip--verde'
    case ESTADO_PEDIDO.RECHAZADO:
      return 'chip--rojo'
    case ESTADO_PEDIDO.ASIGNADO:
      return 'chip--azul'
    case ESTADO_PEDIDO.ASIGNADO_PARCIAL:
      return 'chip--teal'
    case ESTADO_PEDIDO.A_FABRICA:
      return 'chip--violeta'
    default:
      return 'chip--ambar'
  }
}

/** Lo mismo para las dos aprobaciones, que tienen sus propias etiquetas. */
export const tonoDeAprobacion = (v: string): string =>
  v === APROBACION.APROBADO
    ? 'chip--verde'
    : v === APROBACION.RECHAZADO
      ? 'chip--rojo'
      : 'chip--ambar'

/**
 * A quién le factura BERGER.
 *
 * En la venta directa, al cliente final; en la compra de stock, al concesionario.
 * Es la pregunta que se hace quien aprueba —"¿a quién le estoy dando crédito?"— y hasta ahora había
 * que deducirla cruzando dos etiquetas.
 */
export function aQuienSeLeFactura(pedido: PedidoLeido): string {
  if (pedido.pedidoPara === PEDIDO_PARA.DIRECTA) {
    return pedido.terceroNombre || 'el cliente final'
  }
  return pedido.cuentaNombre || 'el concesionario'
}

interface Props {
  pedido: PedidoLeido
  /** Las unidades de ESTE pedido. */
  unidades: UnidadLeida[]
  /** Qué se puede hacer con él. Lo pone cada pantalla. */
  children?: ReactNode
  /** Un panel al costado, para las decisiones. */
  costado?: ReactNode
  /** Para plegarlo cuando hay muchos. */
  abierto?: boolean
  onAbrir?: () => void
  /** Las dos aprobaciones en la cabecera. Sólo le sirven a BERGER. */
  conAprobaciones?: boolean
}

export function TarjetaPedido({
  pedido,
  unidades,
  children,
  costado,
  abierto = true,
  onAbrir,
  conAprobaciones,
}: Props) {
  const asignadas = unidades.filter((u) => u.inventarioId).length
  const iva = pedido.totalFacturaConIva - pedido.totalFacturaSinIva

  return (
    <div
      className={`pedido-card pedido-card--${tonoDeEstado(pedido.estado).replace('chip--', '')}`}
    >
      <button
        type="button"
        className="pedido-card-head"
        aria-expanded={abierto}
        onClick={onAbrir}
        disabled={!onAbrir}
      >
        <span className="pedido-card-tit">
          <span className="pedido-card-nom">{pedido.nombre}</span>
          <span className="pedido-card-sub">
            {[pedido.tipoPedido, pedido.pedidoPara, pedido.tipoFactura && `Factura ${pedido.tipoFactura.toLowerCase()}`]
              .filter(Boolean)
              .join(' · ')}
            {pedido.pago ? ` · ${pedido.pago}` : ''}
            {pedido.fechaSolicitud ? ` · pedido el ${pedido.fechaSolicitud}` : ''}
          </span>
        </span>

        <span className="pedido-card-chips">
          <span className={`chip ${tonoDeEstado(pedido.estado)}`}>
            {pedido.estado || 'Sin estado'}
          </span>
          {pedido.tipoPedido === TIPO_PEDIDO.CONCESION && (
            <span className="chip chip--violeta">En concesión</span>
          )}
          {pedido.politicaContado === 'Operatoria Especial' && (
            <span className="chip chip--ambar">Operatoria especial</span>
          )}
          {pedido.estado === ESTADO_PEDIDO.ASIGNADO_PARCIAL && (
            <span className="chip chip--teal">{pedido.porcentajeAsignacion}% con tractor</span>
          )}
          {conAprobaciones && (
            <>
              <span className={`chip ${tonoDeAprobacion(pedido.aprobComercial)}`}>
                Comercial: {pedido.aprobComercial}
              </span>
              <span className={`chip ${tonoDeAprobacion(pedido.aprobFinanciera)}`}>
                Financiera: {pedido.aprobFinanciera}
              </span>
            </>
          )}
          <span className="chip chip--gris">
            {unidades.length} unidad{unidades.length === 1 ? '' : 'es'}
          </span>
          <Plata valor={pedido.totalFacturaSinIva} nota="+ IVA" grande />
          {onAbrir && (
            <i className={`fa-solid fa-chevron-${abierto ? 'up' : 'down'}`} aria-hidden="true" />
          )}
        </span>
      </button>

      {abierto && (
        <div className={`pedido-card-cuerpo${costado ? ' pedido-card-cuerpo--doble' : ''}`}>
          <div className="pedido-card-principal">
            <dl className="datos-pares">
              <div>
                <dt>Concesionario</dt>
                <dd>{pedido.cuentaNombre || '—'}</dd>
              </div>
              {pedido.terceroNombre && (
                <div>
                  <dt>Cliente final</dt>
                  <dd>{pedido.terceroNombre}</dd>
                </div>
              )}
              <div>
                <dt>Se le factura a</dt>
                <dd>{aQuienSeLeFactura(pedido)}</dd>
              </div>
              <div>
                <dt>Cargado por</dt>
                <dd>{pedido.comercial || '—'}</dd>
              </div>
              {pedido.plazo && (
                <div>
                  <dt>Plazo</dt>
                  <dd>
                    {pedido.plazo}
                    {pedido.banco ? ` · ${pedido.banco}` : ''}
                  </dd>
                </div>
              )}
              {pedido.fechaAprobacion && (
                <div>
                  <dt>Aprobado el</dt>
                  <dd>{pedido.fechaAprobacion}</dd>
                </div>
              )}
              {unidades.length > 0 && (
                <div>
                  <dt>Con tractor asignado</dt>
                  <dd>
                    {asignadas} de {unidades.length}
                  </dd>
                </div>
              )}
            </dl>

            {/* El motivo del rechazo es lo único que le sirve a quien tiene que volver a cargarlo. */}
            {pedido.motivo && (
              <div className="aviso aviso--alerta">
                <i className="fa-solid fa-comment-dots" aria-hidden="true" />
                <span>
                  <b>Observación:</b> {pedido.motivo}
                </span>
              </div>
            )}

            <div className="renglones">
              {pedido.renglones.map((r) => (
                <div key={r.id} className="renglon">
                  <span className="renglon-cant">{r.cantidad}</span>
                  <span className="renglon-nom">
                    {r.nombre}
                    <small>{r.estado || 'Sin estado'}</small>
                  </span>
                  <span className="renglon-plata">
                    <Plata valor={r.facturaSinIva * r.cantidad} nota="s/IVA" />
                    <small>
                      {r.cantidad} × <b>{r.facturaSinIva.toLocaleString('es-AR')}</b>
                    </small>
                  </span>
                </div>
              ))}
            </div>

            {/* El total con IVA es el número que el concesionario va a transferir, así que se
                muestra al lado del de factura y no se deja para que alguien lo calcule. */}
            <div className="totales-pedido">
              <div className="total-cuadro">
                <small>Lista s/IVA</small>
                <Plata valor={pedido.totalListaSinIva} apagado />
              </div>
              <div className="total-cuadro">
                <small>IVA</small>
                <Plata valor={iva} apagado />
              </div>
              <div className="total-cuadro total-cuadro--fuerte">
                <small>A facturar s/IVA</small>
                <Plata valor={pedido.totalFacturaSinIva} grande />
              </div>
              <div className="total-cuadro total-cuadro--fuerte">
                <small>Total con IVA</small>
                <Plata valor={pedido.totalFacturaConIva} grande />
              </div>
            </div>

            {/* La venta directa factura al cliente final con el precio que puso el concesionario: ese
                número, y la comisión que sale de él, no son los de arriba. */}
            {pedido.pedidoPara === PEDIDO_PARA.DIRECTA && pedido.totalClienteFinal > 0 && (
              <div className="totales-pedido totales-pedido--dos">
                <div className="total-cuadro">
                  <small>Factura al cliente final s/IVA</small>
                  <Plata valor={pedido.totalClienteFinal} />
                </div>
                <div className="total-cuadro">
                  <small>Comisión</small>
                  <Plata valor={pedido.totalComision} />
                </div>
              </div>
            )}

            {children}
          </div>

          {costado && <div className="pedido-card-costado">{costado}</div>}
        </div>
      )}
    </div>
  )
}
