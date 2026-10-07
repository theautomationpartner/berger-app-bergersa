/**
 * Los pedidos después de cargados: seguirlos, aprobarlos y asignarles inventario.
 *
 * Tres pantallas comparten estas lecturas porque miran lo mismo desde distintos lugares: el
 * concesionario quiere saber en qué anda lo suyo, BERGER qué tiene para aprobar, y después con qué
 * tractor cumple cada unidad. Separarlas en tres servicios habría significado tres formas de leer
 * un pedido y tres lugares donde corregir el día que cambie una columna.
 *
 * Nada de acá revierte nada. Un pedido toca tres tableros —🔖Pedidos, 🛍️Ventas y 🧮Inventario— y
 * monday no tiene transacciones: si falla el tercer paso, deshacer los dos primeros son dos
 * escrituras más que también pueden fallar, y el resultado sería un estado inventado que nadie
 * pidió. En vez de eso, lo que no se pudo hacer vuelve dicho, para que se arregle sabiendo qué
 * pasó.
 */
import { aNumeroEspejo, porId, texto, type ColumnaCruda } from './parse'
import {
  APROBACION,
  COL_ENTREGA,
  COL_ENTREGA_SUB,
  COL_INV,
  COL_PEDIDO,
  COL_PEDIDO_SUB,
  COL_VENTA,
  ESTADO_COMERCIAL,
  ESTADO_ENTREGA_PENDIENTE,
  ESTADO_PEDIDO,
  ESTADO_UNIDAD,
  ESTADO_UNIDAD_ENTREGA_CARGADA,
} from './columns'
import { hoy } from './pedidos'
import { mondayApi } from './sdk'

const motivo = (e: unknown): string => (e instanceof Error ? e.message : String(e))

type ItemCrudo = {
  id: string
  name: string
  column_values: ColumnaCruda[]
  subitems?: ItemCrudo[]
}

type ConRelacion = ColumnaCruda & { linked_item_ids?: string[] | null }

const enlazados = (c: ColumnaCruda | undefined): string[] =>
  ((c as ConRelacion | undefined)?.linked_item_ids ?? []).map(String)

/**
 * El nombre de lo que hay del otro lado de una conexión.
 *
 * Las columnas de conexión devuelven `text: null` igual que los mirrors, y ponen los nombres en
 * `display_value`. Leerlas con `texto()` da siempre vacío, y vacío no parece un error: parece un
 * pedido sin concesionario.
 */
const nombreEnlazado = (c: ColumnaCruda | undefined): string =>
  (c?.display_value ?? c?.text ?? '').trim()

const numero = (c: ColumnaCruda | undefined): number => aNumeroEspejo(texto(c)) ?? 0

/**
 * El id de monday de la primera persona de una columna `people`.
 *
 * Vive en el JSON crudo de la columna y no en su texto: el texto trae el nombre, y con un nombre
 * no se puede mencionar a nadie.
 */
function idDePersona(c: ColumnaCruda | undefined): string {
  try {
    const v = JSON.parse(c?.value ?? '') as {
      personsAndTeams?: { id: number | string; kind?: string }[]
    }
    const persona = (v.personsAndTeams ?? []).find((x) => !x.kind || x.kind === 'person')
    return persona ? String(persona.id) : ''
  } catch {
    return ''
  }
}

/* ------------------------------------------------------------------ *
 * Lo que se lee
 * ------------------------------------------------------------------ */

/** Un renglón del pedido: un modelo con su cantidad. */
export interface RenglonLeido {
  id: string
  nombre: string
  estado: string
  cantidad: number
  catalogoId: string
  facturaSinIva: number
}

export interface PedidoLeido {
  id: string
  nombre: string
  estado: string
  tipoPedido: string
  tipoVenta: string
  /** Cómo se paga: la condición de venta o el concepto, según el tipo. */
  pago: string
  banco: string
  plazo: string
  cuentaId: string
  cuentaNombre: string
  terceroNombre: string
  comercial: string
  /** Su id de monday, para mencionarlo cuando el pedido cambia. */
  comercialId: string
  equipo: string
  aprobComercial: string
  aprobFinanciera: string
  fechaSolicitud: string
  fechaAprobacion: string
  motivo: string
  totalListaSinIva: number
  totalFacturaSinIva: number
  totalFacturaConIva: number
  renglones: RenglonLeido[]
}

/** Una unidad de 🛍️Ventas: un tractor pedido, que se aprueba y se asigna de a uno. */
export interface UnidadLeida {
  id: string
  nombre: string
  estado: string
  pedidoId: string
  renglonId: string
  catalogoId: string
  catalogoNombre: string
  /** El tractor del inventario con el que se la cumple. Vacío = todavía sin asignar. */
  inventarioId: string
  inventarioNombre: string
  facturaSinIva: number
}

/** Un tractor del inventario, de los que se pueden prometer. */
export interface TractorEnStock {
  id: string
  nombre: string
  catalogoId: string
  modelo: string
  chasis: string
  numInterno: string
  estadoComercial: string
  estadoImportacion: string
}

const COLUMNAS_PEDIDO = [
  COL_PEDIDO.estado,
  COL_PEDIDO.tipoPedido,
  COL_PEDIDO.tipoVenta,
  COL_PEDIDO.condicionVenta,
  COL_PEDIDO.conceptoPago,
  COL_PEDIDO.banco,
  COL_PEDIDO.plazo,
  COL_PEDIDO.cuenta,
  COL_PEDIDO.tercero,
  COL_PEDIDO.comercial,
  COL_PEDIDO.equipo,
  COL_PEDIDO.fechaSolicitud,
  COL_PEDIDO.fechaAprobacion,
  COL_PEDIDO.aprobComercial,
  COL_PEDIDO.aprobFinanciera,
  COL_PEDIDO.motivo,
  COL_PEDIDO.totalListaSinIva,
  COL_PEDIDO.totalFacturaSinIva,
  COL_PEDIDO.totalFacturaConIva,
]

const COLUMNAS_RENGLON = [
  COL_PEDIDO_SUB.estado,
  COL_PEDIDO_SUB.cantidad,
  COL_PEDIDO_SUB.catalogo,
  COL_PEDIDO_SUB.facturaSinIva,
]

const COLUMNAS_UNIDAD = [
  COL_VENTA.estado,
  COL_VENTA.pedido,
  COL_VENTA.subitemPedido,
  COL_VENTA.catalogo,
  COL_VENTA.inventario,
  COL_VENTA.facturaSinIva,
]

const COLUMNAS_INVENTARIO = [
  COL_INV.catalogo,
  COL_INV.modelo,
  COL_INV.chasis,
  COL_INV.numInterno,
  COL_INV.estadoComercial,
  COL_INV.estadoPedido,
]

/** Los pedidos, con sus renglones. */
export async function pedidosCargados(limite = 200): Promise<PedidoLeido[]> {
  const r = await mondayApi<{ boards: { items_page: { items: ItemCrudo[] } }[] }>(
    'pedidosCargados',
    { columnas: COLUMNAS_PEDIDO, subColumnas: COLUMNAS_RENGLON, limite },
  )

  return (r.boards[0]?.items_page.items ?? []).map((it) => {
    const c = porId(it.column_values)
    const tipoPedido = texto(c[COL_PEDIDO.tipoPedido])
    return {
      id: it.id,
      nombre: it.name,
      estado: texto(c[COL_PEDIDO.estado]),
      tipoPedido,
      tipoVenta: texto(c[COL_PEDIDO.tipoVenta]),
      /* Según el tipo de pedido, la forma de pago vive en una columna o en la otra. */
      pago: texto(c[COL_PEDIDO.condicionVenta]) || texto(c[COL_PEDIDO.conceptoPago]),
      banco: texto(c[COL_PEDIDO.banco]),
      plazo: texto(c[COL_PEDIDO.plazo]),
      cuentaId: enlazados(c[COL_PEDIDO.cuenta])[0] ?? '',
      cuentaNombre: nombreEnlazado(c[COL_PEDIDO.cuenta]),
      terceroNombre: nombreEnlazado(c[COL_PEDIDO.tercero]),
      comercial: texto(c[COL_PEDIDO.comercial]),
      comercialId: idDePersona(c[COL_PEDIDO.comercial]),
      equipo: texto(c[COL_PEDIDO.equipo]),
      aprobComercial: texto(c[COL_PEDIDO.aprobComercial]) || APROBACION.PENDIENTE,
      aprobFinanciera: texto(c[COL_PEDIDO.aprobFinanciera]) || APROBACION.PENDIENTE,
      fechaSolicitud: texto(c[COL_PEDIDO.fechaSolicitud]),
      fechaAprobacion: texto(c[COL_PEDIDO.fechaAprobacion]),
      motivo: texto(c[COL_PEDIDO.motivo]),
      totalListaSinIva: numero(c[COL_PEDIDO.totalListaSinIva]),
      totalFacturaSinIva: numero(c[COL_PEDIDO.totalFacturaSinIva]),
      totalFacturaConIva: numero(c[COL_PEDIDO.totalFacturaConIva]),
      renglones: (it.subitems ?? []).map((s) => {
        const sc = porId(s.column_values)
        return {
          id: s.id,
          nombre: s.name,
          estado: texto(sc[COL_PEDIDO_SUB.estado]),
          cantidad: numero(sc[COL_PEDIDO_SUB.cantidad]),
          catalogoId: enlazados(sc[COL_PEDIDO_SUB.catalogo])[0] ?? '',
          facturaSinIva: numero(sc[COL_PEDIDO_SUB.facturaSinIva]),
        }
      }),
    }
  })
}

/** Las unidades, todas. Se agrupan por pedido del lado de la pantalla. */
export async function unidadesDeVenta(limite = 500): Promise<UnidadLeida[]> {
  const r = await mondayApi<{ boards: { items_page: { items: ItemCrudo[] } }[] }>(
    'unidadesDeVenta',
    {
      columnas: COLUMNAS_UNIDAD,
      limite,
    },
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
      facturaSinIva: numero(c[COL_VENTA.facturaSinIva]),
    }
  })
}

/** Los tractores del inventario. La pantalla se queda con los que están disponibles. */
export async function tractoresEnStock(limite = 500): Promise<TractorEnStock[]> {
  const r = await mondayApi<{ boards: { items_page: { items: ItemCrudo[] } }[] }>(
    'inventarioParaAsignar',
    { columnas: COLUMNAS_INVENTARIO, limite },
  )

  return (r.boards[0]?.items_page.items ?? []).map((it) => {
    const c = porId(it.column_values)
    return {
      id: it.id,
      nombre: it.name,
      catalogoId: enlazados(c[COL_INV.catalogo])[0] ?? '',
      /* El modelo es un mirror del Catálogo: viene en `display_value`, no en `text`. */
      modelo: nombreEnlazado(c[COL_INV.modelo]),
      chasis: texto(c[COL_INV.chasis]),
      numInterno: texto(c[COL_INV.numInterno]),
      estadoComercial: texto(c[COL_INV.estadoComercial]),
      estadoImportacion: texto(c[COL_INV.estadoPedido]),
    }
  })
}

/**
 * Los estados comerciales que significan que el tractor ya tiene dueño.
 *
 * Se define por lo que está tomado y no por lo que está libre a propósito: hoy los ochenta
 * tractores del inventario tienen el Estado Comercial vacío, y pedir "Disponible" habría dejado la
 * pantalla de asignación sin un solo candidato. Vacío quiere decir que nadie lo reclamó todavía,
 * que es justamente lo que se busca. El día que BERGER empiece a marcarlos, sigue funcionando sin
 * tocar nada.
 */
const YA_TIENE_DUENO: string[] = [
  ESTADO_COMERCIAL.RESERVADA,
  ESTADO_COMERCIAL.ASIGNADA,
  ESTADO_COMERCIAL.FACTURADA,
  ESTADO_COMERCIAL.ENTREGADA,
  ESTADO_COMERCIAL.DEMO,
]

/** Si este tractor se le puede prometer a alguien. */
export const sePuedePrometer = (t: TractorEnStock): boolean =>
  !YA_TIENE_DUENO.includes(t.estadoComercial)

/**
 * Los tractores que se le pueden prometer a una unidad.
 *
 * Mismo modelo del catálogo y sin dueño. El modelo se compara por la conexión al catálogo y no por
 * el texto: dos tractores del mismo modelo pueden tener el nombre escrito distinto, y la conexión
 * no se equivoca.
 *
 * `yaElegidos` son los que se eligieron recién en esta misma pantalla, antes de guardar: sin eso,
 * un pedido de dos unidades del mismo modelo dejaría elegir dos veces el mismo chasis.
 */
export const candidatosPara = (
  unidad: UnidadLeida,
  stock: TractorEnStock[],
  yaElegidos: string[] = [],
): TractorEnStock[] =>
  stock.filter(
    (t) => t.catalogoId === unidad.catalogoId && sePuedePrometer(t) && !yaElegidos.includes(t.id),
  )

/* ------------------------------------------------------------------ *
 * Lo que se escribe
 * ------------------------------------------------------------------ */

export interface Resultado {
  /** Lo que no se pudo hacer. Vacío = salió todo. */
  advertencias: string[]
}

const escribirUnidad = (id: string, valores: Record<string, unknown>) =>
  mondayApi('resolverUnidadDeVenta', { item: id, valores: JSON.stringify(valores) })

const escribirRenglon = (id: string, estado: string) =>
  mondayApi('resolverRenglonDePedido', {
    item: id,
    valores: JSON.stringify({ [COL_PEDIDO_SUB.estado]: { label: estado } }),
  })

/** Cuál de las dos aprobaciones se está contestando. */
export type Aprobacion = 'comercial' | 'financiera'

/**
 * Qué le pasa al pedido con las dos aprobaciones así.
 *
 * Aprobado sólo con las DOS: que el precio cierre no dice que el cliente pueda pagar, y al revés
 * tampoco. Rechazado con que una diga que no, porque con una sola negativa la venta no se hace.
 * Mientras alguna esté pendiente, el pedido sigue esperando y no cambia de estado.
 */
export function estadoSegunAprobaciones(comercial: string, financiera: string): string | null {
  if (comercial === APROBACION.RECHAZADO || financiera === APROBACION.RECHAZADO) {
    return ESTADO_PEDIDO.RECHAZADO
  }
  if (comercial === APROBACION.APROBADO && financiera === APROBACION.APROBADO) {
    return ESTADO_PEDIDO.APROBADO
  }
  return null
}

/** Cómo se lee cada aprobación en un update y en la pantalla. */
const COMO_SE_LLAMA: Record<Aprobacion, string> = {
  comercial: 'comercial',
  financiera: 'financiera',
}

export interface ResultadoResolucion extends Resultado {
  /** Cómo quedaron las dos después de esta respuesta. */
  comercial: string
  financiera: string
  /** El estado al que pasó el pedido, o `''` si todavía espera la otra aprobación. */
  estado: string
}

/**
 * Contestar UNA de las dos aprobaciones.
 *
 * Sólo cuando las dos están contestadas se mueve el estado del pedido, y recién ahí se tocan los
 * renglones y las unidades: aprobar el precio no aprueba nada todavía, y dejar las unidades en
 * "Aprobada" con la financiera pendiente sería decirle al concesionario que ya está.
 */
export async function resolverAprobacion(
  pedido: PedidoLeido,
  unidades: UnidadLeida[],
  cual: Aprobacion,
  aprueba: boolean,
  observacion = '',
): Promise<ResultadoResolucion> {
  const advertencias: string[] = []
  const respuesta = aprueba ? APROBACION.APROBADO : APROBACION.RECHAZADO

  const comercial = cual === 'comercial' ? respuesta : pedido.aprobComercial
  const financiera = cual === 'financiera' ? respuesta : pedido.aprobFinanciera
  const estado = estadoSegunAprobaciones(comercial, financiera)

  const valores: Record<string, unknown> = {
    [cual === 'comercial' ? COL_PEDIDO.aprobComercial : COL_PEDIDO.aprobFinanciera]: {
      label: respuesta,
    },
  }
  if (estado) valores[COL_PEDIDO.estado] = { label: estado }
  if (estado === ESTADO_PEDIDO.APROBADO) {
    valores[COL_PEDIDO.fechaAprobacion] = { date: hoy() }
    /* El motivo se limpia al aprobar: dejar escrito el de un rechazo anterior haría leer un
       rechazo donde hay una aprobación. */
    valores[COL_PEDIDO.motivo] = ''
  }
  /* La observación queda escrita siempre que la haya, aunque el pedido todavía no cambie de
     estado: es lo que explica por qué una de las dos dijo que no. */
  if (observacion.trim()) {
    valores[COL_PEDIDO.motivo] = `Aprobación ${COMO_SE_LLAMA[cual]}: ${observacion.trim()}`
  }

  await mondayApi('resolverPedido', { item: pedido.id, valores: JSON.stringify(valores) })

  /* Los renglones y las unidades se mueven sólo cuando el pedido se movió. */
  if (estado) {
    const aUnidad =
      estado === ESTADO_PEDIDO.APROBADO ? ESTADO_UNIDAD.APROBADA : ESTADO_UNIDAD.RECHAZADA

    for (const r of pedido.renglones) {
      try {
        await escribirRenglon(r.id, aUnidad)
      } catch (e) {
        advertencias.push(`El renglón ${r.nombre} quedó sin actualizar: ${motivo(e)}`)
      }
    }
    for (const u of unidades) {
      try {
        await escribirUnidad(u.id, { [COL_VENTA.estado]: { label: aUnidad } })
      } catch (e) {
        advertencias.push(`Una unidad de ${u.catalogoNombre} quedó sin actualizar: ${motivo(e)}`)
      }
    }
  }

  await avisarAlComercial(
    pedido,
    estado === ESTADO_PEDIDO.APROBADO
      ? `Tu pedido **${pedido.nombre}** quedó **aprobado**. Ya se le puede asignar inventario.`
      : estado === ESTADO_PEDIDO.RECHAZADO
        ? `Tu pedido **${pedido.nombre}** fue **rechazado** en la aprobación ${COMO_SE_LLAMA[cual]}.${
            observacion.trim() ? `\n\nMotivo: ${observacion.trim()}` : ''
          }`
        : `La aprobación ${COMO_SE_LLAMA[cual]} de **${pedido.nombre}** quedó **${respuesta.toLowerCase()}**. Falta la otra.`,
    advertencias,
  )

  return { advertencias, comercial, financiera, estado: estado ?? '' }
}

/**
 * Un update en el pedido mencionando a quien lo cargó.
 *
 * Es lo que hace que el concesionario se entere sin que nadie lo llame. La mención va en
 * `mentions_list` y no incrustada en el texto: monday descarta el marcado del cuerpo, el texto
 * queda y nadie recibe nada.
 *
 * Nunca tira: que no se pueda avisar no puede deshacer una aprobación que ya está escrita.
 */
async function avisarAlComercial(
  pedido: PedidoLeido,
  texto: string,
  advertencias: string[],
): Promise<void> {
  try {
    await mondayApi('crearUpdate', {
      item: pedido.id,
      cuerpo: texto,
      menciones: pedido.comercialId ? [{ id: pedido.comercialId }] : [],
    })
  } catch (e) {
    advertencias.push(
      `El pedido quedó resuelto, pero no se pudo avisar al concesionario: ${motivo(e)}`,
    )
  }
}

/** Aprobar las dos de una vez. Queda para los tests y para el circuito de siempre. */
export async function aprobarPedido(
  pedido: PedidoLeido,
  unidades: UnidadLeida[],
): Promise<Resultado> {
  const uno = await resolverAprobacion(pedido, unidades, 'comercial', true)
  const dos = await resolverAprobacion(
    { ...pedido, aprobComercial: uno.comercial },
    unidades,
    'financiera',
    true,
  )
  return { advertencias: [...uno.advertencias, ...dos.advertencias] }
}

/** Rechazar: alcanza con que una de las dos diga que no. */
export async function rechazarPedido(
  pedido: PedidoLeido,
  unidades: UnidadLeida[],
  porQue: string,
): Promise<Resultado> {
  const advertencias: string[] = []

  await mondayApi('resolverPedido', {
    item: pedido.id,
    valores: JSON.stringify({
      [COL_PEDIDO.estado]: { label: ESTADO_PEDIDO.RECHAZADO },
      [COL_PEDIDO.aprobComercial]: { label: APROBACION.RECHAZADO },
      [COL_PEDIDO.motivo]: porQue.trim(),
    }),
  })

  for (const r of pedido.renglones) {
    try {
      await escribirRenglon(r.id, ESTADO_UNIDAD.RECHAZADA)
    } catch (e) {
      advertencias.push(`El renglón ${r.nombre} quedó sin actualizar: ${motivo(e)}`)
    }
  }
  for (const u of unidades) {
    try {
      await escribirUnidad(u.id, { [COL_VENTA.estado]: { label: ESTADO_UNIDAD.RECHAZADA } })
    } catch (e) {
      advertencias.push(`Una unidad de ${u.catalogoNombre} quedó sin rechazar: ${motivo(e)}`)
    }
  }

  return { advertencias }
}

/** Lo que la pantalla de asignación decidió para cada unidad. */
export interface AsignacionDeUnidad {
  unidadId: string
  /** El tractor del inventario, o `''` si esta unidad se pide a fábrica. */
  tractorId: string
}

export interface ResultadoAsignacion extends Resultado {
  asignadas: number
  aFabrica: number
  /** El id de la entrega creada, si se creó. */
  entregaId: string
}

/**
 * Asignar las unidades de un pedido.
 *
 * Cada unidad se resuelve de a una porque cada una puede resolverse distinto: dos tractores del
 * mismo modelo, uno en stock y el otro a fábrica, es el caso normal y no la excepción.
 *
 * La entrega se crea sólo si quedó algo asignado, y lleva únicamente las unidades que tienen
 * tractor: una entrega con una fila sin chasis es una entrega que el depósito no puede preparar.
 */
export async function asignarPedido(
  pedido: PedidoLeido,
  unidades: UnidadLeida[],
  decisiones: AsignacionDeUnidad[],
): Promise<ResultadoAsignacion> {
  const advertencias: string[] = []
  const porUnidad = new Map(decisiones.map((d) => [d.unidadId, d.tractorId]))
  const asignadas: { unidad: UnidadLeida; tractorId: string }[] = []
  let aFabrica = 0

  for (const u of unidades) {
    const tractorId = porUnidad.get(u.id) ?? ''

    if (!tractorId) {
      try {
        await escribirUnidad(u.id, { [COL_VENTA.estado]: { label: ESTADO_UNIDAD.A_FABRICA } })
        aFabrica += 1
      } catch (e) {
        advertencias.push(`No se pudo pedir a fábrica ${u.catalogoNombre}: ${motivo(e)}`)
      }
      continue
    }

    try {
      await escribirUnidad(u.id, {
        [COL_VENTA.estado]: { label: ESTADO_UNIDAD.ASIGNADA },
        [COL_VENTA.inventario]: { item_ids: [tractorId] },
        [COL_VENTA.fechaAsignacion]: { date: hoy() },
      })
    } catch (e) {
      advertencias.push(`No se pudo asignar ${u.catalogoNombre}: ${motivo(e)}`)
      continue
    }

    /* El tractor queda marcado DESPUÉS de que la unidad quedó escrita: al revés, un fallo en la
       unidad dejaría un tractor reservado para un pedido que no lo tiene. */
    try {
      await mondayApi('reservarEnInventario', {
        item: tractorId,
        valores: JSON.stringify({
          [COL_INV.estadoComercial]: { label: ESTADO_COMERCIAL.ASIGNADA },
        }),
      })
    } catch (e) {
      advertencias.push(
        `${u.catalogoNombre} quedó asignada, pero el tractor sigue figurando disponible en el inventario: ${motivo(e)}`,
      )
    }

    asignadas.push({ unidad: u, tractorId })
  }

  /* El estado del pedido lo decide cómo quedaron sus unidades, no cuál fue la intención. */
  const estadoPedido =
    asignadas.length === 0
      ? ESTADO_PEDIDO.A_FABRICA
      : aFabrica > 0
        ? ESTADO_PEDIDO.A_FABRICA
        : ESTADO_PEDIDO.ASIGNADO
  try {
    await mondayApi('resolverPedido', {
      item: pedido.id,
      valores: JSON.stringify({ [COL_PEDIDO.estado]: { label: estadoPedido } }),
    })
  } catch (e) {
    advertencias.push(`El pedido quedó con su estado anterior: ${motivo(e)}`)
  }

  for (const r of pedido.renglones) {
    const suyas = unidades.filter((u) => u.renglonId === r.id)
    const todasAsignadas =
      suyas.length > 0 && suyas.every((u) => asignadas.some((a) => a.unidad.id === u.id))
    try {
      await escribirRenglon(r.id, todasAsignadas ? ESTADO_UNIDAD.ASIGNADA : ESTADO_UNIDAD.A_FABRICA)
    } catch (e) {
      advertencias.push(`El renglón ${r.nombre} quedó sin actualizar: ${motivo(e)}`)
    }
  }

  let entregaId = ''
  if (asignadas.length > 0) {
    try {
      const e = await mondayApi<{ create_item: { id: string } }>('crearEntrega', {
        nombre: pedido.nombre,
        valores: JSON.stringify({
          [COL_ENTREGA.estado]: { label: ESTADO_ENTREGA_PENDIENTE },
          [COL_ENTREGA.concesionario]: { item_ids: [pedido.cuentaId] },
          [COL_ENTREGA.pedido]: { item_ids: [pedido.id] },
        }),
      })
      entregaId = e.create_item.id

      for (const a of asignadas) {
        try {
          await mondayApi('crearSubitemDeEntrega', {
            padre: entregaId,
            nombre: a.unidad.catalogoNombre || a.unidad.nombre,
            valores: JSON.stringify({
              [COL_ENTREGA_SUB.estado]: { label: ESTADO_UNIDAD_ENTREGA_CARGADA },
              [COL_ENTREGA_SUB.inventario]: { item_ids: [a.tractorId] },
              /* El renglón, no la unidad: esa columna está conectada a los subelementos de
                 🔖Pedidos. Cuál de las unidades del renglón es ésta lo dice el tractor. */
              ...(a.unidad.renglonId
                ? { [COL_ENTREGA_SUB.renglonDelPedido]: { item_ids: [a.unidad.renglonId] } }
                : {}),
            }),
          })
        } catch (err) {
          advertencias.push(`${a.unidad.catalogoNombre} no entró en la entrega: ${motivo(err)}`)
        }
      }
    } catch (e) {
      advertencias.push(
        `Las unidades quedaron asignadas pero no se pudo crear la entrega: ${motivo(e)}`,
      )
    }
  }

  return { advertencias, asignadas: asignadas.length, aFabrica, entregaId }
}

/* ------------------------------------------------------------------ *
 * Novedades
 * ------------------------------------------------------------------ */

/** Una novedad: lo que BERGER escribió en un pedido. */
export interface Novedad {
  id: string
  pedidoId: string
  pedidoNombre: string
  texto: string
  autor: string
  /** ISO con hora, tal como lo devuelve monday. */
  cuando: string
  /** Si menciona a quien está mirando. Las suyas van primero. */
  paraMi: boolean
}

type ItemConUpdates = ItemCrudo & {
  updates?: {
    id: string
    text_body?: string | null
    created_at: string
    creator?: { id: string; name: string } | null
  }[]
}

/**
 * Las novedades de los pedidos de una cuenta.
 *
 * Salen de los updates del item, que es donde quedan escritos los cambios de estado: la API de
 * monday no deja leer las notificaciones de una persona, así que la bandeja se arma con lo que sí
 * se puede leer. El resultado es el mismo para quien lo mira, y además queda en el tablero.
 */
export async function novedadesDePedidos(
  cuentaIds: string[],
  miUsuarioId = '',
  limite = 200,
): Promise<Novedad[]> {
  const r = await mondayApi<{ boards: { items_page: { items: ItemConUpdates[] } }[] }>(
    'novedadesDePedidos',
    { columnas: [COL_PEDIDO.cuenta, COL_PEDIDO.comercial], limite },
  )

  const novedades: Novedad[] = []
  for (const it of r.boards[0]?.items_page.items ?? []) {
    const c = porId(it.column_values)
    const cuentaId = enlazados(c[COL_PEDIDO.cuenta])[0] ?? ''
    if (cuentaIds.length > 0 && !cuentaIds.includes(cuentaId)) continue

    /* "Para mí" es el pedido que cargué yo: es a quien menciona el update que escribe BERGER. */
    const mio = Boolean(miUsuarioId) && idDePersona(c[COL_PEDIDO.comercial]) === miUsuarioId

    for (const u of it.updates ?? []) {
      const texto = (u.text_body ?? '').trim()
      if (!texto) continue
      novedades.push({
        id: u.id,
        pedidoId: it.id,
        pedidoNombre: it.name,
        texto,
        autor: u.creator?.name ?? 'BERGER',
        cuando: u.created_at,
        paraMi: mio,
      })
    }
  }

  return novedades.sort((a, b) => b.cuando.localeCompare(a.cuando))
}

/**
 * Cuáles ya se leyeron.
 *
 * Vive en el navegador y no en monday porque "leído" es de cada persona y de cada máquina, y
 * escribirlo en el tablero significaría una columna más que nadie mira y una escritura por cada
 * vez que alguien abre la pantalla. Si se borran los datos del navegador, se vuelven a ver como
 * nuevas: molesto, no grave.
 */
const CLAVE_LEIDAS = 'berger.novedades.leidas'

export function novedadesLeidas(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_LEIDAS) ?? '[]') as unknown
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

export function marcarLeidas(ids: string[]): void {
  try {
    /* Se guardan las últimas 500: la lista crece con cada update y nadie va a volver a mirar una
       novedad de hace medio año. */
    const todas = [...new Set([...novedadesLeidas(), ...ids])].slice(-500)
    localStorage.setItem(CLAVE_LEIDAS, JSON.stringify(todas))
  } catch {
    /* Sin localStorage —ventana privada, datos bloqueados— todo se ve como nuevo. */
  }
}
