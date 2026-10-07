/**
 * La tarjeta de un pedido: quién lo pidió, qué pidió y en qué anda.
 *
 * La comparten las tres pantallas —Mis pedidos, Aprobar y Asignar— porque las tres miran el mismo
 * pedido desde distintos lugares, y un pedido que se ve distinto en cada pantalla es un pedido del
 * que hay que volver a aprender cada vez. Lo que cambia es lo que se puede hacer con él, y eso
 * entra como `children`.
 */
import { importe as aMoneda } from '@/lib/format'
import { ESTADO_PEDIDO } from '@/services/monday/columns'
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
    case ESTADO_PEDIDO.A_FABRICA:
      return 'chip--violeta'
    default:
      return 'chip--ambar'
  }
}

interface Props {
  pedido: PedidoLeido
  /** Las unidades de ESTE pedido. */
  unidades: UnidadLeida[]
  /** Qué se puede hacer con él. Lo pone cada pantalla. */
  children?: React.ReactNode
  /** Para plegarlo cuando hay muchos. */
  abierto?: boolean
  onAbrir?: () => void
}

export function TarjetaPedido({ pedido, unidades, children, abierto = true, onAbrir }: Props) {
  const asignadas = unidades.filter((u) => u.inventarioId).length

  return (
    <div className="pedido-card">
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
            {pedido.tipoPedido}
            {pedido.tipoVenta ? ` · ${pedido.tipoVenta}` : ''}
            {pedido.pago ? ` · ${pedido.pago}` : ''}
            {pedido.fechaSolicitud ? ` · pedido el ${pedido.fechaSolicitud}` : ''}
          </span>
        </span>

        <span className="pedido-card-chips">
          <span className={`chip ${tonoDeEstado(pedido.estado)}`}>
            {pedido.estado || 'Sin estado'}
          </span>
          <span className="chip chip--gris">
            {unidades.length} unidad{unidades.length === 1 ? '' : 'es'}
          </span>
          <span className="pedido-card-importe">
            {aMoneda(pedido.totalFacturaSinIva)}
            <small>+ IVA</small>
          </span>
          {onAbrir && (
            <i className={`fa-solid fa-chevron-${abierto ? 'up' : 'down'}`} aria-hidden="true" />
          )}
        </span>
      </button>

      {abierto && (
        <div className="pedido-card-cuerpo">
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
                <b>Motivo:</b> {pedido.motivo}
              </span>
            </div>
          )}

          <div className="pedido-tabla-caja">
            <table>
              <thead>
                <tr>
                  <th>Modelo</th>
                  <th className="n">Cant.</th>
                  <th>Estado</th>
                  <th className="n">A facturar s/IVA</th>
                </tr>
              </thead>
              <tbody>
                {pedido.renglones.map((r) => (
                  <tr key={r.id}>
                    <td className="pedido-tractor">
                      <b>{r.nombre}</b>
                    </td>
                    <td className="n">{r.cantidad}</td>
                    <td>
                      <span className="chip chip--gris">{r.estado || 'Sin estado'}</span>
                    </td>
                    <td className="n fuerte">{aMoneda(r.facturaSinIva * r.cantidad)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {children}
        </div>
      )}
    </div>
  )
}
