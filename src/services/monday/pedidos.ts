/**
 * VENTA · los pedidos del concesionario.
 *
 * Un pedido se guarda en TRES lugares, y no por capricho del tablero:
 *
 *   🔖Pedidos            el pedido: quién, para quién, cómo paga y los totales.
 *   └ subelementos       un renglón por modelo, con su cantidad y sus precios.
 *   🛍️Ventas             un item por UNIDAD.
 *
 * La tercera es la que importa entender. Un pedido de tres tractores no se aprueba ni se asigna
 * como un bloque: BERGER puede tener dos en stock y el tercero pedirlo a fábrica. Con las
 * unidades sueltas eso se registra; con el pedido entero habría que elegir entre mentir o
 * rechazarlo completo.
 *
 * Si algo falla a mitad, no se deshace nada: se informa qué quedó sin crear. Borrar un pedido ya
 * escrito es peor —queda media información en tres tableros y nadie sabe cuál es la buena— y
 * además el concesionario ya vio que lo mandó.
 */
import { aTextoMonday } from '@/lib/format'
import {
  precioDeUnidad,
  totalesDePedido,
  type DescuentoConfigurado,
  type PrecioDeUnidad,
  type RenglonDePedido,
  type TotalesDePedido,
} from '@/lib/precios'
import {
  COL_PEDIDO,
  COL_PEDIDO_SUB,
  COL_VENTA,
  ESTADO_PEDIDO,
  ESTADO_UNIDAD,
  esContado,
  TIPO_PEDIDO,
} from './columns'
import { mondayApi } from './sdk'
import { obtenerDatosSesion } from './sesion'

const motivo = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** Hoy, en Argentina. */
export function hoy(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Un renglón del pedido tal como lo arma la pantalla. */
export interface RenglonElegido {
  productoId: string
  /** Para el nombre del subelemento y para mostrar. */
  nombre: string
  modelo: string
  cantidad: number
  precioLista: number
  iva: number
}

export interface AltaPedido {
  /** La cuenta del concesionario que pide. */
  cuentaId: string
  /** El equipo de monday de ese concesionario. Sale de la sesión, no de la pantalla. */
  equipoId: string
  /** Cómo se llama, para el nombre del item. */
  cuentaNombre: string
  tipoPedido: string
  /** Sólo si es VENTA A TERCEROS. */
  tipoVenta: string
  /** Las cuentas de los clientes finales. Sólo en VENTA A TERCEROS, y puede ser más de una. */
  clienteIds: string[]
  /** Cómo paga el tercero (VENTA A TERCEROS). */
  condicionVenta: string
  banco: string
  plazo: string
  /** Cómo paga el concesionario (COMPRA STOCK). */
  conceptoPago: string
  renglones: RenglonElegido[]
}

/** Qué falta para poder mandarlo. Vacío = se puede. */
export function faltaParaElPedido(d: AltaPedido): string[] {
  const faltan: string[] = []
  if (!d.cuentaId) faltan.push('el concesionario')
  if (!d.tipoPedido) faltan.push('el tipo de pedido')
  if (d.tipoPedido === TIPO_PEDIDO.TERCEROS) {
    if (!d.tipoVenta) faltan.push('el tipo de venta')
    if (d.clienteIds.length === 0) faltan.push('el cliente final')
    if (!d.condicionVenta) faltan.push('la condición de venta')
  } else if (d.tipoPedido === TIPO_PEDIDO.STOCK) {
    if (!d.conceptoPago) faltan.push('el concepto de pago')
  }
  if (d.renglones.length === 0) faltan.push('al menos un tractor')
  if (d.renglones.some((r) => r.cantidad < 1)) faltan.push('una cantidad válida en cada tractor')
  return faltan
}

/** La forma de pago que corresponde según el tipo de pedido. Es la que decide si hay descuento. */
export const pagoDelPedido = (d: AltaPedido): string =>
  d.tipoPedido === TIPO_PEDIDO.TERCEROS ? d.condicionVenta : d.conceptoPago

/** Los renglones con su precio ya calculado, listos para mostrar y para escribir. */
export function calcularRenglones(
  d: AltaPedido,
  descuentos: DescuentoConfigurado[],
  contado: boolean,
): (RenglonDePedido & { nombre: string; modelo: string })[] {
  return d.renglones.map((r) => ({
    productoId: r.productoId,
    nombre: r.nombre,
    modelo: r.modelo,
    cantidad: r.cantidad,
    precio: precioDeUnidad(r.precioLista, r.iva, descuentos, contado),
  }))
}

export interface ResultadoPedido {
  pedidoId: string
  nombre: string
  /** Un item de 🛍️Ventas por cada unidad. */
  unidades: number
  totales: TotalesDePedido
  advertencias: string[]
}

/** El nombre del item: `ID Pedido - Concesionario`, como lo pidió BERGER. */
const nombreDelPedido = (idPedido: string, cuenta: string): string =>
  [idPedido, cuenta.trim()].filter(Boolean).join(' - ')

/** El de cada unidad: `ID Pedido - ID Venta - Concesionario`. */
const nombreDeLaUnidad = (idPedido: string, idVenta: string, cuenta: string): string =>
  [idPedido, idVenta, cuenta.trim()].filter(Boolean).join(' - ')

/** Las columnas de precio de un subelemento del pedido. */
function preciosDelSubitem(p: PrecioDeUnidad): Record<string, unknown> {
  return {
    [COL_PEDIDO_SUB.listaSinIva]: aTextoMonday(p.listaSinIva),
    [COL_PEDIDO_SUB.listaConIva]: aTextoMonday(p.listaConIva),
    [COL_PEDIDO_SUB.dto1]: aTextoMonday(p.descuentos[0] ?? 0),
    [COL_PEDIDO_SUB.dto2]: aTextoMonday(p.descuentos[1] ?? 0),
    [COL_PEDIDO_SUB.dto3]: aTextoMonday(p.descuentos[2] ?? 0),
    [COL_PEDIDO_SUB.contadoSinIva]: aTextoMonday(p.contadoSinIva),
    [COL_PEDIDO_SUB.contadoConIva]: aTextoMonday(p.contadoConIva),
    [COL_PEDIDO_SUB.facturaSinIva]: aTextoMonday(p.facturaSinIva),
    [COL_PEDIDO_SUB.facturaConIva]: aTextoMonday(p.facturaConIva),
  }
}

/** Las mismas, con los ids del tablero de Ventas. */
function preciosDeLaUnidad(p: PrecioDeUnidad): Record<string, unknown> {
  return {
    [COL_VENTA.listaSinIva]: aTextoMonday(p.listaSinIva),
    [COL_VENTA.listaConIva]: aTextoMonday(p.listaConIva),
    [COL_VENTA.dto1]: aTextoMonday(p.descuentos[0] ?? 0),
    [COL_VENTA.dto2]: aTextoMonday(p.descuentos[1] ?? 0),
    [COL_VENTA.dto3]: aTextoMonday(p.descuentos[2] ?? 0),
    [COL_VENTA.contadoSinIva]: aTextoMonday(p.contadoSinIva),
    [COL_VENTA.contadoConIva]: aTextoMonday(p.contadoConIva),
    [COL_VENTA.facturaSinIva]: aTextoMonday(p.facturaSinIva),
    [COL_VENTA.facturaConIva]: aTextoMonday(p.facturaConIva),
  }
}

/**
 * Crea el pedido entero.
 *
 * El orden es el del circuito: primero el pedido —para tener su ID, que va en el nombre de todo lo
 * demás—, después un subelemento por modelo, y por cada subelemento tantas unidades en 🛍️Ventas
 * como diga la cantidad.
 */
export async function crearPedido(
  d: AltaPedido,
  descuentos: DescuentoConfigurado[],
): Promise<ResultadoPedido> {
  const faltan = faltaParaElPedido(d)
  if (faltan.length > 0) throw new Error(`Falta ${faltan.join(', ')}.`)

  const advertencias: string[] = []
  const contado = esContado(pagoDelPedido(d))
  const renglones = calcularRenglones(d, descuentos, contado)
  const totales = totalesDePedido(renglones)

  /* El comercial que pide es quien está usando la app. No se pregunta: el dato que importa es
     quién lo pidió de verdad, y preguntarlo sería dejar cargar a nombre de otro. */
  let comercialId = 0
  try {
    comercialId = (await obtenerDatosSesion()).userId ?? 0
  } catch {
    /* Fuera de monday no hay sesión. El pedido se crea igual, sin comercial. */
  }

  const valores: Record<string, unknown> = {
    /* El concesionario y el tercero van en columnas distintas: el primero es quien pide y el
       segundo a quién se le vende, y mezclarlos haría imposible saber cuál es cuál. */
    [COL_PEDIDO.cuenta]: { item_ids: [d.cuentaId] },
    [COL_PEDIDO.tipoPedido]: { label: d.tipoPedido },
    [COL_PEDIDO.estado]: { label: ESTADO_PEDIDO.CARGADA },
    [COL_PEDIDO.fechaSolicitud]: { date: hoy() },
    [COL_PEDIDO.totalListaSinIva]: aTextoMonday(totales.listaSinIva),
    [COL_PEDIDO.totalListaConIva]: aTextoMonday(totales.listaConIva),
    [COL_PEDIDO.totalContadoSinIva]: aTextoMonday(totales.contadoSinIva),
    [COL_PEDIDO.totalContadoConIva]: aTextoMonday(totales.contadoConIva),
    [COL_PEDIDO.totalFacturaSinIva]: aTextoMonday(totales.facturaSinIva),
    [COL_PEDIDO.totalFacturaConIva]: aTextoMonday(totales.facturaConIva),
  }
  if (d.clienteIds.length > 0) valores[COL_PEDIDO.tercero] = { item_ids: d.clienteIds }
  if (comercialId) {
    valores[COL_PEDIDO.comercial] = { personsAndTeams: [{ id: comercialId, kind: 'person' }] }
  }
  /* El equipo del concesionario, no una persona: el pedido es del concesionario y lo carga quien
     esté de turno. */
  if (d.equipoId) {
    valores[COL_PEDIDO.equipo] = { personsAndTeams: [{ id: Number(d.equipoId), kind: 'team' }] }
  }
  if (d.tipoPedido === TIPO_PEDIDO.TERCEROS) {
    if (d.tipoVenta) valores[COL_PEDIDO.tipoVenta] = { label: d.tipoVenta }
    if (d.condicionVenta) valores[COL_PEDIDO.condicionVenta] = { labels: [d.condicionVenta] }
    if (d.banco) valores[COL_PEDIDO.banco] = { label: d.banco }
  } else {
    if (d.conceptoPago) valores[COL_PEDIDO.conceptoPago] = { label: d.conceptoPago }
  }
  if (d.plazo) valores[COL_PEDIDO.plazo] = { label: d.plazo }

  /* El nombre lleva el ID del pedido, que monday recién da al crearlo: se crea con un nombre
     provisorio y se renombra enseguida. */
  const creado = await mondayApi<{ create_item: { id: string } }>('crearPedido', {
    nombre: `Pedido de ${d.cuentaNombre.trim()}`,
    valores: JSON.stringify(valores),
  })
  const pedidoId = creado.create_item.id
  const nombre = nombreDelPedido(pedidoId, d.cuentaNombre)

  try {
    await mondayApi('renombrarPedido', { item: pedidoId, nombre })
  } catch (e) {
    advertencias.push(`El pedido se creó pero quedó con el nombre provisorio: ${motivo(e)}`)
  }

  let unidades = 0
  for (const r of renglones) {
    let subitemId = ''
    try {
      const sub = await mondayApi<{ create_subitem: { id: string } }>('crearSubitemDePedido', {
        padre: pedidoId,
        nombre: r.nombre,
        valores: JSON.stringify({
          [COL_PEDIDO_SUB.catalogo]: { item_ids: [r.productoId] },
          [COL_PEDIDO_SUB.estado]: { label: ESTADO_UNIDAD.PENDIENTE },
          [COL_PEDIDO_SUB.cantidad]: aTextoMonday(r.cantidad),
          ...preciosDelSubitem(r.precio),
        }),
      })
      subitemId = sub.create_subitem.id
    } catch (e) {
      advertencias.push(`No se pudo cargar ${r.nombre}: ${motivo(e)}`)
      continue
    }

    /* Una fila de 🛍️Ventas por UNIDAD: es lo que después se aprueba y se asigna de a una. */
    for (let i = 0; i < r.cantidad; i += 1) {
      try {
        const u = await mondayApi<{ create_item: { id: string } }>('crearUnidadDeVenta', {
          nombre: `${nombre} · ${r.nombre}`,
          valores: JSON.stringify({
            [COL_VENTA.concesionario]: { item_ids: [d.cuentaId] },
            [COL_VENTA.catalogo]: { item_ids: [r.productoId] },
            [COL_VENTA.subitemPedido]: { item_ids: [subitemId] },
            [COL_VENTA.pedido]: { item_ids: [pedidoId] },
            [COL_VENTA.estado]: { label: ESTADO_UNIDAD.PENDIENTE },
            ...(comercialId
              ? {
                  [COL_VENTA.comercial]: { personsAndTeams: [{ id: comercialId, kind: 'person' }] },
                }
              : {}),
            ...preciosDeLaUnidad(r.precio),
          }),
        })
        unidades += 1
        try {
          await mondayApi('renombrarUnidadDeVenta', {
            item: u.create_item.id,
            nombre: nombreDeLaUnidad(pedidoId, u.create_item.id, d.cuentaNombre),
          })
        } catch {
          /* El nombre es para leerlo en el tablero; si falla, la unidad ya está y se ve igual. */
        }
      } catch (e) {
        advertencias.push(`No se pudo crear una unidad de ${r.nombre}: ${motivo(e)}`)
      }
    }
  }

  return { pedidoId, nombre, unidades, totales, advertencias }
}
