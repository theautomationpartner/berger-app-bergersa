/**
 * El total FOB del despacho y el peso de cada tractor dentro de él.
 *
 * Corre una sola vez, justo después de armar el despacho en el tablero del Despachante de aduana:
 * con los subitems ya creados, se suma el FOB de todos los tractores, la suma queda en el item y
 * cada subitem se lleva qué porcentaje de esa suma representa. Un tractor de 10 en un despacho de
 * 100 lleva 10.
 *
 * Para qué sirve: con ese porcentaje se reparten después los gastos e impuestos de la importación
 * —el flete, la terminal, los honorarios— entre los tractores, que es lo que permite saber cuánto
 * costó realmente cada uno. Hacerlo a mano, tractor por tractor, es exactamente donde se cuelan
 * los errores que después nadie encuentra.
 *
 * Se calcula acá y se guarda escrito, en vez de dejarlo como fórmula: el reparto de una
 * importación que ya ocurrió no puede moverse solo porque alguien corrija un precio del Inventario
 * meses después.
 *
 * Como todo lo que cuelga del alta del despacho, sus fallas no abortan nada: para cuando esto
 * corre, el pago ya está escrito y los tractores ya avanzaron. Lo que salga mal se informa.
 */
import { aTextoMonday } from '@/lib/format'
import { COL_DESPACHANTE, COL_DESPACHANTE_SUB } from './columns'
import { aNumeroEspejo, espejo, porId, type ColumnaCruda } from './parse'
import { mondayApi } from './sdk'

const motivo = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/**
 * Cuántos decimales lleva el porcentaje.
 *
 * Cuatro y no dos porque sobre esto se reparte plata: en un despacho de cien mil dólares, el
 * cuarto decimal es un centavo. Redondear antes de repartir es perder esos centavos en cada
 * tractor, y que la suma de las partes no dé el total.
 */
const DECIMALES = 4

const redondear = (n: number): number => Number(n.toFixed(DECIMALES))

interface TractorConFob {
  id: string
  nombre: string
  fob: number | null
}

/** El FOB de cada tractor del despacho, leído del espejo del Inventario. */
async function fobDeLosTractores(itemId: string): Promise<TractorConFob[]> {
  const r = await mondayApi<{
    items: { subitems: { id: string; name: string; column_values: ColumnaCruda[] }[] | null }[]
  }>('fobDelDespacho', { item: itemId, columnas: [COL_DESPACHANTE_SUB.fob] })

  return (r.items?.[0]?.subitems ?? []).map((s) => ({
    id: s.id,
    nombre: s.name,
    /* El FOB es una columna MIRROR: devuelve `text: null` aunque tenga dato, y el número está en
       `display_value`. Leerlo como texto plano daría cero en todos los tractores, sin fallar. */
    fob: aNumeroEspejo(espejo(porId(s.column_values)[COL_DESPACHANTE_SUB.fob])),
  }))
}

export interface ResultadoProrrateo {
  /** La suma escrita en el item. `null` si no se pudo calcular. */
  total: number | null
  advertencias: string[]
}

/**
 * Suma el FOB del despacho y reparte el porcentaje entre sus tractores.
 *
 * @param itemId Item del despacho en el tablero del Despachante de aduana.
 */
export async function prorratearDespacho(itemId: string): Promise<ResultadoProrrateo> {
  const advertencias: string[] = []

  let tractores: TractorConFob[]
  try {
    tractores = await fobDeLosTractores(itemId)
  } catch (e) {
    return {
      total: null,
      advertencias: [`No se pudo leer el FOB de los tractores del despacho: ${motivo(e)}`],
    }
  }

  if (tractores.length === 0) return { total: null, advertencias }

  const conPrecio = tractores.filter((t) => t.fob != null && t.fob > 0)
  /* Redondeado a dos decimales porque es plata: sumar 6766.37 + 77593.95 en coma flotante da
     173026.52000000002, y eso es lo que quedaría escrito en el tablero. */
  const total = Number(conPrecio.reduce((suma, t) => suma + (t.fob ?? 0), 0).toFixed(2))

  /* Sin total no hay porcentaje que calcular: dividir por cero daría infinito y escribiría un
     disparate en una columna con la que después se reparte plata. Se avisa y no se escribe nada:
     el despacho queda creado y el prorrateo se puede rehacer cuando el Inventario tenga el precio. */
  if (total <= 0) {
    return {
      total: null,
      advertencias: [
        'No se pudo calcular el prorrateo: ninguno de los tractores del despacho tiene cargado el ' +
          'FOB en el Inventario. El total y los porcentajes quedaron vacíos.',
      ],
    }
  }

  /* Un tractor sin precio se lleva 0% y su parte la absorben los demás, que es lo que hace que
     esto tenga que avisarse en voz alta: el reparto queda completo pero mal repartido, y sólo se
     nota mirando los números uno por uno. */
  const sinPrecio = tractores.filter((t) => t.fob == null || t.fob <= 0)
  if (sinPrecio.length > 0) {
    advertencias.push(
      `Sin FOB en el Inventario: ${sinPrecio.map((t) => t.nombre).join(', ')}. ` +
        'Quedaron con 0% de prorrateo y su parte de los gastos la absorben los demás tractores.',
    )
  }

  try {
    await mondayApi('totalFobDelDespacho', {
      item: itemId,
      valores: JSON.stringify({ [COL_DESPACHANTE.totalFob]: aTextoMonday(total) }),
    })
  } catch (e) {
    advertencias.push(`No se pudo escribir el TOTAL FOB del despacho: ${motivo(e)}`)
  }

  /* De a uno: monday no deja cambiarle una columna a varios items en una sola mutation. Que uno
     falle no cancela los demás, porque un prorrateo incompleto se completa a mano y uno vacío hay
     que rehacerlo entero. */
  for (const t of tractores) {
    const porcentaje = t.fob && t.fob > 0 ? redondear((t.fob / total) * 100) : 0
    try {
      await mondayApi('prorrateoDeSubitem', {
        item: t.id,
        valores: JSON.stringify({ [COL_DESPACHANTE_SUB.prorrateo]: aTextoMonday(porcentaje) }),
      })
    } catch (e) {
      advertencias.push(`No se pudo escribir el % de prorrateo de ${t.nombre}: ${motivo(e)}`)
    }
  }

  return { total, advertencias }
}
