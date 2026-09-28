/**
 * El estado del tractor sigue al de su carga.
 *
 * El 👮Despachante de aduana cuenta dónde está la **carga**; el 🧮Inventario, dónde está cada
 * **tractor**. Son dos vistas de lo mismo y tienen que avanzar juntas: si la OP pasa a
 * "Nacionalizado" y sus tractores siguen figurando "En Despachante", el Inventario —que es el
 * tablero que mira todo el equipo— empieza a mentir.
 *
 * Esto corre desde la app, sobre lo que la app cambia. **Un cambio hecho a mano en el tablero no
 * dispara nada acá**: para eso hace falta una automatización de monday o un escenario de Make,
 * porque la app sólo se entera de lo que pasa por sus pantallas.
 *
 * Ninguna falla aborta nada: para cuando se llega acá, la OP o el contenedor ya quedaron
 * actualizados. Lo que salga mal vuelve como advertencia y queda a la vista.
 */
import { COL_INV, ESTADO_PEDIDO_POR_CARGA, PEDIDO_ARRIBADO } from './columns'
import { mondayApi } from './sdk'

const motivo = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** Qué operación del catálogo usa cada módulo para tocar el Inventario. */
type Origen = 'aduana' | 'aduanaBerger'
const OPERACION: Record<Origen, 'estadoPedidoDesdeAduana' | 'estadoPedidoDesdeBerger'> = {
  aduana: 'estadoPedidoDesdeAduana',
  aduanaBerger: 'estadoPedidoDesdeBerger',
}

/**
 * Le pone el mismo Estado Pedido a varios tractores del Inventario.
 *
 * De a uno y no todos juntos porque monday **no permite cambiarle una columna a varios items en
 * una sola mutation**. Que falle uno no detiene a los demás: cada tractor es independiente y
 * frenar en el tercero dejaría a los últimos sin actualizar sin ninguna razón.
 */
export async function ponerEstadoPedido(
  inventarioIds: string[],
  estado: string,
  origen: Origen,
): Promise<string[]> {
  const advertencias: string[] = []
  const ids = [...new Set(inventarioIds.filter(Boolean))]

  for (const id of ids) {
    try {
      await mondayApi(OPERACION[origen], {
        item: id,
        valores: JSON.stringify({ [COL_INV.estadoPedido]: { label: estado } }),
      })
    } catch (e) {
      advertencias.push(`No se pudo pasar un tractor a "${estado}" en el Inventario: ${motivo(e)}`)
    }
  }

  return advertencias
}

/**
 * El estado de carga de una OP, volcado a sus tractores.
 *
 * Sólo tres de los cinco estados tienen equivalente: "Nueva OP" y "Pendiente de Embarque" son
 * etapas del trámite que al tractor no le cambian nada —sigue "En Despachante"—, así que para
 * esas no se toca el Inventario. Devuelve una lista vacía cuando no hay nada que hacer.
 */
export async function sincronizarPorEstadoDeCarga(
  estadoCarga: string,
  inventarioIds: string[],
): Promise<string[]> {
  const estado = ESTADO_PEDIDO_POR_CARGA[estadoCarga]
  if (!estado || inventarioIds.length === 0) return []
  return ponerEstadoPedido(inventarioIds, estado, 'aduana')
}

/** Los tractores de un contenedor que acaba de marcarse arribado. */
export async function sincronizarArribo(inventarioIds: string[]): Promise<string[]> {
  if (inventarioIds.length === 0) return []
  return ponerEstadoPedido(inventarioIds, PEDIDO_ARRIBADO, 'aduanaBerger')
}

/** Para nombrar el estado en los mensajes sin repetir el mapa. */
export { ESTADO_PEDIDO_POR_CARGA, PEDIDO_ARRIBADO }
