/**
 * Cargar la factura de BERGER por los tractores de uno o varios pedidos.
 *
 * Se factura de a TRACTOR, no de a renglón: un renglón de cinco tractores del mismo modelo puede
 * facturarse en tres facturas distintas, a medida que se entregan. Por eso lo que se elige son las
 * unidades de 🛍️Pedidos x UNIDAD —una por tractor—, y el renglón y el pedido quedan en
 * "Facturado Parcialmente" hasta que no les quede ninguna sin facturar.
 *
 * Una factura es de UN concesionario: puede juntar tractores de varios pedidos suyos, nunca de dos
 * concesionarios. Se controla acá y no sólo en la pantalla, porque la factura que sale mezclada es
 * una factura que hay que anular.
 *
 * Igual que en el resto de la venta, nada se revierte: la factura toca cinco tableros y monday no
 * tiene transacciones. Lo que no se pudo escribir vuelve dicho, para corregirlo sabiendo qué pasó.
 */
import { aNumeroEspejo, porId, texto, type ColumnaCruda } from './parse'
import {
  COL_FACTURA,
  COL_FACTURA_SUB,
  COL_INV,
  COL_PEDIDO,
  COL_PEDIDO_SUB,
  COL_VENTA,
  ESTADO_COMERCIAL,
  ESTADO_FACTURA_EMITIDA,
  ESTADO_PEDIDO,
  ESTADO_RENGLON,
  ESTADO_UNIDAD,
  TABLEROS,
} from './columns'
import type { PedidoLeido } from './pedidosBerger'
import { mondayApi, subirArchivoAColumna } from './sdk'

const motivo = (e: unknown): string => (e instanceof Error ? e.message : String(e))

type ItemCrudo = { id: string; name: string; column_values: ColumnaCruda[] }
type ConRelacion = ColumnaCruda & { linked_item_ids?: string[] | null }

const enlazados = (c: ColumnaCruda | undefined): string[] =>
  ((c as ConRelacion | undefined)?.linked_item_ids ?? []).map(String)
const nombreEnlazado = (c: ColumnaCruda | undefined): string =>
  (c?.display_value ?? c?.text ?? '').trim()

/**
 * Una columna de números, tal cual la escribe monday: "1106.105", con punto decimal y sin miles.
 *
 * No se usa `aNumeroEspejo` (que es para los mirrors con formato de moneda): con tres decimales
 * lee el punto como separador de miles, y 1106,105 pasaba a ser un millón.
 */
function numeroDeColumna(c: ColumnaCruda | undefined): number | null {
  const t = texto(c).trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : aNumeroEspejo(t)
}

/* ------------------------------------------------------------------ *
 * Qué se puede facturar
 * ------------------------------------------------------------------ */

/**
 * Los pedidos que no se ofrecen.
 *
 * Los que todavía no tienen tractor asignado (cargados o recién aprobados), los que ya se
 * facturaron enteros y los que se cayeron. "Pedido a Fábrica" no está: puede tener unidades
 * asignadas de stock y otras esperando, y las asignadas se facturan.
 */
export const PEDIDO_NO_FACTURABLE: string[] = [
  ESTADO_PEDIDO.CARGADA,
  ESTADO_PEDIDO.APROBADO,
  ESTADO_PEDIDO.FACTURADO,
  ESTADO_PEDIDO.CANCELADO,
  ESTADO_PEDIDO.RECHAZADO,
]

/** Los estados de la unidad en que el tractor no se puede facturar todavía, o ya se facturó. */
export const UNIDAD_NO_FACTURABLE: string[] = [
  ESTADO_UNIDAD.PENDIENTE,
  ESTADO_UNIDAD.APROBADA,
  ESTADO_UNIDAD.OBSERVACION,
  ESTADO_UNIDAD.RECHAZADA,
  ESTADO_UNIDAD.FACTURADA,
]

/** Los números que se copian de la unidad al subitem de la factura, en el mismo orden. */
const PRECIOS = [
  ['listaSinIva', 'Precio lista s/IVA'],
  ['listaConIva', 'Precio lista c/IVA'],
  ['dto1', 'Dto. contado 1'],
  ['dto2', 'Dto. contado 2'],
  ['dto3', 'Dto. contado 3'],
  ['dto4', 'Dto. contado 4'],
  ['contadoSinIva', 'Lista c/dto. contado s/IVA'],
  ['contadoConIva', 'Lista c/dto. contado c/IVA'],
  ['totalContadoSinIva', 'Total c/dto. contado s/IVA'],
  ['totalContadoConIva', 'Total c/dto. contado c/IVA'],
  ['precioClienteFinal', 'Precio al cliente final'],
  ['precioMaximoUnidad', 'Precio máximo por unidad'],
  ['facturaSinIva', 'Factura s/IVA'],
  ['facturaConIva', 'Factura c/IVA'],
] as const

export type CampoPrecio = (typeof PRECIOS)[number][0]
export const ROTULO_PRECIO: Record<CampoPrecio, string> = Object.fromEntries(PRECIOS) as Record<
  CampoPrecio,
  string
>

/** Una unidad de 🛍️Pedidos x UNIDAD con todo lo que la factura copia de ella. */
export interface UnidadFacturable {
  id: string
  nombre: string
  estado: string
  pedidoId: string
  renglonId: string
  catalogoId: string
  catalogoNombre: string
  inventarioId: string
  inventarioNombre: string
  chasis: string
  concesionarioIds: string[]
  terceroIds: string[]
  terceroNombre: string
  fechaAsignacion: string
  /** `null` = la celda está vacía, que no es lo mismo que cero. */
  precios: Record<CampoPrecio, number | null>
}

const COLUMNAS_UNIDAD = [
  COL_VENTA.estado,
  COL_VENTA.pedido,
  COL_VENTA.subitemPedido,
  COL_VENTA.catalogo,
  COL_VENTA.inventario,
  COL_VENTA.chasis,
  COL_VENTA.concesionario,
  COL_VENTA.tercero,
  COL_VENTA.fechaAsignacion,
  ...PRECIOS.map(([k]) => COL_VENTA[k]),
]

/** Todas las unidades, con sus precios. La pantalla las cruza con los pedidos. */
export async function unidadesParaFacturar(limite = 500): Promise<UnidadFacturable[]> {
  const r = await mondayApi<{ boards: { items_page: { items: ItemCrudo[] } }[] }>(
    'unidadesDeVenta',
    { columnas: COLUMNAS_UNIDAD, limite },
  )
  return (r.boards[0]?.items_page.items ?? []).map((it) => {
    const c = porId(it.column_values)
    return {
      id: it.id,
      nombre: it.name,
      estado: texto(c[COL_VENTA.estado]),
      pedidoId: enlazados(c[COL_VENTA.pedido])[0] ?? '',
      renglonId: enlazados(c[COL_VENTA.subitemPedido])[0] ?? '',
      catalogoId: enlazados(c[COL_VENTA.catalogo])[0] ?? '',
      catalogoNombre: nombreEnlazado(c[COL_VENTA.catalogo]),
      inventarioId: enlazados(c[COL_VENTA.inventario])[0] ?? '',
      inventarioNombre: nombreEnlazado(c[COL_VENTA.inventario]),
      chasis: nombreEnlazado(c[COL_VENTA.chasis]),
      concesionarioIds: enlazados(c[COL_VENTA.concesionario]),
      terceroIds: enlazados(c[COL_VENTA.tercero]),
      terceroNombre: nombreEnlazado(c[COL_VENTA.tercero]),
      fechaAsignacion: texto(c[COL_VENTA.fechaAsignacion]),
      precios: Object.fromEntries(
        PRECIOS.map(([k]) => [k, numeroDeColumna(c[COL_VENTA[k]])]),
      ) as Record<CampoPrecio, number | null>,
    }
  })
}

/**
 * Por qué este tractor no se puede facturar, o `null` si se puede.
 *
 * Además del estado, tiene que tener un tractor del inventario conectado: lo que se factura es un
 * chasis, y es el chasis el que pasa a Facturado en el inventario.
 */
export function porQueNoSeFactura(u: UnidadFacturable): string | null {
  if (u.estado === ESTADO_UNIDAD.FACTURADA) return 'Ya facturado'
  if (UNIDAD_NO_FACTURABLE.includes(u.estado)) return u.estado
  if (!u.inventarioId) return u.estado ? `${u.estado} · sin tractor` : 'Sin tractor asignado'
  return null
}

/** Si el pedido se ofrece: un estado que lo permite y al menos un tractor para facturar. */
export const pedidoFacturable = (p: PedidoLeido, suyas: UnidadFacturable[]): boolean =>
  !PEDIDO_NO_FACTURABLE.includes(p.estado) && suyas.some((u) => !porQueNoSeFactura(u))

/* ------------------------------------------------------------------ *
 * Lo que se escribe
 * ------------------------------------------------------------------ */

export interface AltaFactura {
  /** El número de la factura. Es el nombre del item. */
  numero: string
  fechaEmision: string
  fechaVencimiento: string
  neto: number
  iva: number
  notas: string
  archivo: File
}

export interface ResultadoFactura {
  facturaId: string
  /** Lo que no se pudo hacer. Vacío = salió todo. */
  advertencias: string[]
  /** Cómo quedó cada pedido tocado. */
  pedidos: { id: string; nombre: string; estado: string }[]
}

/** Lo que vale la factura según sus tractores: es lo que la pantalla propone, y se puede corregir. */
export function montosSugeridos(unidades: UnidadFacturable[]): { neto: number; iva: number } {
  const neto = unidades.reduce((s, u) => s + (u.precios.facturaSinIva ?? 0), 0)
  const total = unidades.reduce((s, u) => s + (u.precios.facturaConIva ?? 0), 0)
  return { neto: redondear(neto), iva: redondear(Math.max(total - neto, 0)) }
}

const redondear = (n: number): number => Math.round(n * 100) / 100

/** El nombre de cada tractor dentro de la factura: el modelo y el chasis, que es lo que lo distingue. */
export const nombreDelTractor = (u: UnidadFacturable): string =>
  [u.catalogoNombre || u.nombre, u.chasis || u.inventarioNombre].filter(Boolean).join(' · ')

/**
 * El equipo de monday tal como está en la columna del pedido, para copiarlo igual.
 *
 * Vive en el JSON crudo: el texto trae el nombre del team, y con un nombre no se escribe una
 * columna de personas.
 */
export function equipoDelPedido(p: PedidoLeido): { id: number; kind: string }[] {
  try {
    const v = JSON.parse(p.equipoValor || '{}') as {
      personsAndTeams?: { id: number | string; kind?: string }[]
    }
    return (v.personsAndTeams ?? []).map((x) => ({ id: Number(x.id), kind: x.kind ?? 'person' }))
  } catch {
    return []
  }
}

/**
 * Lo que se copia de la unidad al subitem de la factura, en dos partes.
 *
 * `alCrear` lleva el team, la fecha y los números; `despues`, las conexiones. Van separadas porque
 * monday descarta las conexiones si llegan junto con un team que tiene invitados (ver
 * `completarSubitemDeFactura` en el catálogo).
 */
function valoresDelSubitem(
  u: UnidadFacturable,
  p: PedidoLeido,
): { alCrear: Record<string, unknown>; despues: Record<string, unknown> } {
  const v: Record<string, unknown> = {
    [COL_FACTURA_SUB.inventario]: { item_ids: [Number(u.inventarioId)] },
    [COL_FACTURA_SUB.pedido]: { item_ids: [Number(u.pedidoId)] },
  }
  const concesionario = u.concesionarioIds.length > 0 ? u.concesionarioIds : [p.cuentaId].filter(Boolean)
  if (concesionario.length > 0) {
    v[COL_FACTURA_SUB.concesionario] = { item_ids: concesionario.map(Number) }
  }
  if (u.terceroIds.length > 0) v[COL_FACTURA_SUB.tercero] = { item_ids: u.terceroIds.map(Number) }
  if (u.catalogoId) v[COL_FACTURA_SUB.catalogo] = { item_ids: [Number(u.catalogoId)] }
  if (u.renglonId) v[COL_FACTURA_SUB.renglonDelPedido] = { item_ids: [Number(u.renglonId)] }
  const alCrear: Record<string, unknown> = {}
  const equipo = equipoDelPedido(p)
  if (equipo.length > 0) alCrear[COL_FACTURA_SUB.equipo] = { personsAndTeams: equipo }
  if (u.fechaAsignacion) alCrear[COL_FACTURA_SUB.fechaAsignacion] = { date: u.fechaAsignacion }
  for (const [k] of PRECIOS) {
    const n = u.precios[k]
    if (n !== null) alCrear[COL_FACTURA_SUB[k]] = String(n)
  }
  /* El alta no acepta un `column_values` vacío: si la unidad no tiene nada de eso, va todo junto. */
  if (Object.keys(alCrear).length === 0) return { alCrear: v, despues: {} }
  return { alCrear, despues: v }
}

/**
 * Por qué no se puede cargar esta factura, o `null` si se puede.
 *
 * Es la misma regla que aplica la pantalla, repetida acá para que no dependa de ella.
 */
export function problemaDeFactura(
  elegidas: UnidadFacturable[],
  pedidos: PedidoLeido[],
): string | null {
  if (elegidas.length === 0) return 'Elegí al menos un tractor.'
  const porPedido = new Map(pedidos.map((p) => [p.id, p]))
  const cuentas = new Set<string>()
  for (const u of elegidas) {
    const p = porPedido.get(u.pedidoId)
    if (!p) return `No se encontró el pedido de ${nombreDelTractor(u)}.`
    if (PEDIDO_NO_FACTURABLE.includes(p.estado)) return `${p.nombre} está ${p.estado}: no se factura.`
    const por = porQueNoSeFactura(u)
    if (por) return `${nombreDelTractor(u)} no se puede facturar: ${por}.`
    cuentas.add(p.cuentaId)
  }
  if (cuentas.size > 1) return 'Una factura no puede tener tractores de dos concesionarios.'
  if ([...cuentas][0] === '') return 'El pedido no tiene concesionario: no se sabe a quién facturarle.'
  return null
}

/**
 * Cargar la factura.
 *
 * El orden importa: primero la factura y su PDF, después un subitem por tractor, y recién ahí se
 * mueven los estados. Así, si algo se corta, lo que quedó es una factura con menos filas —que se ve
 * y se completa en monday—, y no tractores marcados como facturados sin factura que lo diga.
 *
 * `todas` son TODAS las unidades leídas: hacen falta para saber si al renglón o al pedido le queda
 * algún tractor sin facturar.
 */
export async function cargarFactura(
  alta: AltaFactura,
  elegidas: UnidadFacturable[],
  pedidos: PedidoLeido[],
  todas: UnidadFacturable[],
): Promise<ResultadoFactura> {
  const problema = problemaDeFactura(elegidas, pedidos)
  if (problema) throw new Error(problema)
  if (!alta.numero.trim()) throw new Error('Falta el número de la factura.')
  if (!alta.archivo) throw new Error('Falta el PDF de la factura.')

  const advertencias: string[] = []
  const porPedido = new Map(pedidos.map((p) => [p.id, p]))
  const primero = porPedido.get(elegidas[0].pedidoId)!
  const equipo = equipoDelPedido(primero)
  const neto = redondear(alta.neto)
  const iva = redondear(alta.iva)

  const valores: Record<string, unknown> = {
    [COL_FACTURA.concesionario]: { item_ids: [Number(primero.cuentaId)] },
    [COL_FACTURA.estado]: { label: ESTADO_FACTURA_EMITIDA },
    [COL_FACTURA.montoNeto]: String(neto),
    [COL_FACTURA.montoIva]: String(iva),
    [COL_FACTURA.montoTotal]: String(redondear(neto + iva)),
  }
  if (neto > 0) valores[COL_FACTURA.ivaPorcentaje] = String(redondear((iva / neto) * 100))
  if (equipo.length > 0) valores[COL_FACTURA.equipo] = { personsAndTeams: equipo }
  if (alta.fechaEmision) valores[COL_FACTURA.fechaEmision] = { date: alta.fechaEmision }
  if (alta.fechaVencimiento) valores[COL_FACTURA.fechaVencimiento] = { date: alta.fechaVencimiento }
  if (alta.notas.trim()) valores[COL_FACTURA.notas] = { text: alta.notas.trim() }

  const r = await mondayApi<{ create_item: { id: string } }>('crearFactura', {
    nombre: alta.numero.trim(),
    valores: JSON.stringify(valores),
  })
  const facturaId = r.create_item.id

  try {
    await subirArchivoAColumna(facturaId, COL_FACTURA.pdf, alta.archivo)
  } catch (e) {
    advertencias.push(`La factura quedó cargada sin el PDF; subilo desde monday: ${motivo(e)}`)
  }

  /* Un subitem por tractor. El que no entra no se marca como facturado: un tractor facturado que
     no figura en ninguna factura es justo lo que no se puede encontrar después. */
  const facturadas: UnidadFacturable[] = []
  for (const u of elegidas) {
    const { alCrear, despues } = valoresDelSubitem(u, porPedido.get(u.pedidoId)!)
    let subitemId: string
    try {
      const s = await mondayApi<{ create_subitem: { id: string } }>('crearSubitemDeFactura', {
        padre: facturaId,
        nombre: nombreDelTractor(u),
        valores: JSON.stringify(alCrear),
      })
      subitemId = s.create_subitem.id
    } catch (e) {
      advertencias.push(`${nombreDelTractor(u)} no entró en la factura y sigue sin facturar: ${motivo(e)}`)
      continue
    }
    if (Object.keys(despues).length > 0) {
      try {
        await mondayApi('completarSubitemDeFactura', { item: subitemId, valores: JSON.stringify(despues) })
      } catch (e) {
        advertencias.push(
          `${nombreDelTractor(u)} entró en la factura sin sus conexiones (tractor, pedido, catálogo): ${motivo(e)}`,
        )
      }
    }
    facturadas.push(u)
  }

  for (const u of facturadas) {
    try {
      await mondayApi('resolverUnidadDeVenta', {
        item: u.id,
        valores: JSON.stringify({ [COL_VENTA.estado]: { label: ESTADO_UNIDAD.FACTURADA } }),
      })
    } catch (e) {
      advertencias.push(`${nombreDelTractor(u)} quedó en la factura pero la unidad no pasó a Facturada: ${motivo(e)}`)
    }
    try {
      await mondayApi('reservarEnInventario', {
        item: u.inventarioId,
        valores: JSON.stringify({ [COL_INV.estadoComercial]: { label: ESTADO_COMERCIAL.FACTURADA } }),
      })
    } catch (e) {
      advertencias.push(`El tractor ${u.chasis || u.inventarioNombre} no pasó a Facturado en el inventario: ${motivo(e)}`)
    }
  }

  /* Facturada = ya lo estaba, o entró recién. */
  const yaFacturada = (u: UnidadFacturable): boolean =>
    u.estado === ESTADO_UNIDAD.FACTURADA || facturadas.some((f) => f.id === u.id)

  const renglones = [...new Set(facturadas.map((u) => u.renglonId).filter(Boolean))]
  for (const renglonId of renglones) {
    const suyas = todas.filter((u) => u.renglonId === renglonId)
    const estado = suyas.every(yaFacturada) ? ESTADO_UNIDAD.FACTURADA : ESTADO_RENGLON.FACTURADO_PARCIAL
    const p = porPedido.get(suyas[0]?.pedidoId ?? '')
    const nombre = p?.renglones.find((x) => x.id === renglonId)?.nombre ?? renglonId
    try {
      await mondayApi('resolverRenglonDePedido', {
        item: renglonId,
        valores: JSON.stringify({ [COL_PEDIDO_SUB.estado]: { label: estado } }),
      })
    } catch (e) {
      advertencias.push(`El renglón ${nombre} quedó con su estado anterior: ${motivo(e)}`)
    }
  }

  const resultadoPedidos: ResultadoFactura['pedidos'] = []
  const pedidosTocados = [...new Set(facturadas.map((u) => u.pedidoId))]
  for (const pedidoId of pedidosTocados) {
    const p = porPedido.get(pedidoId)!
    const suyas = todas.filter((u) => u.pedidoId === pedidoId)
    const estado = suyas.every(yaFacturada) ? ESTADO_PEDIDO.FACTURADO : ESTADO_PEDIDO.FACTURADO_PARCIAL
    try {
      await mondayApi('resolverPedido', {
        item: pedidoId,
        valores: JSON.stringify({
          [COL_PEDIDO.estado]: { label: estado },
          /* Se suma a las que ya tenía: un pedido facturado en tres veces tiene tres facturas. */
          [COL_PEDIDO.facturaVinculada]: {
            item_ids: [...new Set([...p.facturaIds, facturaId])].map(Number),
          },
        }),
      })
      resultadoPedidos.push({ id: pedidoId, nombre: p.nombre, estado })
    } catch (e) {
      advertencias.push(`${p.nombre} quedó con su estado anterior: ${motivo(e)}`)
      resultadoPedidos.push({ id: pedidoId, nombre: p.nombre, estado: p.estado })
    }
  }

  return { facturaId, advertencias, pedidos: resultadoPedidos }
}

/** El enlace a la factura en monday, para el "ver en monday" del resultado. */
export const urlDeFactura = (id: string): string =>
  `https://maquinariasagricolas.monday.com/boards/${TABLEROS.facturas}/pulses/${id}`
