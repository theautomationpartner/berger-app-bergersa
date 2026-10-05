import { COL_PAGO, INV_ESTADO, PAGO_ESTADO, PAGO_OPERACION } from '@/services/monday/columns'
import type { FlujoAvance } from '@/types'

/**
 * Las operaciones 2 y 3, descriptas como datos.
 *
 * Las dos hacen lo mismo —elegir un pago pendiente, adjuntar un comprobante y empujar el circuito
 * un casillero—, así que comparten componente y servicio. Lo único propio de cada una es qué lee
 * y qué escribe, y eso es exactamente lo que está acá: leyendo estas dos constantes se entiende
 * el circuito completo sin abrir monday.
 */

/** Operación 2 · Aprobar Transferencia. */
export const FLUJO_APROBAR: FlujoAvance = {
  etapa: 'aprobar',

  filtroOperacionPend: PAGO_OPERACION.PEND_APROBAR,

  tituloSeleccion: 'Transferencias pendientes de aprobar',
  detalleSeleccion:
    'Pagos con la transferencia ya cargada, esperando la aprobación. Se aprueba de a uno: cada ' +
    'uno tiene su propio comprobante con número de transferencia.',
  vacioTitulo: 'No hay transferencias para aprobar',
  vacioDetalle:
    'Ningún pago está en "Pend de Aprobar Transf". Cargá una transferencia desde la operación 1 ' +
    'o revisá el tablero de Pagos del Inventario.',

  tituloArchivo: 'Transferencia con número',
  detalleArchivo:
    'Es el comprobante que SÍ tiene número de transferencia: es el que se le manda al proveedor ' +
    'para avisarle que la transferencia fue aprobada.',
  zonaTitulo: 'Arrastrá la transferencia con número acá o hacé clic para buscarla',
  botonAccion: 'Aprobar Transferencia',

  finalTitulo: 'Transferencia aprobada',
  finalDetalle:
    'El pago quedó en APROBADO y pasa a esperar la confirmación del depósito. Los tractores ' +
    'quedaron en Transf Aprobada.',

  columnaArchivo: COL_PAGO.transferenciaConNumero,
  nuevoEstadoPago: PAGO_ESTADO.APROBADO,
  nuevaOperacionPend: PAGO_OPERACION.PEND_CONFIRMAR,
  columnaFecha: COL_PAGO.fechaAprobado,
  nuevoEstadoInventario: INV_ESTADO.TRANSF_APROBADA,
  columnaEmail: COL_PAGO.estadoEmail1,
  detalleEmail: 'se le avisa al proveedor que la transferencia fue aprobada',
}

/** Operación 3 · Confirmar Pago - SWIFT. */
export const FLUJO_CONFIRMAR: FlujoAvance = {
  etapa: 'confirmar',

  filtroOperacionPend: PAGO_OPERACION.PEND_CONFIRMAR,
  /* La operación 3 pide las DOS condiciones: que esté esperando confirmación y que ya figure
     como APROBADO. Un pago que quedó en "Pend de Confirmar Transf" sin haber pasado por APROBADO
     es una inconsistencia del tablero, y confirmarlo taparía el problema en vez de mostrarlo. */
  filtroEstadoPago: PAGO_ESTADO.APROBADO,

  tituloSeleccion: 'Pagos pendientes de confirmar',
  detalleSeleccion:
    'Transferencias ya aprobadas, esperando el comprobante del banco que acredita el depósito.',
  vacioTitulo: 'No hay pagos para confirmar',
  vacioDetalle:
    'Ningún pago está en "Pend de Confirmar Transf" con el Estado Pago en APROBADO. Aprobá una ' +
    'transferencia desde la operación 2 o revisá el tablero de Pagos del Inventario.',

  tituloArchivo: 'Comprobante del banco',
  detalleArchivo:
    'Es el comprobante que emite el banco indicando que el monto ya fue depositado. Con esto se ' +
    'cierra el circuito del pago.',
  zonaTitulo: 'Arrastrá el comprobante del banco acá o hacé clic para buscarlo',
  botonAccion: 'Confirmar Pago - SWIFT',

  finalTitulo: 'Pago confirmado',
  finalDetalle:
    'El pago quedó en CONFIRMADO y los tractores pasaron a Pagado. Se creó el despacho en el ' +
    'Despachante de aduana y se le avisó. El circuito de este pago está cerrado.',

  columnaArchivo: COL_PAGO.comprobanteBanco,
  nuevoEstadoPago: PAGO_ESTADO.CONFIRMADO,
  nuevaOperacionPend: PAGO_OPERACION.PAGADO,
  columnaFecha: COL_PAGO.fechaConfirmado,
  nuevoEstadoInventario: INV_ESTADO.PAGADO,
  columnaEmail: COL_PAGO.estadoEmail2,
  detalleEmail: 'se le avisa al proveedor que el pago fue confirmado',
  /* Es la etapa que cierra el despacho del ANTICIPADO: acá se crea el item en el Despachante de
     aduana y se le manda la información. Antes no, porque hasta que el pago no está confirmado la
     transferencia todavía puede caerse. */
  cierraDespacho: true,
}

export const FLUJOS = {
  aprobar: FLUJO_APROBAR,
  confirmar: FLUJO_CONFIRMAR,
} as const
