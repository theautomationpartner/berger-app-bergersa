/**
 * Alta del despacho en el tablero del Despachante de aduana.
 *
 * Es el último movimiento de las dos modalidades, y el mismo en las dos: cuando el pago ya quedó
 * completo —confirmado el SWIFT en ANTICIPADO, registrado el pedido en VISTA— se crea acá un item
 * conectado a ese pago, con lo que el despachante necesita para empezar a trabajar: cuántos
 * contenedores, de qué país y de qué puerto salen, quién provee y quién importa; y un subitem por
 * tractor con los mismos datos que ya tenía el subitem del pago.
 *
 * Cada tractor que entra como subitem pasa además a "En Despachante" en el Inventario: es el único
 * momento en que la app toca el Estado Pedido, y es el que separa "lo despachamos" de "ya está en
 * manos del despachante".
 *
 * Ninguna de sus fallas aborta la operación de la que cuelga: para cuando se llega acá el pago ya
 * está escrito y los tractores ya avanzaron, así que lo que salga mal se informa como advertencia
 * y queda a la vista, en vez de deshacer un circuito que ya ocurrió.
 */
import { aTextoMonday } from '@/lib/format'
import type { TractorDeDespacho } from '@/types'
import {
  COL_DESPACHANTE,
  COL_DESPACHANTE_SUB,
  COL_INV,
  IMPORTADOR_DESPACHO,
  PEDIDO_EN_DESPACHANTE,
  PROVEEDOR_DESPACHO,
  PUERTOS_DESPACHANTE,
  TABLEROS,
} from './columns'
import { prorratearDespacho } from './prorrateo'
import { mondayApi } from './sdk'

const motivo = (e: unknown): string => (e instanceof Error ? e.message : String(e))

interface Entrada {
  /** Item de Pagos del Inventario que originó el despacho. */
  pagoId: string
  /**
   * Nombre del item.
   *
   * El pedido era crearlo sin nombre, pero Monday no acepta items con el nombre vacío —los rechaza
   * con `InvalidItemNameException`—, así que lleva el del pago: es lo que permite reconocerlo en
   * el tablero sin abrir la conexión.
   */
  nombre: string
  /** Contenedores declarados. `null` cuando no se pudo saber: se avisa y la columna queda vacía. */
  cantidadContenedores: number | null
  /** Países de los puertos de carga. Puede haber más de uno si el despacho mezcla orígenes. */
  paises: string[]
  /**
   * Puertos de carga, tal como salieron del Catálogo.
   *
   * Van todos los que tengan los modelos del despacho. Un modelo alemán figura con Bremerhaven Y
   * Hamburgo, y los dos se cargan: el criterio para elegir uno todavía no está definido, y
   * elegirlo por nuestra cuenta sería inventar un dato que después nadie podría revisar.
   */
  puertos: string[]
  /** Id de monday del despachante al que se le asigna. `null` deja el item sin asignar. */
  despachanteId: string | null
  tractores: TractorDeDespacho[]
}

export interface ResultadoDespachante {
  /** Item creado en el Despachante de aduana. No confundir con el id del despachante persona. */
  itemId: string
  subitemIds: string[]
  /** La suma del FOB de los tractores. `null` si no se pudo calcular. */
  totalFob: number | null
  advertencias: string[]
}

export async function crearDespachoDeAduana({
  pagoId,
  nombre,
  cantidadContenedores,
  paises,
  puertos,
  despachanteId,
  tractores,
}: Entrada): Promise<ResultadoDespachante> {
  const advertencias: string[] = []

  /* El proveedor y el importador son fijos: hoy este circuito despacha un solo proveedor para un
     solo importador. El día que haya otro, sale de un dato del pago y no de una constante. */
  const valores: Record<string, unknown> = {
    [COL_DESPACHANTE.pago]: { item_ids: [pagoId] },
    [COL_DESPACHANTE.proveedor]: { labels: [PROVEEDOR_DESPACHO] },
    [COL_DESPACHANTE.importador]: { label: IMPORTADOR_DESPACHO },
    /* El Estado Pago VEP NO se escribe al crear: lo maneja BERGER desde monday, con el valor por
       defecto de la propia columna. La app sólo lo toca desde "Actualizar OP - BERGER". */
  }
  if (cantidadContenedores != null) {
    valores[COL_DESPACHANTE.cantidadContenedores] = aTextoMonday(cantidadContenedores)
  }
  // Un dropdown con una etiqueta que no existe hace fallar la escritura ENTERA, así que si no hay
  // países la columna ni se manda: el resto del despacho se carga igual.
  if (paises.length > 0) valores[COL_DESPACHANTE.paisOrigen] = { labels: paises }
  /* Mismo cuidado con el puerto: se mandan sólo los que la columna conoce. Un dropdown con una
     etiqueta inexistente no falla en esa columna, falla la escritura ENTERA del item. */
  const puertosConocidos = puertos.filter((p) => PUERTOS_DESPACHANTE.includes(p))
  if (puertosConocidos.length > 0) {
    valores[COL_DESPACHANTE.puertoOrigen] = { labels: puertosConocidos }
  }
  // La columna admite una sola persona, que es justamente lo que se eligió en el paso anterior.
  if (despachanteId) {
    valores[COL_DESPACHANTE.despachante] = {
      personsAndTeams: [{ id: Number(despachanteId), kind: 'person' }],
    }
  }

  const creado = await mondayApi<{ create_item: { id: string } }>('crearItemDeDespachante', {
    nombre,
    valores: JSON.stringify(valores),
  })
  const itemId = creado.create_item.id

  const subitemIds: string[] = []
  for (const t of tractores) {
    const valoresSub: Record<string, unknown> = {
      [COL_DESPACHANTE_SUB.valorNeto]: t.valorNeto == null ? '' : aTextoMonday(t.valorNeto),
      [COL_DESPACHANTE_SUB.numDraft]: t.numDraft,
      [COL_DESPACHANTE_SUB.codProducto]: t.codProducto,
    }
    // Sin item del Inventario no hay a qué conectar: se crea igual con los datos que sí están, y
    // la conexión faltante se informa arriba, en la advertencia que ya dio quien lo llamó.
    if (t.tractorId) valoresSub[COL_DESPACHANTE_SUB.inventario] = { item_ids: [t.tractorId] }

    try {
      const sub = await mondayApi<{ create_subitem: { id: string } }>('crearSubitemDeDespachante', {
        padre: itemId,
        nombre: t.nombre,
        valores: JSON.stringify(valoresSub),
      })
      subitemIds.push(sub.create_subitem.id)
    } catch (e) {
      advertencias.push(
        `No se pudo crear el subitem de ${t.nombre} en el Despachante: ${motivo(e)}`,
      )
    }

    /* El tractor pasa a "En Despachante" en el Inventario. Va acá, dentro del mismo recorrido que
       creó su subitem: así el estado lo cambia exactamente el tractor que quedó en el despacho, y
       ninguno más. Es una escritura por tractor y no una sola para todos porque monday no permite
       cambiarle una columna a varios items en una mutation. */
    if (t.tractorId) {
      try {
        await mondayApi('actualizarColumnas', {
          tablero: TABLEROS.inventario,
          item: t.tractorId,
          valores: JSON.stringify({
            [COL_INV.estadoPedido]: { label: PEDIDO_EN_DESPACHANTE },
          }),
        })
      } catch (e) {
        advertencias.push(
          `No se pudo pasar ${t.nombre} a "${PEDIDO_EN_DESPACHANTE}" en el Inventario: ${motivo(e)}`,
        )
      }
    }
  }

  /* Con todos los subitems creados —y no antes— se suma el FOB del despacho y se reparte el
     porcentaje de cada tractor. Antes no se puede: el FOB es un espejo del Inventario y no existe
     hasta que el subitem está conectado, y el porcentaje necesita el total de TODOS. */
  const { total, advertencias: deProrrateo } = await prorratearDespacho(itemId)
  advertencias.push(...deProrrateo)

  return { itemId, subitemIds, totalFob: total, advertencias }
}
