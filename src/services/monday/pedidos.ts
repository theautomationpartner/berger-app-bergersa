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
  TIPO_VENTA,
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
  /** El usuario de monday que está cargando. También sale de la sesión. */
  comercialId?: string
  /** Cómo se llama, para el nombre del item. */
  cuentaNombre: string
  tipoPedido: string
  /** Sólo si es VENTA A TERCEROS. */
  tipoVenta: string
  /**
   * Los clientes finales. Sólo en VENTA DIRECTA, y puede ser más de uno: un tractor se vende a
   * nombre de dos hermanos o de una sociedad y su titular más veces de las que uno creería.
   *
   * Van con el nombre y no sólo con el id porque el nombre del pedido se arma con ellos, y volver
   * a buscarlos en el CRM para escribir un título sería pedirle a monday algo que la pantalla ya
   * tiene en la mano.
   */
  clientes: { id: string; nombre: string }[]
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
    /* Sólo la venta directa necesita el cliente final: en la indirecta BERGER le factura al
       concesionario y a quién le vende él después no es parte de este pedido. */
    if (d.tipoVenta === TIPO_VENTA.DIRECTA && d.clientes.length === 0) {
      faltan.push('el cliente final')
    }
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

/**
 * El nombre del item, en 🔖Pedidos y en 🛍️Ventas: `Concesionario - Cliente final`.
 *
 * Es lo que se lee en el tablero sin abrir nada, y son las dos puntas del pedido. Sin cliente
 * final —compra de stock o venta indirecta, donde BERGER le factura al concesionario— queda sólo
 * el concesionario, que es toda la verdad que hay. Con más de uno van separados por coma: un
 * tractor a nombre de dos titulares es más común de lo que parece.
 *
 * El ID del pedido ya no va en el nombre: vive en su columna `pulse_id`, y repetirlo acá sólo
 * gastaba los primeros doce caracteres de la celda en un número que nadie lee.
 */
const nombreDelPedido = (concesionario: string, clientes: { nombre: string }[]): string => {
  const finales = clientes
    .map((c) => c.nombre.trim())
    .filter(Boolean)
    .join(', ')
  return [concesionario.trim(), finales].filter(Boolean).join(' - ')
}

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
     quién lo pidió de verdad, y preguntarlo sería dejar cargar a nombre de otro.

     Primero el usuario de la sesión de la app, que sale de su fila de la Lista Blanca; el del SDK
     de monday es el respaldo. Es al revés de lo que parece: fuera del iframe —el servidor de
     desarrollo— el SDK no tiene sesión, y entonces el pedido quedaba sin comercial. */
  let comercialId = Number(d.comercialId ?? 0) || 0
  if (!comercialId) {
    try {
      comercialId = (await obtenerDatosSesion()).userId ?? 0
    } catch {
      /* Sin ninguno de los dos el pedido se crea igual, sin comercial. */
    }
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
  const clienteIds = d.clientes.map((c) => c.id)
  if (clienteIds.length > 0) valores[COL_PEDIDO.tercero] = { item_ids: clienteIds }
  if (comercialId) {
    valores[COL_PEDIDO.comercial] = { personsAndTeams: [{ id: comercialId, kind: 'person' }] }
  }
  /* El equipo del concesionario además de la persona: la persona dice quién lo cargó y el equipo,
     de quién es el pedido. Con sólo la persona, el día que esa persona se va el pedido queda
     huérfano; con sólo el equipo, no se sabe a quién preguntarle. */
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

  const nombre = nombreDelPedido(d.cuentaNombre, d.clientes)
  const creado = await mondayApi<{ create_item: { id: string } }>('crearPedido', {
    nombre,
    valores: JSON.stringify(valores),
  })
  const pedidoId = creado.create_item.id

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
        await mondayApi<{ create_item: { id: string } }>('crearUnidadDeVenta', {
          /* El mismo nombre que el pedido: las unidades se leen agrupadas por su pedido, y lo que
             distingue a una de otra —el modelo, la matrícula— está en sus propias columnas. */
          nombre,
          valores: JSON.stringify({
            [COL_VENTA.concesionario]: { item_ids: [d.cuentaId] },
            ...(clienteIds.length > 0 ? { [COL_VENTA.tercero]: { item_ids: clienteIds } } : {}),
            [COL_VENTA.catalogo]: { item_ids: [r.productoId] },
            [COL_VENTA.subitemPedido]: { item_ids: [subitemId] },
            [COL_VENTA.pedido]: { item_ids: [pedidoId] },
            [COL_VENTA.estado]: { label: ESTADO_UNIDAD.PENDIENTE },
            ...(comercialId
              ? {
                  [COL_VENTA.comercial]: { personsAndTeams: [{ id: comercialId, kind: 'person' }] },
                }
              : {}),
            ...(d.equipoId
              ? {
                  [COL_VENTA.concesionarioPersonas]: {
                    personsAndTeams: [{ id: Number(d.equipoId), kind: 'team' }],
                  },
                }
              : {}),
            ...preciosDeLaUnidad(r.precio),
          }),
        })
        unidades += 1
      } catch (e) {
        advertencias.push(`No se pudo crear una unidad de ${r.nombre}: ${motivo(e)}`)
      }
    }
  }

  return { pedidoId, nombre, unidades, totales, advertencias }
}
