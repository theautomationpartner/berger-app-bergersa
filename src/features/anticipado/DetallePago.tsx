import { EtiquetasTractor } from '@/features/tractores/EtiquetasTractor'
import { tonoEstadoInventario, tonoEstadoPago, tonoOperacionPend } from '@/lib/chips'
import { fechaCorta, importe } from '@/lib/format'
import type { Pago } from '@/types'

interface Props {
  pago: Pago
}

interface Adjunto {
  etiqueta: string
  url: string
}

/**
 * Ficha completa de un pago: lo del item arriba, los tractores del subitem abajo.
 *
 * Es la misma pieza en las operaciones 2 y 3 porque la pregunta es la misma —"¿qué estoy por
 * aprobar / confirmar?"— y la respuesta tiene que incluir el estado ACTUAL de cada tractor: si
 * uno quedó desfasado del resto, esto es lo único que lo muestra antes de avanzar el circuito.
 */
export function DetallePago({ pago }: Props) {
  const total = pago.tractores.reduce((suma, t) => suma + (t.valorNeto ?? 0), 0)

  const adjuntos: Adjunto[] = [
    { etiqueta: 'Transferencia', url: pago.urlTransferencia },
    { etiqueta: 'Transferencia c/número', url: pago.urlTransferenciaConNumero },
    { etiqueta: 'Comprobante del banco', url: pago.urlComprobanteBanco },
  ].filter((a) => a.url)

  return (
    <>
      <div className="card card--data">
        <div className="ctitle">
          <i className="fa-solid fa-file-invoice-dollar" aria-hidden="true" />
          Datos del pago <span className="xs">#{pago.id}</span>
          <span className="ctitle-importe">
            <span className="ctitle-importe-lbl">Monto transferencia</span>
            <span className="ctitle-importe-val">{importe(pago.monto)}</span>
          </span>
        </div>

        <div className="datos">
          <div className="dato">
            <span className="dato-lbl">Fecha emisión</span>
            <span className="dato-val">{fechaCorta(pago.fechaEmision)}</span>
          </div>
          <div className="dato">
            <span className="dato-lbl">Estado del pago</span>
            <span className="dato-val">
              <span className={`chip ${tonoEstadoPago(pago.estadoPago)}`}>
                {pago.estadoPago || '—'}
              </span>
            </span>
          </div>
          <div className="dato">
            <span className="dato-lbl">Operación pendiente</span>
            <span className="dato-val">
              <span className={`chip ${tonoOperacionPend(pago.operacionPend)}`}>
                {pago.operacionPend || '—'}
              </span>
            </span>
          </div>
          {pago.fechaCargado && (
            <div className="dato">
              <span className="dato-lbl">Cargado el</span>
              <span className="dato-val">{fechaCorta(pago.fechaCargado)}</span>
            </div>
          )}
          {pago.fechaAprobado && (
            <div className="dato">
              <span className="dato-lbl">Aprobado el</span>
              <span className="dato-val">{fechaCorta(pago.fechaAprobado)}</span>
            </div>
          )}
        </div>

        {adjuntos.length > 0 && (
          <div className="adjuntos">
            {adjuntos.map((a) => (
              <a key={a.etiqueta} className="adjunto" href={a.url} target="_blank" rel="noreferrer">
                <i className="fa-solid fa-file-pdf" aria-hidden="true" />
                <span>{a.etiqueta}</span>
                <i className="fa-solid fa-arrow-up-right-from-square xs" aria-hidden="true" />
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="card card--data">
        <div className="ctitle">
          <i className="fa-solid fa-tractor" aria-hidden="true" />
          Tractores de este pago
          <span className="ctitle-cont">
            {pago.tractores.length} · {importe(total)}
          </span>
        </div>

        {pago.tractores.length === 0 ? (
          <div className="aviso aviso--alerta" style={{ marginBottom: 0 }}>
            <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
            <span>Este pago no tiene tractores cargados como subitems.</span>
          </div>
        ) : (
          <div className="sel-lista">
            {pago.tractores.map((t) => (
              <div key={t.id} className="tractor-fila">
                <div className="tractor-fila-nom">
                  <span className="sel-nom">{t.nombre}</span>
                  <span className="tractor-fila-chips">
                    <EtiquetasTractor
                      numInterno={t.numInterno}
                      modelo={t.modelo}
                      estadoRodado={t.estadoRodado}
                    />
                    <span className={`chip ${tonoEstadoInventario(t.estadoTractor)}`}>
                      {t.estadoTractor || 'sin estado'}
                    </span>
                    {!t.tractorId && (
                      <span className="chip chip--rojo">
                        <i className="fa-solid fa-link-slash" aria-hidden="true" /> sin conexión
                      </span>
                    )}
                  </span>
                </div>
                <div className="tractor-fila-datos">
                  <span className="xs">
                    Draft <b>{t.numDraft || '—'}</b> · Cod <b>{t.codProducto || '—'}</b>
                  </span>
                  <span className="tractor-fila-neto">{importe(t.valorNeto)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
