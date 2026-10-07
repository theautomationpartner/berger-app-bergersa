/**
 * Catálogo de las operaciones que la app puede hacer contra monday.
 *
 * Antes el cliente le mandaba al proxy una consulta GraphQL y el proxy la reenviaba tal cual. Eso
 * convertía a `/api/monday` en una API completa de la cuenta: cualquier usuario de BERGER con
 * sesión —incluso uno de sólo lectura— podía abrir las herramientas del navegador y ejecutar la
 * consulta que quisiera con el token de la cuenta. El guard comprobaba QUIÉN preguntaba, pero
 * nunca QUÉ preguntaba.
 *
 * Ahora el cliente manda sólo el NOMBRE de una operación de este catálogo. El texto de la consulta
 * lo pone el servidor, así que no se puede falsificar: lo que no está acá, no se puede pedir.
 *
 * Las variables sí siguen viniendo del cliente, y por eso cada operación las valida. Sin esa parte
 * el candado no cerraría: `change_multiple_column_values` con variables libres escribe en
 * cualquier tablero de la cuenta aunque el texto de la mutation esté fijo.
 *
 * Este archivo lo importan las DOS puntas —el cliente para desarrollo, el proxy para producción—
 * a propósito. Con el texto duplicado en los dos lados, un cambio en uno solo compila igual y
 * falla nada más que en producción, que es donde peor se detecta.
 */
import {
  COL_CATALOGO,
  COL_CONFIRMACION,
  COL_CONT_DESPACHO,
  COL_ACTIVIDAD,
  COL_PEDIDO,
  COL_PEDIDO_SUB,
  COL_VENTA,
  COL_CONTACTO,
  COL_CUENTA,
  COL_DESPACHANTE,
  COL_DESPACHANTE_SUB,
  COL_DRAFT,
  COL_INV,
  COL_ENTREGA_SUB,
  COL_ENTREGA,
  COL_LISTA_BLANCA,
  COL_PAGO,
  COL_PAGO_SUB,
  COL_PLANIF,
  TEAM_DE_ETIQUETA,
  TABLEROS,
  TEAM_DESPACHANTES,
} from './columns'

/**
 * Los módulos de la app: dos poblaciones distintas, con permisos distintos.
 *
 * `despacho` es el circuito de BERGER —elegir tractores, pagar, despachar—. `aduana` es lo que
 * hace el despachante externo: actualizar el estado de las OP que ya existen. `aduanaDashboard` es
 * la lectura de conjunto de ese mismo tablero, que es de BERGER y no del externo. `drafts` es lo
 * que pasa ANTES de que el tractor exista: planificar el período de producción de cada draft y
 * mandarle la planificación al proveedor. `fechas` es el ida y vuelta con el proveedor por la
 * fecha de producción de cada tractor.
 *
 * El dashboard es un módulo aparte y no una pantalla más de `aduana` justamente porque el
 * despachante NO lo ve: entra a actualizar sus OP, no a mirar el estado de toda la operación.
 * Como se alimenta de la misma consulta que usa el despachante, separarlo por módulo es lo único
 * que lo distingue del lado del servidor.
 *
 * Cada operación declara el suyo y el servidor comprueba, en cada pedido, que el perfil lo tenga
 * habilitado. Es lo que impide que un despachante pida los pagos del inventario aunque la pantalla
 * no se los muestre.
 */
export const MODULOS_APP = [
  'despacho',
  'aduana',
  'aduanaBerger',
  'aduanaDashboard',
  'drafts',
  'fechas',
  /** Alta y baja de gente en la 🔒Lista Blanca. Sólo Administración. */
  'usuarios',
  /** VENTA · el CRM: cuentas y contactos. */
  'ventas',
  /** VENTA · los pedidos del concesionario. */
  'pedidos',
  /** VENTA · aprobar y asignar pedidos. Es de BERGER. */
  'pedidosBerger',
] as const

export type ModuloApp = (typeof MODULOS_APP)[number]

/** Nombre de cada operación. Es lo único que viaja del cliente al servidor. */
export type NombreOperacion =
  | 'contenedores'
  | 'despachantes'
  | 'puertosDeCatalogo'
  | 'inventarioPorEstadoPago'
  | 'inventarioPorFormaDePago'
  | 'inventarioPaginaSiguiente'
  | 'pagosPendientes'
  | 'datosDeTractores'
  | 'crearPago'
  | 'crearSubitemDePago'
  | 'crearItemDeDespachante'
  | 'crearSubitemDeDespachante'
  | 'fobDelDespacho'
  | 'totalFobDelDespacho'
  | 'prorrateoDeSubitem'
  | 'actualizarColumnas'
  | 'despachosDeAduana'
  | 'despachosPaginaSiguiente'
  | 'actualizarDespacho'
  | 'tractoresDeOp'
  | 'contenedoresDeDespacho'
  | 'contenedoresDelTablero'
  | 'contenedoresDelTableroDespachante'
  | 'etiquetasDeColumna'
  | 'crearActividadCrm'
  | 'actividadesDelTablero'
  | 'completarActividadCrm'
  | 'etiquetasDeActividad'
  | 'crearPedido'
  | 'crearSubitemDePedido'
  | 'crearUnidadDeVenta'
  | 'pedidosCargados'
  | 'unidadesDeVenta'
  | 'inventarioParaAsignar'
  | 'resolverPedido'
  | 'resolverUnidadDeVenta'
  | 'resolverRenglonDePedido'
  | 'reservarEnInventario'
  | 'crearEntrega'
  | 'crearSubitemDeEntrega'
  | 'catalogoDeVenta'
  | 'configuracionDeVenta'
  | 'cuentasDelCrm'
  | 'contactosDelCrm'
  | 'concesionariosDelCrm'
  | 'etiquetasDelCrm'
  | 'crearCuentaCrm'
  | 'actualizarCuentaCrm'
  | 'actualizarContactoCrm'
  | 'crearContactoCrm'
  | 'usuariosDeListaBlanca'
  | 'invitarUsuarioAMonday'
  | 'usuarioPorEmail'
  | 'sumarUsuarioATeam'
  | 'desactivarUsuarioDeMonday'
  | 'crearUsuarioListaBlanca'
  | 'estadoUsuarioListaBlanca'
  | 'etiquetasDeListaBlanca'
  | 'estadoPedidoDesdeAduana'
  | 'estadoPedidoDesdeBerger'
  | 'asignarTurnoContenedor'
  | 'crearContenedorDespacho'
  | 'actualizarContenedorDespacho'
  | 'contactos'
  | 'actualizarOpBerger'
  | 'crearUpdate'
  | 'notificar'
  | 'draftsPorEstado'
  | 'draftsPaginaSiguiente'
  | 'actualizarDraft'
  | 'crearPlanificacion'
  | 'actualizarPlanificacion'
  | 'inventarioPorEstadoFecha'
  | 'inventarioPorIds'
  | 'actualizarFechaProduccion'
  | 'confirmaciones'
  | 'actualizarConfirmacion'

export type Variables = Record<string, unknown>

/** El pedido no corresponde a ninguna operación válida, o sus variables no pasan la validación. */
export class OperacionInvalida extends Error {}

interface Operacion {
  /** A qué módulo pertenece. Sin él, cualquier perfil podría pedir cualquier cosa del catálogo. */
  modulo: ModuloApp
  /**
   * Otros módulos que también la pueden pedir.
   *
   * Casi ninguna operación necesita esto: una operación es de un circuito y de uno solo. La
   * excepción son las del CRM que el concesionario necesita para armar un pedido —buscar la cuenta
   * del cliente final, y darla de alta si no está—, porque el concesionario no tiene el módulo de
   * ventas ni debería tenerlo: eso le abriría el CRM entero.
   *
   * Es una lista explícita y no un "si tenés cualquiera de estos": cada entrada es una decisión
   * sobre quién más puede hacer exactamente esa consulta.
   */
  tambienEn?: readonly ModuloApp[]
  /**
   * Versión de la API de monday con la que tiene que correr ESTA operación.
   *
   * Casi todas usan la de la app (`API_VERSION`). La excepción son las que necesitan algo que
   * todavía no existía entonces: subir la versión de toda la app por una sola consulta obligaría a
   * volver a probar las otras treinta, y cada versión de monday cambia el comportamiento de algo.
   */
  apiVersion?: string
  query: string
  /**
   * Comprueba y normaliza las variables. Puede devolver otras: cuando un valor lo decide el
   * servidor —los ids de tablero, por ejemplo— se reemplaza acá en vez de confiar en el que
   * llegó.
   */
  validar: (v: Variables) => Variables
}

/* ------------------------------------------------------------------ *
 * Validaciones compartidas
 * ------------------------------------------------------------------ */

const TABLEROS_ESCRIBIBLES = new Set<string>([TABLEROS.inventario, TABLEROS.pagos])

/** Columnas que la app puede escribir, por tablero. Cualquier otra se rechaza. */
const COLUMNAS_ESCRIBIBLES: Record<string, Set<string>> = {
  [TABLEROS.inventario]: new Set([COL_INV.estadoPago, COL_INV.estadoPedido]),
  [TABLEROS.pagos]: new Set([
    COL_PAGO.montoTransferencia,
    COL_PAGO.fechaEmision,
    COL_PAGO.estadoPago,
    COL_PAGO.operacionPend,
    COL_PAGO.fechaCargado,
    COL_PAGO.fechaAprobado,
    COL_PAGO.fechaConfirmado,
    COL_PAGO.estadoEmail1,
    COL_PAGO.estadoEmail2,
    COL_PAGO.fechaPagoVista,
    COL_PAGO.contenedores,
    COL_PAGO.tipoPago,
    COL_PAGO.montoPendienteVista,
    COL_PAGO.emailDespacho,
  ]),
  [TABLEROS.pagosSubitems]: new Set([
    COL_PAGO_SUB.valorNeto,
    COL_PAGO_SUB.numDraft,
    COL_PAGO_SUB.codProducto,
    COL_PAGO_SUB.inventario,
  ]),
  [TABLEROS.despachante]: new Set([
    COL_DESPACHANTE.pago,
    COL_DESPACHANTE.despachante,
    COL_DESPACHANTE.cantidadContenedores,
    COL_DESPACHANTE.paisOrigen,
    COL_DESPACHANTE.puertoOrigen,
    COL_DESPACHANTE.proveedor,
    COL_DESPACHANTE.importador,
  ]),
  /* Del draft, la app toca DOS columnas y ninguna más: el período sugerido y el estado. Los
     importes, la lectura del PDF y las conexiones las escribe la automatización que lee el
     documento, y que la app pueda corregirlas a mano sería tapar un problema de lectura. */
  [TABLEROS.drafts]: new Set([COL_DRAFT.periodo, COL_DRAFT.estado]),
  [TABLEROS.planificacion]: new Set([
    COL_PLANIF.tipo,
    COL_PLANIF.fecha,
    COL_PLANIF.drafts,
    COL_PLANIF.estadoEnvio,
  ]),
  [TABLEROS.despachanteSubitems]: new Set([
    COL_DESPACHANTE_SUB.valorNeto,
    COL_DESPACHANTE_SUB.numDraft,
    COL_DESPACHANTE_SUB.codProducto,
    COL_DESPACHANTE_SUB.inventario,
  ]),
}

/**
 * Las ÚNICAS columnas que toca el módulo de Fechas de Producción, en el Inventario.
 *
 * Es una lista aparte de la del circuito de pago —que sólo mueve el Estado Pago— porque son dos
 * módulos distintos sobre el mismo tablero: cada uno puede escribir lo suyo y nada más.
 */
const COLUMNAS_DE_FECHAS = new Set<string>([
  COL_INV.confirmacionFecha,
  COL_INV.estadoFechaProd,
  COL_INV.fechaPropuesta,
])

/**
 * Lo que BERGER completa sobre una OP cuando la carga está por llegar.
 *
 * Es otra lista sobre el MISMO tablero que edita el despachante, y por eso están separadas: el
 * despachante carga el viaje, BERGER carga el pago y la aduana, y ninguno de los dos puede escribir
 * lo del otro.
 */
const COLUMNAS_DE_BERGER = new Set<string>([
  COL_DESPACHANTE.formaPago,
  COL_DESPACHANTE.fondeo,
  COL_DESPACHANTE.bancoDeclarar,
  COL_DESPACHANTE.formaPagoVepArca,
  COL_DESPACHANTE.estadoPagoVepArca,
  COL_DESPACHANTE.formaPagoVepTerminal,
  COL_DESPACHANTE.estadoPagoVepTerminal,
])

/**
 * Lo único que el DESPACHANTE escribe de un contenedor: el turno de carga.
 *
 * Una sola columna. La ubicación de entrega y el transportista los define BERGER, y el arribo se
 * marca cuando la carga llega; que la lista sea de uno es lo que garantiza que no pueda tocar lo
 * demás aunque sepa el id del item.
 */
const COLUMNAS_DE_TURNO = new Set<string>([COL_CONT_DESPACHO.fechaTurno])

/** Lo que se puede escribir de un contenedor del despacho. */
const COLUMNAS_DE_CONTENEDOR = new Set<string>([
  COL_CONT_DESPACHO.numero,
  COL_CONT_DESPACHO.fechaCreacion,
  COL_CONT_DESPACHO.tractores,
  COL_CONT_DESPACHO.inventario,
  COL_CONT_DESPACHO.opDespacho,
  COL_CONT_DESPACHO.ubicacionEntrega,
  COL_CONT_DESPACHO.transportista,
  COL_CONT_DESPACHO.estadoArribo,
  COL_CONT_DESPACHO.fechaArribo,
  COL_CONT_DESPACHO.fechaTurno,
])

/** Lo único que la app escribe de una confirmación: el disparador del envío. */
const COLUMNAS_DE_CONFIRMACION = new Set<string>([COL_CONFIRMACION.estadoPropuesta])

/**
 * Las ÚNICAS columnas que el despachante puede escribir.
 *
 * Es una lista aparte de la que se usa al crear el despacho a propósito: al crearlo, la app
 * completa la conexión al pago, el proveedor y el importador, y ninguna de esas tiene por qué
 * poder cambiarse después desde afuera. Acá está sólo lo que el despachante carga a medida que la
 * mercadería avanza.
 */
const COLUMNAS_DEL_DESPACHANTE = new Set<string>([
  COL_DESPACHANTE.nroOp,
  COL_DESPACHANTE.viaTransporte,
  COL_DESPACHANTE.nroDocTransporte,
  COL_DESPACHANTE.nroDespachoImpo,
  COL_DESPACHANTE.contenedorRef,
  COL_DESPACHANTE.eta,
  COL_DESPACHANTE.buque,
  COL_DESPACHANTE.estadoCarga,
  COL_DESPACHANTE.observaciones,
])

/** Columnas de archivo que se pueden completar, y en qué etapa. */
export const COLUMNAS_ARCHIVO = new Set<string>([
  COL_PAGO.transferencia,
  COL_PAGO.transferenciaConNumero,
  COL_PAGO.comprobanteBanco,
  COL_DESPACHANTE.fcTransporteImpo,
  COL_DESPACHANTE.despachoImpo,
  COL_DESPACHANTE.fcTerminal,
  COL_DESPACHANTE.gastosVarios,
  COL_DESPACHANTE.facturaSenasa,
  COL_DESPACHANTE.facturaModoc,
  COL_DESPACHANTE.facturaPrecintos,
  COL_DESPACHANTE.vepArca,
  COL_DESPACHANTE.vepTerminal,
  COL_DESPACHANTE.comprobanteVepArca,
  COL_DESPACHANTE.comprobanteVepTerminal,
])

/**
 * A qué módulo pertenece cada columna de archivo.
 *
 * Los comprobantes del circuito de pago son del módulo de despacho; los del trámite de aduana, del
 * despachante. Sin esta distinción, habilitar los cuatro comprobantes nuevos le habría dado al
 * despachante externo la posibilidad de subir archivos al circuito de pago.
 */
export const MODULO_DE_ARCHIVO: Record<string, ModuloApp> = {
  [COL_PAGO.transferencia]: 'despacho',
  [COL_PAGO.transferenciaConNumero]: 'despacho',
  [COL_PAGO.comprobanteBanco]: 'despacho',
  [COL_DESPACHANTE.fcTransporteImpo]: 'aduana',
  [COL_DESPACHANTE.despachoImpo]: 'aduana',
  [COL_DESPACHANTE.fcTerminal]: 'aduana',
  [COL_DESPACHANTE.gastosVarios]: 'aduana',
  [COL_DESPACHANTE.facturaSenasa]: 'aduana',
  [COL_DESPACHANTE.facturaModoc]: 'aduana',
  [COL_DESPACHANTE.facturaPrecintos]: 'aduana',
  /* El VEP lo emite el despachante; su comprobante de pago lo sube BERGER. Son dos módulos
     distintos justamente para que ninguno pueda escribir el archivo del otro. */
  [COL_DESPACHANTE.vepArca]: 'aduana',
  [COL_DESPACHANTE.vepTerminal]: 'aduana',
  [COL_DESPACHANTE.comprobanteVepArca]: 'aduanaBerger',
  [COL_DESPACHANTE.comprobanteVepTerminal]: 'aduanaBerger',
}

/**
 * Versión de la API con la que corre `create_update` con menciones.
 *
 * `mentions_list` no existe en 2024-10, que es la versión del resto de la app. Se fija una versión
 * concreta y no "la actual": una versión que se mueve sola es una dependencia que cambia sin que
 * nadie la toque.
 */
const API_CON_MENCIONES = '2025-07'

/** Un id de monday es una cadena de dígitos. Sirve para items, subitems y tableros. */
function idMonday(valor: unknown, campo: string): string {
  const texto = String(valor ?? '')
  if (!/^\d{1,20}$/.test(texto)) throw new OperacionInvalida(`"${campo}" no es un id válido.`)
  return texto
}

/**
 * Entero dentro de un rango.
 *
 * El mínimo es explícito y NO vale 1 por defecto: los índices de las etiquetas de estado empiezan
 * en 0 —"Pend de Aprobar Transf" es justamente el 0—, así que exigir 1 dejaba la operación 2 sin
 * poder pedir nada. Los tamaños de página sí arrancan en 1.
 */
function entero(valor: unknown, campo: string, min: number, max: number): number {
  const n = Number(valor)
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new OperacionInvalida(`"${campo}" fuera de rango.`)
  }
  return n
}

/**
 * Valida el JSON de `column_values` contra las columnas escribibles del tablero.
 *
 * Es la comprobación que de verdad acota el daño: sin ella, la mutation de actualizar —cuyo texto
 * es fijo— igual podría escribir en la columna de sueldos de un item del inventario.
 */
function valoresDeColumnas(valor: unknown, tablero: string): string {
  const permitidas = COLUMNAS_ESCRIBIBLES[tablero]
  if (!permitidas) throw new OperacionInvalida('Tablero no habilitado para escritura.')

  let objeto: unknown
  try {
    objeto = JSON.parse(String(valor ?? ''))
  } catch {
    throw new OperacionInvalida('"column_values" no es JSON válido.')
  }
  if (!objeto || typeof objeto !== 'object' || Array.isArray(objeto)) {
    throw new OperacionInvalida('"column_values" tiene que ser un objeto.')
  }

  const claves = Object.keys(objeto as Record<string, unknown>)
  if (claves.length === 0) throw new OperacionInvalida('"column_values" está vacío.')
  for (const clave of claves) {
    if (!permitidas.has(clave)) {
      throw new OperacionInvalida(`La columna "${clave}" no se puede escribir desde la app.`)
    }
  }
  // Se vuelve a serializar lo YA validado: así no se reenvía el texto original del cliente.
  return JSON.stringify(objeto)
}

/**
 * Valida un `column_values` contra una lista cerrada de columnas.
 *
 * Es el mismo candado que `valoresDeColumnas`, pero con una lista que NO es la del tablero: la usan
 * los módulos que comparten tablero con otro y pueden tocar menos columnas que él. El Inventario es
 * el caso: el circuito de pago mueve el Estado Pago y el módulo de fechas mueve las fechas, y
 * ninguno de los dos puede escribir lo del otro aunque el tablero sea el mismo.
 */
function valoresAcotados(valor: unknown, permitidas: Set<string>, quien: string): string {
  let objeto: unknown
  try {
    objeto = JSON.parse(String(valor ?? ''))
  } catch {
    throw new OperacionInvalida('"column_values" no es JSON válido.')
  }
  if (!objeto || typeof objeto !== 'object' || Array.isArray(objeto)) {
    throw new OperacionInvalida('"column_values" tiene que ser un objeto.')
  }

  const claves = Object.keys(objeto as Record<string, unknown>)
  if (claves.length === 0) throw new OperacionInvalida('"column_values" está vacío.')
  for (const clave of claves) {
    if (!permitidas.has(clave)) {
      throw new OperacionInvalida(`La columna "${clave}" no la puede escribir ${quien}.`)
    }
  }
  return JSON.stringify(objeto)
}

/**
 * Valida lo que escribe el despachante: sólo sus columnas, y sólo en su tablero.
 *
 * Es la misma idea que `valoresDeColumnas`, con una lista distinta. Sin esto, el módulo de aduana
 * —que usan externos— podría escribir la conexión al pago o el importador del despacho.
 */
function valoresDelDespachante(valor: unknown): string {
  let objeto: unknown
  try {
    objeto = JSON.parse(String(valor ?? ''))
  } catch {
    throw new OperacionInvalida('"column_values" no es JSON válido.')
  }
  if (!objeto || typeof objeto !== 'object' || Array.isArray(objeto)) {
    throw new OperacionInvalida('"column_values" tiene que ser un objeto.')
  }

  const claves = Object.keys(objeto as Record<string, unknown>)
  if (claves.length === 0) throw new OperacionInvalida('"column_values" está vacío.')
  for (const clave of claves) {
    if (!COLUMNAS_DEL_DESPACHANTE.has(clave)) {
      throw new OperacionInvalida(`La columna "${clave}" no la puede editar el despachante.`)
    }
  }
  return JSON.stringify(objeto)
}

/** Nombre del item o subitem. Se acota el largo para no reenviar cualquier cosa. */
function nombre(valor: unknown): string {
  const texto = String(valor ?? '').trim()
  if (!texto) throw new OperacionInvalida('Falta el nombre del item.')
  if (texto.length > 255) throw new OperacionInvalida('El nombre del item es demasiado largo.')
  return texto
}

/** Lista de ids de columnas a LEER. No hace falta acotarla: leer una columna de estos tableros
    es exactamente lo que la app hace, y restringirla obligaría a tocar dos archivos por cada
    columna nueva sin cerrar ningún riesgo que no cierre ya la lista de tableros. */
/** Un email con forma de email. Lo que viaja a `invite_users` no puede ser cualquier cosa. */
function email(valor: unknown): string {
  const texto = String(valor ?? '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto)) {
    throw new OperacionInvalida('El email no es válido.')
  }
  return texto
}

/**
 * Un equipo de los que la app conoce.
 *
 * El id del equipo NO puede venir libre del cliente: con un id cualquiera, esta operación sumaría
 * a alguien al equipo de gerencia. Se acepta sólo lo que está en el mapa de etiquetas.
 */
function teamConocido(valor: unknown): string {
  const id = String(valor ?? '').trim()
  if (!Object.values(TEAM_DE_ETIQUETA).includes(id)) {
    throw new OperacionInvalida('Ese equipo no se puede asignar desde la app.')
  }
  return id
}

function idsDeColumnas(valor: unknown): string[] {
  if (!Array.isArray(valor)) throw new OperacionInvalida('Faltan las columnas a leer.')
  return valor.map((c) => {
    const texto = String(c)
    if (!/^[A-Za-z0-9_]{1,64}$/.test(texto)) {
      throw new OperacionInvalida(`Id de columna inválido: "${texto}".`)
    }
    return texto
  })
}

/* ------------------------------------------------------------------ *
 * Fragmentos reutilizados por las consultas
 * ------------------------------------------------------------------ */

/**
 * `... on MirrorValue` y `... on BoardRelationValue` no son opcionales: sin ellos los importes
 * espejados vuelven vacíos y la conexión al Inventario vuelve en `null`.
 */
const CAMPOS_COLUMNA = `
  id
  type
  text
  ... on MirrorValue { display_value }
  # Las conexiones también devuelven text: null y traen los nombres en display_value. Sin pedirlo,
  # de una conexión se lee su lista de ids y nada más: un pedido sin concesionario, una unidad sin
  # modelo. (El comentario va con #: esto es GraphQL, no JavaScript.)
  ... on BoardRelationValue { linked_item_ids display_value }
  ... on LocationValue { lat lng }
`

/**
 * Las actividades, con dos campos que el resto de las consultas no pide.
 *
 * `value` trae el JSON crudo de la columna, y es de donde sale el **id** del responsable: el
 * `text` de una columna de personas es el nombre escrito, y filtrar por nombre significaría que
 * dos personas que se llaman igual comparten la lista de pendientes.
 *
 * `display_value` en las conexiones trae el nombre del cliente y de los contactos. Sin eso, la
 * lista mostraría ids, que no le dicen nada a nadie.
 */
const CONSULTA_ACTIVIDADES = `
  query ($tablero: ID!, $columnas: [String!], $limite: Int!) {
    boards(ids: [$tablero]) {
      items_page(limit: $limite) {
        items {
          id
          name
          column_values(ids: $columnas) {
            id
            text
            value
            ... on BoardRelationValue { linked_item_ids display_value }
          }
        }
      }
    }
  }
`

/** Los items de un tablero del CRM, con las columnas que pida quien llama. */
const CONSULTA_ITEMS_CRM = `
  query ($tablero: ID!, $columnas: [String!], $limite: Int!) {
    boards(ids: [$tablero]) {
      items_page(limit: $limite) {
        items { id name column_values(ids: $columnas) { ${CAMPOS_COLUMNA} } }
      }
    }
  }
`

/**
 * Lo único que la app escribe al dar de alta una cuenta.
 *
 * Es deliberadamente más corta que el tablero: desde acá no se puede dar de baja una cuenta ni
 * tocarle la fecha de baja. El alta da de alta; lo demás se hace en monday, donde queda
 * registrado quién lo hizo.
 */
const COLUMNAS_DE_CUENTA = new Set<string>([
  COL_CUENTA.tipoPersona,
  COL_CUENTA.estado,
  COL_CUENTA.clasificacion,
  COL_CUENTA.categoria,
  COL_CUENTA.cuit,
  COL_CUENTA.condicionFiscal,
  COL_CUENTA.direccion,
  COL_CUENTA.direccionTexto,
  COL_CUENTA.ciudad,
  COL_CUENTA.provincia,
  COL_CUENTA.pais,
  COL_CUENTA.descripcion,
  COL_CUENTA.contactos,
  COL_CUENTA.concesionario,
  COL_CUENTA.fechaAlta,
])

/**
 * Lo que la EDICIÓN de una cuenta puede escribir: lo del alta, menos dos cosas.
 *
 * La fecha de alta y el estado quedan afuera a propósito. El alta las pone una vez —nace Activa,
 * con la fecha de hoy— y después son historia: una edición que pueda moverlas convierte un cambio
 * de dirección en la oportunidad de hacer desaparecer una cuenta o de inventarle una antigüedad.
 * Dar de baja se hace en monday, donde queda registrado quién lo hizo.
 */
const COLUMNAS_DE_CUENTA_EDITABLES = new Set<string>(
  [...COLUMNAS_DE_CUENTA].filter((c) => c !== COL_CUENTA.fechaAlta && c !== COL_CUENTA.estado),
)

/** Lo único que la app escribe al dar de alta un contacto. */
const COLUMNAS_DE_CONTACTO = new Set<string>([
  COL_CONTACTO.nombres,
  COL_CONTACTO.apellidos,
  COL_CONTACTO.estado,
  COL_CONTACTO.categoria,
  COL_CONTACTO.email,
  COL_CONTACTO.pais,
  COL_CONTACTO.whatsapp,
  COL_CONTACTO.comentarios,
  COL_CONTACTO.cuenta,
  COL_CONTACTO.fechaAlta,
])

/** Lo mismo para la edición de un contacto: ni la fecha de alta ni el estado. */
const COLUMNAS_DE_CONTACTO_EDITABLES = new Set<string>(
  [...COLUMNAS_DE_CONTACTO].filter(
    (c) => c !== COL_CONTACTO.fechaAlta && c !== COL_CONTACTO.estado,
  ),
)

/**
 * Lo que el concesionario puede escribir en un pedido.
 *
 * No está el estado del pedido más allá del inicial, ni las fechas de aprobación o de entrega, ni
 * el motivo de rechazo: eso lo mueve BERGER. El concesionario carga su solicitud y a partir de ahí
 * sólo mira.
 */
const COLUMNAS_DE_PEDIDO = new Set<string>([
  COL_PEDIDO.cuenta,
  COL_PEDIDO.tercero,
  COL_PEDIDO.comercial,
  COL_PEDIDO.equipo,
  COL_PEDIDO.tipoPedido,
  COL_PEDIDO.tipoVenta,
  COL_PEDIDO.estado,
  COL_PEDIDO.condicionVenta,
  COL_PEDIDO.banco,
  COL_PEDIDO.plazo,
  COL_PEDIDO.conceptoPago,
  COL_PEDIDO.totalListaSinIva,
  COL_PEDIDO.totalListaConIva,
  COL_PEDIDO.totalContadoSinIva,
  COL_PEDIDO.totalContadoConIva,
  COL_PEDIDO.totalFacturaSinIva,
  COL_PEDIDO.totalFacturaConIva,
  COL_PEDIDO.fechaSolicitud,
])

/** Lo que puede escribir en cada renglón. Los precios los calcula la app, no se tipean. */
const COLUMNAS_DE_PEDIDO_SUB = new Set<string>([
  COL_PEDIDO_SUB.catalogo,
  COL_PEDIDO_SUB.estado,
  COL_PEDIDO_SUB.cantidad,
  COL_PEDIDO_SUB.listaSinIva,
  COL_PEDIDO_SUB.listaConIva,
  COL_PEDIDO_SUB.dto1,
  COL_PEDIDO_SUB.dto2,
  COL_PEDIDO_SUB.dto3,
  COL_PEDIDO_SUB.contadoSinIva,
  COL_PEDIDO_SUB.contadoConIva,
  COL_PEDIDO_SUB.facturaSinIva,
  COL_PEDIDO_SUB.facturaConIva,
])

/**
 * Lo que se escribe al crear una unidad.
 *
 * La conexión al Inventario NO está: asignar una unidad a un tractor concreto es de BERGER, y es
 * justamente lo que el concesionario no puede hacer por su cuenta.
 */
const COLUMNAS_DE_VENTA = new Set<string>([
  COL_VENTA.concesionario,
  COL_VENTA.tercero,
  COL_VENTA.concesionarioPersonas,
  COL_VENTA.comercial,
  COL_VENTA.catalogo,
  COL_VENTA.subitemPedido,
  COL_VENTA.pedido,
  COL_VENTA.estado,
  COL_VENTA.listaSinIva,
  COL_VENTA.listaConIva,
  COL_VENTA.dto1,
  COL_VENTA.dto2,
  COL_VENTA.dto3,
  COL_VENTA.contadoSinIva,
  COL_VENTA.contadoConIva,
  COL_VENTA.facturaSinIva,
  COL_VENTA.facturaConIva,
])

/**
 * Lo que BERGER puede cambiar de un pedido ya cargado.
 *
 * No están los totales ni el concesionario ni los renglones: aprobar un pedido es decir que sí o
 * que no, no reescribirlo. Si el precio está mal, el pedido se rechaza con el motivo y el
 * concesionario lo vuelve a cargar — así queda constancia de que cambió.
 */
const COLUMNAS_DE_RESOLUCION = new Set<string>([
  COL_PEDIDO.estado,
  COL_PEDIDO.motivo,
  COL_PEDIDO.fechaAprobacion,
  COL_PEDIDO.fechaEstimadaEntrega,
])

/** Lo que se le toca a una unidad al aprobarla o asignarla. */
const COLUMNAS_DE_UNIDAD = new Set<string>([
  COL_VENTA.estado,
  COL_VENTA.inventario,
  COL_VENTA.fechaAsignacion,
])

/** Lo del renglón: sólo su estado, que acompaña al de sus unidades. */
const COLUMNAS_DE_RENGLON = new Set<string>([COL_PEDIDO_SUB.estado])

/**
 * Lo que la app le escribe a un tractor del inventario: su estado comercial y nada más.
 *
 * El inventario es el tablero más caro de la cuenta —precios, fechas de producción, despachos— y
 * asignar una unidad no es motivo para poder tocar nada de eso.
 */
const COLUMNAS_DE_INVENTARIO_COMERCIAL = new Set<string>([COL_INV.estadoComercial])

/** Lo que se carga al crear la entrega de un pedido asignado. */
const COLUMNAS_DE_ENTREGA = new Set<string>([
  COL_ENTREGA.estado,
  COL_ENTREGA.concesionario,
  COL_ENTREGA.pedido,
])

/** Y lo de cada unidad dentro de esa entrega. */
const COLUMNAS_DE_ENTREGA_SUB = new Set<string>([
  COL_ENTREGA_SUB.estado,
  COL_ENTREGA_SUB.inventario,
  COL_ENTREGA_SUB.renglonDelPedido,
])

/** Todos los contenedores del tablero. La usan BERGER y el despachante, cada uno con su módulo. */
const CONSULTA_CONTENEDORES = `
  query ($tablero: ID!, $columnas: [String!], $limite: Int!) {
    boards(ids: [$tablero]) {
      items_page(limit: $limite) {
        items { id name column_values(ids: $columnas) { ${CAMPOS_COLUMNA} } }
      }
    }
  }
`

/**
 * Lo único que la app escribe al dar de alta a alguien en la 🔒Lista Blanca.
 *
 * Cada columna de acá es un permiso que se le otorga a una persona, así que la lista es la
 * definición de cuánto puede hacer esta operación. Lo que no está, no se puede tocar: ni el
 * autenticador, ni los perfiles, ni el ID de usuario de monday —que lo completa la automatización
 * cuando la persona acepta la invitación—.
 */
const COLUMNAS_DE_USUARIO = new Set<string>([
  COL_LISTA_BLANCA.nombreCompleto,
  COL_LISTA_BLANCA.estado,
  COL_LISTA_BLANCA.email,
  COL_LISTA_BLANCA.telefono,
  COL_LISTA_BLANCA.apps,
  COL_LISTA_BLANCA.appsIds,
  COL_LISTA_BLANCA.idTeam,
  COL_LISTA_BLANCA.idTableros,
  COL_LISTA_BLANCA.team,
  COL_LISTA_BLANCA.tipoUsuario,
  COL_LISTA_BLANCA.tablerosDespachante,
  COL_LISTA_BLANCA.claseDeFila,
])

/* ------------------------------------------------------------------ *
 * Módulo de ventas: el CRM
 * ------------------------------------------------------------------ */

/**
 * Lo único que la app escribe al crear una actividad.
 *
 * No está el responsable como dato libre: lo pone la app con el usuario de monday que tiene la
 * pantalla abierta. Dejar escribirlo sería permitir cargar una actividad a nombre de otro, y lo
 * que importa de una actividad es quién la hizo de verdad.
 */
const COLUMNAS_DE_ACTIVIDAD = new Set<string>([
  COL_ACTIVIDAD.tipo,
  COL_ACTIVIDAD.cuenta,
  COL_ACTIVIDAD.contactos,
  COL_ACTIVIDAD.responsable,
  COL_ACTIVIDAD.fecha,
  COL_ACTIVIDAD.estado,
  COL_ACTIVIDAD.descripcion,
])

const OPS_CRM = {
  /** Las actividades del tablero. Quién ve cuáles lo decide el cliente, por el responsable. */
  actividadesDelTablero: {
    modulo: 'ventas' as const,
    query: CONSULTA_ACTIVIDADES,
    validar: (v: Record<string, unknown>) => ({
      tablero: TABLEROS.actividades,
      columnas: idsDeColumnas(v.columnas),
      limite: entero(v.limite, 'limite', 1, 500),
    }),
  },

  /**
   * Dar por hecha una actividad. UNA sola columna escribible.
   *
   * Desde acá no se le puede cambiar la fecha, el cliente ni el responsable a una actividad que ya
   * existe: lo único que esta pantalla hace es cerrarla.
   */
  completarActividadCrm: {
    modulo: 'ventas' as const,
    query: `
      mutation ($tablero: ID!, $item: ID!, $valores: JSON!) {
        change_multiple_column_values(board_id: $tablero, item_id: $item, column_values: $valores) { id }
      }
    `,
    validar: (v: Record<string, unknown>) => ({
      tablero: TABLEROS.actividades,
      item: idMonday(v.item, 'item'),
      valores: valoresAcotados(
        v.valores,
        new Set([COL_ACTIVIDAD.estado]),
        'el cierre de una actividad',
      ),
    }),
  },

  /** Una actividad: una llamada, un WhatsApp, una visita. */
  crearActividadCrm: {
    modulo: 'ventas' as const,
    query: `
      mutation ($tablero: ID!, $nombre: String!, $valores: JSON!) {
        create_item(board_id: $tablero, item_name: $nombre, column_values: $valores) { id name }
      }
    `,
    validar: (v: Record<string, unknown>) => ({
      tablero: TABLEROS.actividades,
      nombre: nombre(v.nombre),
      valores: valoresAcotados(v.valores, COLUMNAS_DE_ACTIVIDAD, 'una actividad'),
    }),
  },

  /** Las etiquetas del tipo y el estado de una actividad. */
  etiquetasDeActividad: {
    modulo: 'ventas' as const,
    query: `
      query ($tablero: ID!, $columnas: [String!]) {
        boards(ids: [$tablero]) { columns(ids: $columnas) { id settings_str } }
      }
    `,
    validar: (v: Record<string, unknown>) => ({
      tablero: TABLEROS.actividades,
      columnas: idsDeColumnas(v.columnas),
    }),
  },

  /* ------------------------------------------------------------------ *
   * Módulo de pedidos: lo que carga el concesionario
   * ------------------------------------------------------------------ */

  /** El pedido. El concesionario lo crea; lo que pasa después ya no es suyo. */
  crearPedido: {
    modulo: 'pedidos' as const,
    query: `
      mutation ($tablero: ID!, $nombre: String!, $valores: JSON!) {
        create_item(board_id: $tablero, item_name: $nombre, column_values: $valores) { id }
      }
    `,
    validar: (v: Record<string, unknown>) => ({
      tablero: TABLEROS.pedidos,
      nombre: nombre(v.nombre),
      valores: valoresAcotados(v.valores, COLUMNAS_DE_PEDIDO, 'el alta de un pedido'),
    }),
  },

  /** Un renglón del pedido: un modelo con su cantidad y sus precios. */
  crearSubitemDePedido: {
    modulo: 'pedidos' as const,
    query: `
      mutation ($padre: ID!, $nombre: String!, $valores: JSON!) {
        create_subitem(parent_item_id: $padre, item_name: $nombre, column_values: $valores) { id }
      }
    `,
    validar: (v: Record<string, unknown>) => ({
      padre: idMonday(v.padre, 'padre'),
      nombre: nombre(v.nombre),
      valores: valoresAcotados(v.valores, COLUMNAS_DE_PEDIDO_SUB, 'un renglón del pedido'),
    }),
  },

  /** Una UNIDAD: es lo que después BERGER aprueba y asigna de a una. */
  crearUnidadDeVenta: {
    modulo: 'pedidos' as const,
    query: `
      mutation ($tablero: ID!, $nombre: String!, $valores: JSON!) {
        create_item(board_id: $tablero, item_name: $nombre, column_values: $valores) { id }
      }
    `,
    validar: (v: Record<string, unknown>) => ({
      tablero: TABLEROS.ventas,
      nombre: nombre(v.nombre),
      valores: valoresAcotados(v.valores, COLUMNAS_DE_VENTA, 'una unidad del pedido'),
    }),
  },

  /* ------------------------------------------------------------------ *
   * Pedidos: lo que se lee para seguirlos, aprobarlos y asignarlos
   * ------------------------------------------------------------------ */

  /**
   * Los pedidos con sus renglones.
   *
   * La misma consulta sirve para los dos lados del mostrador —el concesionario mira los suyos,
   * BERGER los de todos— porque lo que cambia no es la consulta sino el filtro, y el filtro lo
   * decide quién pregunta. Por eso `tambienEn`: el módulo que la pide dice para qué pantalla es.
   *
   * El filtro por concesionario se aplica del lado del cliente y no acá. monday no filtra por
   * columna de conexión sin `query_params` sobre el id interno de la relación, que cambia cuando
   * se reordena el tablero; preferible traer la página y filtrar por los ids que ya tenemos.
   */
  pedidosCargados: {
    modulo: 'pedidosBerger' as const,
    tambienEn: ['pedidos'] as const,
    query: `
      query ($tablero: ID!, $columnas: [String!], $subColumnas: [String!], $limite: Int!) {
        boards(ids: [$tablero]) {
          items_page(limit: $limite) {
            items {
              id
              name
              column_values(ids: $columnas) { ${CAMPOS_COLUMNA} }
              subitems { id name column_values(ids: $subColumnas) { ${CAMPOS_COLUMNA} } }
            }
          }
        }
      }
    `,
    validar: (v: Record<string, unknown>) => ({
      tablero: TABLEROS.pedidos,
      columnas: idsDeColumnas(v.columnas),
      subColumnas: idsDeColumnas(v.subColumnas),
      limite: entero(v.limite, 'limite', 1, 500),
    }),
  },

  /** Las unidades de 🛍️Ventas. Una por tractor pedido: son las que se aprueban y se asignan. */
  unidadesDeVenta: {
    modulo: 'pedidosBerger' as const,
    tambienEn: ['pedidos'] as const,
    query: CONSULTA_ITEMS_CRM,
    validar: (v: Record<string, unknown>) => ({
      tablero: TABLEROS.ventas,
      columnas: idsDeColumnas(v.columnas),
      limite: entero(v.limite, 'limite', 1, 500),
    }),
  },

  /**
   * El inventario, para elegir con qué tractor se cumple cada unidad.
   *
   * Es de BERGER y de nadie más: el concesionario pide un modelo, no un chasis. Dejarle ver el
   * inventario sería dejarle ver qué tiene BERGER para vender y a qué precio lo compró.
   */
  inventarioParaAsignar: {
    modulo: 'pedidosBerger' as const,
    query: CONSULTA_ITEMS_CRM,
    validar: (v: Record<string, unknown>) => ({
      tablero: TABLEROS.inventario,
      columnas: idsDeColumnas(v.columnas),
      limite: entero(v.limite, 'limite', 1, 500),
    }),
  },

  /* ------------------------------------------------------------------ *
   * Pedidos: lo que BERGER escribe
   * ------------------------------------------------------------------ */

  /** Aprobar o rechazar un pedido. Las columnas son las cuatro de la resolución. */
  resolverPedido: {
    modulo: 'pedidosBerger' as const,
    query: `
      mutation ($tablero: ID!, $item: ID!, $valores: JSON!) {
        change_multiple_column_values(board_id: $tablero, item_id: $item, column_values: $valores) { id }
      }
    `,
    validar: (v: Record<string, unknown>) => ({
      tablero: TABLEROS.pedidos,
      item: idMonday(v.item, 'item'),
      valores: valoresAcotados(v.valores, COLUMNAS_DE_RESOLUCION, 'la resolución de un pedido'),
    }),
  },

  /** Lo mismo para una unidad: su estado, y el tractor con el que se la cumple. */
  resolverUnidadDeVenta: {
    modulo: 'pedidosBerger' as const,
    query: `
      mutation ($tablero: ID!, $item: ID!, $valores: JSON!) {
        change_multiple_column_values(board_id: $tablero, item_id: $item, column_values: $valores) { id }
      }
    `,
    validar: (v: Record<string, unknown>) => ({
      tablero: TABLEROS.ventas,
      item: idMonday(v.item, 'item'),
      valores: valoresAcotados(v.valores, COLUMNAS_DE_UNIDAD, 'la resolución de una unidad'),
    }),
  },

  /** El estado del renglón, que acompaña al de sus unidades. */
  resolverRenglonDePedido: {
    modulo: 'pedidosBerger' as const,
    query: `
      mutation ($tablero: ID!, $item: ID!, $valores: JSON!) {
        change_multiple_column_values(board_id: $tablero, item_id: $item, column_values: $valores) { id }
      }
    `,
    validar: (v: Record<string, unknown>) => ({
      tablero: TABLEROS.pedidosSubitems,
      item: idMonday(v.item, 'item'),
      valores: valoresAcotados(v.valores, COLUMNAS_DE_RENGLON, 'el estado de un renglón'),
    }),
  },

  /**
   * Marcar un tractor del inventario como asignado.
   *
   * Es lo que evita que el mismo chasis se le prometa a dos concesionarios: la asignación tiene
   * que quedar escrita en el tractor, no sólo en el pedido.
   */
  reservarEnInventario: {
    modulo: 'pedidosBerger' as const,
    query: `
      mutation ($tablero: ID!, $item: ID!, $valores: JSON!) {
        change_multiple_column_values(board_id: $tablero, item_id: $item, column_values: $valores) { id }
      }
    `,
    validar: (v: Record<string, unknown>) => ({
      tablero: TABLEROS.inventario,
      item: idMonday(v.item, 'item'),
      valores: valoresAcotados(
        v.valores,
        COLUMNAS_DE_INVENTARIO_COMERCIAL,
        'la reserva de un tractor',
      ),
    }),
  },

  /** La entrega del pedido, una vez que todas sus unidades tienen tractor. */
  crearEntrega: {
    modulo: 'pedidosBerger' as const,
    query: `
      mutation ($tablero: ID!, $nombre: String!, $valores: JSON!) {
        create_item(board_id: $tablero, item_name: $nombre, column_values: $valores) { id }
      }
    `,
    validar: (v: Record<string, unknown>) => ({
      tablero: TABLEROS.entregas,
      nombre: nombre(v.nombre),
      valores: valoresAcotados(v.valores, COLUMNAS_DE_ENTREGA, 'el alta de una entrega'),
    }),
  },

  /** Una fila por tractor dentro de esa entrega. */
  crearSubitemDeEntrega: {
    modulo: 'pedidosBerger' as const,
    query: `
      mutation ($padre: ID!, $nombre: String!, $valores: JSON!) {
        create_subitem(parent_item_id: $padre, item_name: $nombre, column_values: $valores) { id }
      }
    `,
    validar: (v: Record<string, unknown>) => ({
      padre: idMonday(v.padre, 'padre'),
      nombre: nombre(v.nombre),
      valores: valoresAcotados(v.valores, COLUMNAS_DE_ENTREGA_SUB, 'una unidad de la entrega'),
    }),
  },

  /**
   * El catálogo con el que el concesionario arma su pedido.
   *
   * Es del módulo `pedidos` y no de `ventas`: el concesionario tiene que poder ver los productos
   * y sus precios, que es lo único del CRM a lo que llega.
   */
  catalogoDeVenta: {
    modulo: 'pedidos' as const,
    query: CONSULTA_ITEMS_CRM,
    validar: (v: Record<string, unknown>) => ({
      tablero: TABLEROS.catalogo,
      columnas: idsDeColumnas(v.columnas),
      limite: entero(v.limite, 'limite', 1, 500),
    }),
  },

  /** Los descuentos de contado y el IVA. Sólo se leen: los define BERGER en su tablero. */
  configuracionDeVenta: {
    modulo: 'pedidos' as const,
    query: CONSULTA_ITEMS_CRM,
    validar: (v: Record<string, unknown>) => ({
      tablero: TABLEROS.configuracion,
      columnas: idsDeColumnas(v.columnas),
      limite: entero(v.limite, 'limite', 1, 500),
    }),
  },

  /** Las cuentas, para buscarlas y para controlar que un CUIT no esté repetido. */
  cuentasDelCrm: {
    modulo: 'ventas' as const,
    /* El concesionario la necesita para elegir el cliente final de su pedido. */
    tambienEn: ['pedidos'] as const,
    query: CONSULTA_ITEMS_CRM,
    validar: (v: Record<string, unknown>) => ({
      tablero: TABLEROS.cuentas,
      columnas: idsDeColumnas(v.columnas),
      limite: entero(v.limite, 'limite', 1, 500),
    }),
  },

  /**
   * Los contactos, enteros.
   *
   * Se traen todos y no los de una cuenta porque la comprobación de duplicados necesita mirar el
   * mail y el WhatsApp de cada uno: preguntarlo de a una cuenta sería una consulta por tecla.
   */
  contactosDelCrm: {
    modulo: 'ventas' as const,
    query: CONSULTA_ITEMS_CRM,
    validar: (v: Record<string, unknown>) => ({
      tablero: TABLEROS.contactos,
      columnas: idsDeColumnas(v.columnas),
      limite: entero(v.limite, 'limite', 1, 500),
    }),
  },

  /** Los concesionarios, sólo por nombre: es lo único que se elige de ellos. */
  concesionariosDelCrm: {
    modulo: 'ventas' as const,
    query: `
      query ($tablero: ID!, $limite: Int!) {
        boards(ids: [$tablero]) { items_page(limit: $limite) { items { id name } } }
      }
    `,
    validar: (v: Record<string, unknown>) => ({
      tablero: TABLEROS.concesionarios,
      limite: entero(v.limite, 'limite', 1, 500),
    }),
  },

  /**
   * Las etiquetas de los desplegables de los dos tableros, en una sola consulta.
   *
   * Se leen de monday en vez de estar escritas acá porque una etiqueta inexistente hace fallar la
   * escritura ENTERA del item: si alguien agrega "Contratista" a Categoría, la app la ofrece sin
   * que haya que desplegar nada.
   */
  etiquetasDelCrm: {
    modulo: 'ventas' as const,
    /* El concesionario la necesita para elegir el cliente final de su pedido. */
    tambienEn: ['pedidos'] as const,
    query: `
      query ($tableros: [ID!], $columnasCuenta: [String!], $columnasContacto: [String!]) {
        boards(ids: $tableros) {
          id
          cuenta: columns(ids: $columnasCuenta) { id settings_str }
          contacto: columns(ids: $columnasContacto) { id settings_str }
        }
      }
    `,
    validar: (v: Record<string, unknown>) => ({
      tableros: [TABLEROS.cuentas, TABLEROS.contactos],
      columnasCuenta: idsDeColumnas(v.columnasCuenta),
      columnasContacto: idsDeColumnas(v.columnasContacto),
    }),
  },

  /**
   * Cambiar los datos de una cuenta que ya existe.
   *
   * Escribe las mismas columnas que el alta y además el nombre del item: si cambia la razón
   * social y el nombre queda con la vieja, en el tablero la cuenta sigue llamándose como antes.
   * Las dos cosas van en una sola mutación para que no quede a medias.
   */
  actualizarCuentaCrm: {
    modulo: 'ventas' as const,
    query: `
      mutation ($tablero: ID!, $item: ID!, $nombre: String!, $valores: JSON!) {
        cambiar: change_multiple_column_values(
          board_id: $tablero
          item_id: $item
          column_values: $valores
        ) { id }
        renombrar: change_simple_column_value(
          board_id: $tablero
          item_id: $item
          column_id: "name"
          value: $nombre
        ) { id name }
      }
    `,
    validar: (v: Record<string, unknown>) => ({
      tablero: TABLEROS.cuentas,
      item: idMonday(v.item, 'item'),
      nombre: nombre(v.nombre),
      valores: valoresAcotados(v.valores, COLUMNAS_DE_CUENTA_EDITABLES, 'la edición de una cuenta'),
    }),
  },

  /** Lo mismo para un contacto. */
  actualizarContactoCrm: {
    modulo: 'ventas' as const,
    query: `
      mutation ($tablero: ID!, $item: ID!, $nombre: String!, $valores: JSON!) {
        cambiar: change_multiple_column_values(
          board_id: $tablero
          item_id: $item
          column_values: $valores
        ) { id }
        renombrar: change_simple_column_value(
          board_id: $tablero
          item_id: $item
          column_id: "name"
          value: $nombre
        ) { id name }
      }
    `,
    validar: (v: Record<string, unknown>) => ({
      tablero: TABLEROS.contactos,
      item: idMonday(v.item, 'item'),
      nombre: nombre(v.nombre),
      valores: valoresAcotados(
        v.valores,
        COLUMNAS_DE_CONTACTO_EDITABLES,
        'la edición de un contacto',
      ),
    }),
  },

  /** Alta de una cuenta. El tablero lo fija el servidor y las columnas son una lista cerrada. */
  crearCuentaCrm: {
    modulo: 'ventas' as const,
    /* El concesionario la necesita para elegir el cliente final de su pedido. */
    tambienEn: ['pedidos'] as const,
    query: `
      mutation ($tablero: ID!, $nombre: String!, $valores: JSON!) {
        create_item(board_id: $tablero, item_name: $nombre, column_values: $valores) { id name }
      }
    `,
    validar: (v: Record<string, unknown>) => ({
      tablero: TABLEROS.cuentas,
      nombre: nombre(v.nombre),
      valores: valoresAcotados(v.valores, COLUMNAS_DE_CUENTA, 'el alta de una cuenta'),
    }),
  },

  /** Alta de un contacto. */
  crearContactoCrm: {
    modulo: 'ventas' as const,
    query: `
      mutation ($tablero: ID!, $nombre: String!, $valores: JSON!) {
        create_item(board_id: $tablero, item_name: $nombre, column_values: $valores) { id name }
      }
    `,
    validar: (v: Record<string, unknown>) => ({
      tablero: TABLEROS.contactos,
      nombre: nombre(v.nombre),
      valores: valoresAcotados(v.valores, COLUMNAS_DE_CONTACTO, 'el alta de un contacto'),
    }),
  },
}

/** Escribir el Estado Pedido de UN tractor del Inventario. Nada más que eso. */
const CONSULTA_ESTADO_PEDIDO = `
  mutation ($tablero: ID!, $item: ID!, $valores: JSON!) {
    change_multiple_column_values(board_id: $tablero, item_id: $item, column_values: $valores) { id }
  }
`

const validarEstadoPedido = (v: Record<string, unknown>) => ({
  tablero: TABLEROS.inventario,
  item: idMonday(v.item, 'item'),
  /* Una sola columna escribible, y el tablero lo pone el servidor: desde acá no se puede tocar el
     estado de pago ni ningún otro item que no sea el que se pasa. */
  valores: valoresAcotados(v.valores, new Set([COL_INV.estadoPedido]), 'el estado del tractor'),
})

const validarTablero = (v: Record<string, unknown>) => ({
  tablero: TABLEROS.contenedoresDespacho,
  columnas: idsDeColumnas(v.columnas),
  limite: entero(v.limite, 'limite', 1, 500),
})

/* ------------------------------------------------------------------ *
 * El catálogo
 * ------------------------------------------------------------------ */

export const OPERACIONES: Record<NombreOperacion, Operacion> = {
  ...OPS_CRM,

  /**
   * Las combinaciones del tablero de Contenedores: qué modelos viajan juntos y cuántos entran.
   *
   * Son pocas filas y cambian poco, así que se traen todas de una vez y la app arma los
   * contenedores en el navegador mientras el usuario elige: así el resumen se actualiza en el acto
   * con cada tractor que marca, sin un viaje a monday por cada clic.
   */
  contenedores: {
    modulo: 'despacho',
    query: `
      query ($tablero: ID!, $columnas: [String!], $limite: Int!) {
        boards(ids: [$tablero]) {
          items_page(limit: $limite) {
            items { id name column_values(ids: $columnas) { ${CAMPOS_COLUMNA} } }
          }
        }
      }
    `,
    validar: (v) => ({
      tablero: TABLEROS.contenedores,
      columnas: idsDeColumnas(v.columnas),
      limite: entero(v.limite, 'limite', 1, 500),
    }),
  },

  /**
   * La gente del equipo "Despachantes": a quién se le puede asignar un despacho.
   *
   * El id del equipo lo pone el SERVIDOR y no viene en las variables: con un id libre, cualquiera
   * con sesión podría listar los integrantes —con su mail— de cualquier equipo de la cuenta.
   */
  despachantes: {
    modulo: 'despacho',
    query: `
      query ($equipo: [ID!]) {
        teams(ids: $equipo) {
          id
          name
          users(kind: all) { id name email photo_thumb_small enabled }
        }
      }
    `,
    validar: () => ({ equipo: [TEAM_DESPACHANTES] }),
  },

  /**
   * Puertos de carga de los modelos del Catálogo.
   *
   * Se piden por id —los que salieron de la conexión al Catálogo de cada tractor— y la columna
   * está fija en el texto: es la única del Catálogo que la app mira.
   */
  puertosDeCatalogo: {
    modulo: 'despacho',
    query: `
      query ($ids: [ID!]!) {
        items(ids: $ids) {
          id
          column_values(ids: ["${COL_CATALOGO.puerto}"]) { id type text }
        }
      }
    `,
    validar: (v) => {
      if (!Array.isArray(v.ids) || v.ids.length === 0) {
        throw new OperacionInvalida('Faltan los ids del catálogo.')
      }
      if (v.ids.length > 500) throw new OperacionInvalida('Demasiados ids.')
      return { ids: v.ids.map((id) => idMonday(id, 'ids')) }
    },
  },

  /**
   * Tractores del Inventario filtrados por Estado Pago.
   *
   * El tablero lo pone el servidor. El índice del estado sí viene del cliente, y no hace falta
   * acotarlo a uno solo: pedir otro estado del mismo tablero no muestra nada que la app no pueda
   * mostrar igual.
   */
  inventarioPorEstadoPago: {
    modulo: 'despacho',
    query: `
      query ($tablero: ID!, $columnas: [String!], $estado: CompareValue!, $limite: Int!) {
        boards(ids: [$tablero]) {
          items_page(
            limit: $limite
            query_params: {
              rules: [{ column_id: "${COL_INV.estadoPago}", compare_value: $estado, operator: any_of }]
            }
          ) {
            cursor
            items { id name column_values(ids: $columnas) { ${CAMPOS_COLUMNA} } }
          }
        }
      }
    `,
    validar: (v) => ({
      tablero: TABLEROS.inventario,
      columnas: idsDeColumnas(v.columnas),
      /* Varios estados a la vez: el ANTICIPADO ahora trabaja sobre dos poblaciones —lo que está
         listo para pagar y lo que quedó pendiente de un despacho a la vista— y monday las filtra
         en una sola consulta con `any_of`. */
      estado: (Array.isArray(v.estado) ? v.estado : [v.estado])
        .slice(0, 8)
        .map((e) => entero(e, 'estado', 0, 999)),
      limite: entero(v.limite, 'limite', 1, 500),
    }),
  },

  /**
   * Tractores del Inventario filtrados por Forma de Pago: es la fuente del despacho a la VISTA.
   *
   * Igual que el filtro por estado, el tablero lo fija el servidor y del cliente sólo llega el id
   * de la etiqueta. Monday filtra los `dropdown` por id, no por texto: mandar "VISTA" devuelve una
   * lista vacía sin dar error.
   */
  inventarioPorFormaDePago: {
    modulo: 'despacho',
    query: `
      query ($tablero: ID!, $columnas: [String!], $forma: CompareValue!, $limite: Int!) {
        boards(ids: [$tablero]) {
          items_page(
            limit: $limite
            query_params: {
              rules: [{ column_id: "${COL_INV.formaPago}", compare_value: $forma, operator: any_of }]
            }
          ) {
            cursor
            items { id name column_values(ids: $columnas) { ${CAMPOS_COLUMNA} } }
          }
        }
      }
    `,
    validar: (v) => ({
      tablero: TABLEROS.inventario,
      columnas: idsDeColumnas(v.columnas),
      forma: [entero(Array.isArray(v.forma) ? v.forma[0] : v.forma, 'forma', 0, 999)],
      limite: entero(v.limite, 'limite', 1, 500),
    }),
  },

  /**
   * Páginas siguientes. Monday NO acepta `query_params` junto a un cursor —el filtro ya quedó
   * grabado en el cursor de la primera página—, así que la paginación tiene su propia consulta.
   */
  inventarioPaginaSiguiente: {
    modulo: 'despacho',
    query: `
      query ($cursor: String!, $columnas: [String!], $limite: Int!) {
        next_items_page(cursor: $cursor, limit: $limite) {
          cursor
          items { id name column_values(ids: $columnas) { ${CAMPOS_COLUMNA} } }
        }
      }
    `,
    validar: (v) => {
      const cursor = String(v.cursor ?? '')
      if (!cursor || cursor.length > 4096) throw new OperacionInvalida('Cursor inválido.')
      return {
        cursor,
        columnas: idsDeColumnas(v.columnas),
        limite: entero(v.limite, 'limite', 1, 500),
      }
    },
  },

  /** Pagos pendientes de una operación, con sus subitems. */
  pagosPendientes: {
    modulo: 'despacho',
    query: `
      query ($tablero: ID!, $operacion: CompareValue!, $cols: [String!], $colsSub: [String!], $limite: Int!) {
        boards(ids: [$tablero]) {
          items_page(
            limit: $limite
            query_params: {
              rules: [{ column_id: "${COL_PAGO.operacionPend}", compare_value: $operacion, operator: any_of }]
            }
          ) {
            items {
              id
              name
              column_values(ids: $cols) { id type text }
              subitems { id name column_values(ids: $colsSub) { ${CAMPOS_COLUMNA} } }
            }
          }
        }
      }
    `,
    validar: (v) => ({
      tablero: TABLEROS.pagos,
      operacion: [
        entero(Array.isArray(v.operacion) ? v.operacion[0] : v.operacion, 'operacion', 0, 999),
      ],
      cols: idsDeColumnas(v.cols),
      colsSub: idsDeColumnas(v.colsSub),
      limite: entero(v.limite, 'limite', 1, 500),
    }),
  },

  /**
   * Estado Pago, Modelo, Estado Rodado y Catálogo de los tractores conectados a los subitems de
   * un pago.
   *
   * El tablero de subitems no tiene esas columnas: se leen del item del Inventario al que apunta
   * cada conexión, todos en una sola consulta. El Catálogo viaja porque de ahí cuelga el puerto de
   * carga, que es lo que la operación 3 necesita para el país de origen del despacho.
   *
   * Los ids los elige el cliente, así que en teoría podría pedir items de otro tablero. Las cuatro
   * columnas están FIJAS en el texto de la consulta y son del Inventario: en un item de cualquier
   * otro tablero vuelven vacías, así que no hay nada que sacar por acá.
   */
  datosDeTractores: {
    modulo: 'despacho',
    query: `
      query ($ids: [ID!]!) {
        items(ids: $ids) {
          id
          column_values(ids: ["${COL_INV.estadoPago}", "${COL_INV.modelo}", "${COL_INV.estadoRodado}", "${COL_INV.catalogo}"]) {
            ${CAMPOS_COLUMNA}
          }
        }
      }
    `,
    validar: (v) => {
      if (!Array.isArray(v.ids) || v.ids.length === 0) {
        throw new OperacionInvalida('Faltan los ids de los tractores.')
      }
      if (v.ids.length > 500) throw new OperacionInvalida('Demasiados ids.')
      return { ids: v.ids.map((id) => idMonday(id, 'ids')) }
    },
  },

  /** Item del pago. Sólo en el tablero de Pagos del Inventario. */
  crearPago: {
    modulo: 'despacho',
    query: `
      mutation ($tablero: ID!, $nombre: String!, $valores: JSON!) {
        create_item(board_id: $tablero, item_name: $nombre, column_values: $valores) { id }
      }
    `,
    validar: (v) => ({
      tablero: TABLEROS.pagos,
      nombre: nombre(v.nombre),
      valores: valoresDeColumnas(v.valores, TABLEROS.pagos),
    }),
  },

  /** Un subitem por tractor, colgando del item de pago. */
  crearSubitemDePago: {
    modulo: 'despacho',
    query: `
      mutation ($padre: ID!, $nombre: String!, $valores: JSON!) {
        create_subitem(parent_item_id: $padre, item_name: $nombre, column_values: $valores) { id }
      }
    `,
    validar: (v) => ({
      padre: idMonday(v.padre, 'padre'),
      nombre: nombre(v.nombre),
      valores: valoresDeColumnas(v.valores, TABLEROS.pagosSubitems),
    }),
  },

  /** Item del despacho en el tablero del Despachante de aduana. */
  crearItemDeDespachante: {
    modulo: 'despacho',
    query: `
      mutation ($tablero: ID!, $nombre: String!, $valores: JSON!) {
        create_item(board_id: $tablero, item_name: $nombre, column_values: $valores) { id }
      }
    `,
    validar: (v) => ({
      tablero: TABLEROS.despachante,
      nombre: nombre(v.nombre),
      valores: valoresDeColumnas(v.valores, TABLEROS.despachante),
    }),
  },

  /** Un subitem por tractor, colgando del item del despacho. */
  crearSubitemDeDespachante: {
    modulo: 'despacho',
    query: `
      mutation ($padre: ID!, $nombre: String!, $valores: JSON!) {
        create_subitem(parent_item_id: $padre, item_name: $nombre, column_values: $valores) { id }
      }
    `,
    validar: (v) => ({
      padre: idMonday(v.padre, 'padre'),
      nombre: nombre(v.nombre),
      valores: valoresDeColumnas(v.valores, TABLEROS.despachanteSubitems),
    }),
  },

  /**
   * El FOB de cada tractor del despacho, ya creados los subitems.
   *
   * Es un espejo del Inventario, así que se lee de monday y no se calcula acá: el precio lo carga
   * quien compra, y la app sólo lo suma.
   */
  fobDelDespacho: {
    modulo: 'despacho',
    query: `
      query ($item: [ID!], $columnas: [String!]) {
        items(ids: $item) {
          id
          subitems { id name column_values(ids: $columnas) { ${CAMPOS_COLUMNA} } }
        }
      }
    `,
    validar: (v) => ({ item: [idMonday(v.item, 'item')], columnas: idsDeColumnas(v.columnas) }),
  },

  /**
   * El TOTAL FOB del despacho. Una sola columna, en un solo tablero.
   *
   * No reusa `actualizarColumnas` porque el tablero del Despachante no está entre los escribibles
   * de aquella —la app sólo lo crea— y porque acá alcanza con una columna: cuanto más angosta la
   * operación, menos hay que revisar el día que algo salga mal.
   */
  totalFobDelDespacho: {
    modulo: 'despacho',
    query: `
      mutation ($tablero: ID!, $item: ID!, $valores: JSON!) {
        change_multiple_column_values(board_id: $tablero, item_id: $item, column_values: $valores) { id }
      }
    `,
    validar: (v) => ({
      tablero: TABLEROS.despachante,
      item: idMonday(v.item, 'item'),
      valores: valoresAcotados(
        v.valores,
        new Set([COL_DESPACHANTE.totalFob]),
        'el total FOB del despacho',
      ),
    }),
  },

  /** El % de prorrateo de UN tractor. Misma idea: una columna, un tablero. */
  prorrateoDeSubitem: {
    modulo: 'despacho',
    query: `
      mutation ($tablero: ID!, $item: ID!, $valores: JSON!) {
        change_multiple_column_values(board_id: $tablero, item_id: $item, column_values: $valores) { id }
      }
    `,
    validar: (v) => ({
      tablero: TABLEROS.despachanteSubitems,
      item: idMonday(v.item, 'item'),
      valores: valoresAcotados(
        v.valores,
        new Set([COL_DESPACHANTE_SUB.prorrateo]),
        'el prorrateo de un tractor',
      ),
    }),
  },

  /**
   * Escritura de columnas sobre un item existente: estados del pago y del tractor, y fechas.
   *
   * Es la operación más sensible del catálogo —es la que escribe— y por eso es la que más se
   * valida: el tablero tiene que ser uno de los dos del circuito, y cada columna tocada tiene que
   * estar en la lista de escribibles DE ESE tablero.
   */
  actualizarColumnas: {
    modulo: 'despacho',
    query: `
      mutation ($tablero: ID!, $item: ID!, $valores: JSON!) {
        change_multiple_column_values(board_id: $tablero, item_id: $item, column_values: $valores) { id }
      }
    `,
    validar: (v) => {
      const tablero = idMonday(v.tablero, 'tablero')
      if (!TABLEROS_ESCRIBIBLES.has(tablero)) {
        throw new OperacionInvalida('Ese tablero no se puede escribir desde la app.')
      }
      return {
        tablero,
        item: idMonday(v.item, 'item'),
        valores: valoresDeColumnas(v.valores, tablero),
      }
    },
  },

  /* ------------------------------------------------------------------ *
   * Módulo de aduana: lo que usa el despachante
   * ------------------------------------------------------------------ */

  /**
   * Las OP del tablero del Despachante de aduana.
   *
   * Vienen TODAS y el filtro por estado lo hace la pantalla: son pocas —una por despacho— y así
   * cambiar de estado o buscar por número es instantáneo, sin un viaje a monday por cada tecla.
   */
  despachosDeAduana: {
    modulo: 'aduana',
    query: `
      query ($tablero: ID!, $columnas: [String!], $limite: Int!) {
        boards(ids: [$tablero]) {
          items_page(limit: $limite) {
            cursor
            items { id name column_values(ids: $columnas) { ${CAMPOS_COLUMNA} } }
          }
        }
      }
    `,
    validar: (v) => ({
      tablero: TABLEROS.despachante,
      columnas: idsDeColumnas(v.columnas),
      limite: entero(v.limite, 'limite', 1, 500),
    }),
  },

  /** Páginas siguientes de las OP. Mismo motivo que en el Inventario: el cursor va solo. */
  despachosPaginaSiguiente: {
    modulo: 'aduana',
    query: `
      query ($cursor: String!, $columnas: [String!], $limite: Int!) {
        next_items_page(cursor: $cursor, limit: $limite) {
          cursor
          items { id name column_values(ids: $columnas) { ${CAMPOS_COLUMNA} } }
        }
      }
    `,
    validar: (v) => {
      const cursor = String(v.cursor ?? '')
      if (!cursor || cursor.length > 4096) throw new OperacionInvalida('Cursor inválido.')
      return {
        cursor,
        columnas: idsDeColumnas(v.columnas),
        limite: entero(v.limite, 'limite', 1, 500),
      }
    },
  },

  /**
   * La actualización que hace el despachante sobre una OP.
   *
   * Tiene su propia operación y no reusa `actualizarColumnas` por dos motivos, y los dos son de
   * permisos: el tablero lo fija el servidor —no puede escribir en ningún otro— y las columnas
   * salen de la lista del despachante, que es más chica que la que usa la app al crear el despacho.
   */
  actualizarDespacho: {
    modulo: 'aduana',
    query: `
      mutation ($tablero: ID!, $item: ID!, $valores: JSON!) {
        change_multiple_column_values(board_id: $tablero, item_id: $item, column_values: $valores) { id }
      }
    `,
    validar: (v) => ({
      tablero: TABLEROS.despachante,
      item: idMonday(v.item, 'item'),
      valores: valoresDelDespachante(v.valores),
    }),
  },

  /* ------------------------------------------------------------------ *
   * Módulo de drafts: planificar el período y mandar la planificación
   * ------------------------------------------------------------------ */

  /**
   * Drafts filtrados por Estado, con sus productos.
   *
   * Los subitems vienen en la MISMA consulta y no de a uno: el detalle de un draft son sus
   * productos —qué modelo, cuántos, a cuánto—, y sin eso no se puede decidir para qué período va.
   * Pedirlos aparte serían veinte viajes a monday para dibujar una lista.
   */
  draftsPorEstado: {
    modulo: 'drafts',
    query: `
      query ($tablero: ID!, $estado: CompareValue!, $columnas: [String!], $colsSub: [String!], $limite: Int!) {
        boards(ids: [$tablero]) {
          items_page(
            limit: $limite
            query_params: {
              rules: [{ column_id: "${COL_DRAFT.estado}", compare_value: $estado, operator: any_of }]
            }
          ) {
            cursor
            items {
              id
              name
              column_values(ids: $columnas) { ${CAMPOS_COLUMNA} }
              subitems { id name column_values(ids: $colsSub) { ${CAMPOS_COLUMNA} } }
            }
          }
        }
      }
    `,
    validar: (v) => ({
      tablero: TABLEROS.drafts,
      estado: [entero(Array.isArray(v.estado) ? v.estado[0] : v.estado, 'estado', 0, 999)],
      columnas: idsDeColumnas(v.columnas),
      colsSub: idsDeColumnas(v.colsSub),
      limite: entero(v.limite, 'limite', 1, 500),
    }),
  },

  /** Páginas siguientes de los drafts. El cursor ya lleva el filtro adentro. */
  draftsPaginaSiguiente: {
    modulo: 'drafts',
    query: `
      query ($cursor: String!, $columnas: [String!], $colsSub: [String!], $limite: Int!) {
        next_items_page(cursor: $cursor, limit: $limite) {
          cursor
          items {
            id
            name
            column_values(ids: $columnas) { ${CAMPOS_COLUMNA} }
            subitems { id name column_values(ids: $colsSub) { ${CAMPOS_COLUMNA} } }
          }
        }
      }
    `,
    validar: (v) => {
      const cursor = String(v.cursor ?? '')
      if (!cursor || cursor.length > 4096) throw new OperacionInvalida('Cursor inválido.')
      return {
        cursor,
        columnas: idsDeColumnas(v.columnas),
        colsSub: idsDeColumnas(v.colsSub),
        limite: entero(v.limite, 'limite', 1, 500),
      }
    },
  },

  /** El período y el estado de UN draft. El tablero lo fija el servidor. */
  actualizarDraft: {
    modulo: 'drafts',
    query: `
      mutation ($tablero: ID!, $item: ID!, $valores: JSON!) {
        change_multiple_column_values(board_id: $tablero, item_id: $item, column_values: $valores) { id }
      }
    `,
    validar: (v) => ({
      tablero: TABLEROS.drafts,
      item: idMonday(v.item, 'item'),
      valores: valoresDeColumnas(v.valores, TABLEROS.drafts),
    }),
  },

  /** El item de la planificación que se le manda al proveedor. */
  crearPlanificacion: {
    modulo: 'drafts',
    query: `
      mutation ($tablero: ID!, $nombre: String!, $valores: JSON!) {
        create_item(board_id: $tablero, item_name: $nombre, column_values: $valores) { id }
      }
    `,
    validar: (v) => ({
      tablero: TABLEROS.planificacion,
      nombre: nombre(v.nombre),
      valores: valoresDeColumnas(v.valores, TABLEROS.planificacion),
    }),
  },

  /** El estado de envío de una planificación ya creada. */
  actualizarPlanificacion: {
    modulo: 'drafts',
    query: `
      mutation ($tablero: ID!, $item: ID!, $valores: JSON!) {
        change_multiple_column_values(board_id: $tablero, item_id: $item, column_values: $valores) { id }
      }
    `,
    validar: (v) => ({
      tablero: TABLEROS.planificacion,
      item: idMonday(v.item, 'item'),
      valores: valoresDeColumnas(v.valores, TABLEROS.planificacion),
    }),
  },

  /* ------------------------------------------------------------------ *
   * Módulo de fechas de producción: el ida y vuelta con el proveedor
   * ------------------------------------------------------------------ */

  /**
   * Tractores del Inventario filtrados por el estado de confirmación de la fecha.
   *
   * Trae también la conexión a la Confirmación: sin ella no se puede ni confirmar ni proponer, y
   * saberlo ANTES de elegir es lo que evita que el usuario arme una tanda que después no se puede
   * guardar.
   */
  inventarioPorEstadoFecha: {
    modulo: 'fechas',
    query: `
      query ($tablero: ID!, $columnas: [String!], $estado: CompareValue!, $limite: Int!) {
        boards(ids: [$tablero]) {
          items_page(
            limit: $limite
            query_params: {
              rules: [{ column_id: "${COL_INV.confirmacionFecha}", compare_value: $estado, operator: any_of }]
            }
          ) {
            cursor
            items { id name column_values(ids: $columnas) { ${CAMPOS_COLUMNA} } }
          }
        }
      }
    `,
    validar: (v) => ({
      tablero: TABLEROS.inventario,
      columnas: idsDeColumnas(v.columnas),
      estado: [entero(Array.isArray(v.estado) ? v.estado[0] : v.estado, 'estado', 0, 999)],
      limite: entero(v.limite, 'limite', 1, 500),
    }),
  },

  /**
   * Items del Inventario por id: los que cuelgan de una confirmación.
   *
   * Los ids los elige el cliente, pero las columnas las fija el servidor y son del Inventario: en
   * un item de otro tablero vuelven vacías, así que no hay nada que sacar por acá.
   */
  inventarioPorIds: {
    modulo: 'fechas',
    query: `
      query ($ids: [ID!]!, $columnas: [String!]) {
        items(ids: $ids) { id name column_values(ids: $columnas) { ${CAMPOS_COLUMNA} } }
      }
    `,
    validar: (v) => {
      if (!Array.isArray(v.ids) || v.ids.length === 0) {
        throw new OperacionInvalida('Faltan los ids del Inventario.')
      }
      if (v.ids.length > 500) throw new OperacionInvalida('Demasiados ids.')
      return { ids: v.ids.map((id) => idMonday(id, 'ids')), columnas: idsDeColumnas(v.columnas) }
    },
  },

  /** La decisión sobre la fecha de UN tractor: confirmada, o con otra propuesta. */
  actualizarFechaProduccion: {
    modulo: 'fechas',
    query: `
      mutation ($tablero: ID!, $item: ID!, $valores: JSON!) {
        change_multiple_column_values(board_id: $tablero, item_id: $item, column_values: $valores) { id }
      }
    `,
    validar: (v) => ({
      tablero: TABLEROS.inventario,
      item: idMonday(v.item, 'item'),
      valores: valoresAcotados(v.valores, COLUMNAS_DE_FECHAS, 'el módulo de fechas'),
    }),
  },

  /** Las confirmaciones que mandó el proveedor, con los tractores que traen conectados. */
  confirmaciones: {
    modulo: 'fechas',
    query: `
      query ($tablero: ID!, $tipo: CompareValue!, $columnas: [String!], $limite: Int!) {
        boards(ids: [$tablero]) {
          items_page(
            limit: $limite
            query_params: {
              rules: [{ column_id: "${COL_CONFIRMACION.tipo}", compare_value: $tipo, operator: any_of }]
            }
          ) {
            items {
              id
              name
              column_values(ids: $columnas) { ${CAMPOS_COLUMNA} ... on LinkValue { url } }
            }
          }
        }
      }
    `,
    validar: (v) => ({
      tablero: TABLEROS.planificacion,
      tipo: [entero(Array.isArray(v.tipo) ? v.tipo[0] : v.tipo, 'tipo', 0, 999)],
      columnas: idsDeColumnas(v.columnas),
      limite: entero(v.limite, 'limite', 1, 500),
    }),
  },

  /** El disparador del envío de una confirmación. Es lo único que la app le escribe. */
  actualizarConfirmacion: {
    modulo: 'fechas',
    query: `
      mutation ($tablero: ID!, $item: ID!, $valores: JSON!) {
        change_multiple_column_values(board_id: $tablero, item_id: $item, column_values: $valores) { id }
      }
    `,
    validar: (v) => ({
      tablero: TABLEROS.planificacion,
      item: idMonday(v.item, 'item'),
      valores: valoresAcotados(v.valores, COLUMNAS_DE_CONFIRMACION, 'el módulo de fechas'),
    }),
  },

  /* ------------------------------------------------------------------ *
   * Contenedores del despacho, avisos y lo que completa BERGER
   * ------------------------------------------------------------------ */

  /**
   * Los tractores de una OP: los subitems del Despachante, con su chasis y su contenedor.
   *
   * El chasis es un espejo del Inventario y es lo único que distingue dos tractores del mismo
   * modelo, así que viaja siempre: sin él, armar contenedores sería adivinar.
   */
  tractoresDeOp: {
    modulo: 'aduana',
    query: `
      query ($ids: [ID!]!, $columnas: [String!]) {
        items(ids: $ids) {
          id
          name
          subitems { id name column_values(ids: $columnas) { ${CAMPOS_COLUMNA} } }
        }
      }
    `,
    validar: (v) => {
      if (!Array.isArray(v.ids) || v.ids.length === 0) throw new OperacionInvalida('Faltan las OP.')
      if (v.ids.length > 100) throw new OperacionInvalida('Demasiadas OP.')
      return { ids: v.ids.map((id) => idMonday(id, 'ids')), columnas: idsDeColumnas(v.columnas) }
    },
  },

  /**
   * Todos los contenedores del tablero.
   *
   * Es la entrada de BERGER para marcar arribos y cargar entregas: se trabaja por contenedor y no
   * por OP, porque un camión llega y se descarga de a uno.
   */
  contenedoresDelTablero: {
    modulo: 'aduanaBerger',
    query: CONSULTA_CONTENEDORES,
    validar: validarTablero,
  },

  /**
   * Lo mismo, para el DESPACHANTE.
   *
   * Es una entrada aparte y no la misma con dos módulos porque el catálogo asocia cada operación
   * a UN módulo, y esa simpleza es lo que hace que se pueda auditar de un vistazo quién puede
   * pedir qué. La consulta es la misma; lo que cambia es quién la ejecuta.
   */
  contenedoresDelTableroDespachante: {
    modulo: 'aduana',
    query: CONSULTA_CONTENEDORES,
    validar: validarTablero,
  },

  /* ---------------------------------------------------------------- *
   * 🔒Lista Blanca — alta y baja de gente
   *
   * Es el tablero que decide quién entra a la app, así que todo lo de acá vive en su propio
   * módulo (`usuarios`) que sólo tiene Administración, y escribe una lista de columnas tan corta
   * como el formulario. El id del tablero lo pone el servidor: el cliente no puede apuntar a otro.
   * ---------------------------------------------------------------- */

  /** Las filas de la Lista Blanca, para ver a quién dar de baja. */
  usuariosDeListaBlanca: {
    modulo: 'usuarios',
    query: `
      query ($tablero: ID!, $columnas: [String!], $limite: Int!) {
        boards(ids: [$tablero]) {
          items_page(limit: $limite) {
            items { id name column_values(ids: $columnas) { ${CAMPOS_COLUMNA} } }
          }
        }
      }
    `,
    validar: (v) => ({
      tablero: TABLEROS.listaBlanca,
      columnas: idsDeColumnas(v.columnas),
      limite: entero(v.limite, 'limite', 1, 500),
    }),
  },

  /** Las etiquetas de los desplegables del tablero: apps, equipos y tableros del despachante. */
  etiquetasDeListaBlanca: {
    modulo: 'usuarios',
    query: `
      query ($tablero: ID!, $columnas: [String!]) {
        boards(ids: [$tablero]) { columns(ids: $columnas) { id settings_str } }
      }
    `,
    validar: (v) => ({
      tablero: TABLEROS.listaBlanca,
      columnas: idsDeColumnas(v.columnas),
    }),
  },

  /** Da de alta una persona. Siempre INVITADO y Activo: eso lo fija la app, no el formulario. */
  crearUsuarioListaBlanca: {
    modulo: 'usuarios',
    query: `
      mutation ($tablero: ID!, $nombre: String!, $valores: JSON!) {
        create_item(board_id: $tablero, item_name: $nombre, column_values: $valores) { id name }
      }
    `,
    validar: (v) => ({
      tablero: TABLEROS.listaBlanca,
      nombre: nombre(v.nombre),
      valores: valoresAcotados(v.valores, COLUMNAS_DE_USUARIO, 'el alta de un usuario'),
    }),
  },

  /* ------------------------------------------------------------------ *
   * La cuenta de monday: invitar, habilitar y desactivar
   * ------------------------------------------------------------------ *
   *
   * Son las operaciones más delicadas del catálogo: no tocan un tablero, tocan QUIÉN ENTRA a la
   * cuenta de BERGER. Por eso todas viven en el módulo `usuarios`, que sólo tiene Administración y
   * exige el equipo de monday comprobado, y por eso el servidor fija todo lo que puede fijar: el
   * rol es siempre GUEST y el producto siempre work_management.
   */

  /**
   * La invitación a la cuenta. Siempre como INVITADO.
   *
   * El rol no es un parámetro: dejarlo entrar desde el cliente convertiría esta operación en "dar
   * de alta a cualquiera como administrador". Si algún día hace falta invitar a un MIEMBRO, se
   * hace en monday, que es donde queda registrado quién lo hizo.
   */
  invitarUsuarioAMonday: {
    modulo: 'usuarios',
    query: `
      mutation ($emails: [String!]!) {
        invite_users(emails: $emails, product: work_management, user_role: GUEST) {
          invited_users { id email }
          errors { message code email }
        }
      }
    `,
    validar: (v) => ({ emails: [email(v.email)] }),
  },

  /**
   * El id de monday de un email.
   *
   * Se pregunta por separado y no se usa lo que devuelve la invitación porque cubre los dos casos:
   * el recién invitado y el que ya existía en la cuenta. Sin esto, invitar a alguien que ya estaba
   * dejaría el alta a medias.
   */
  usuarioPorEmail: {
    modulo: 'usuarios',
    query: `query ($emails: [String!]) { users(emails: $emails) { id name email } }`,
    validar: (v) => ({ emails: [email(v.email)] }),
  },

  /** Sumarlo al equipo. El id del equipo se valida contra los que la app conoce. */
  sumarUsuarioATeam: {
    modulo: 'usuarios',
    query: `
      mutation ($team: ID!, $usuarios: [ID!]!) {
        add_users_to_team(team_id: $team, user_ids: $usuarios) {
          successful_users { id }
          failed_users { id }
        }
      }
    `,
    validar: (v) => ({ team: teamConocido(v.team), usuarios: [idMonday(v.usuario, 'usuario')] }),
  },

  /**
   * Desactivarlo en la cuenta de monday.
   *
   * Es el otro lado de pasar la fila a Inactivo: sin esto, alguien dado de baja en la Lista Blanca
   * sigue siendo usuario de la cuenta y ve los tableros a los que esté suscripto.
   */
  desactivarUsuarioDeMonday: {
    modulo: 'usuarios',
    query: `
      mutation ($usuarios: [ID!]!) {
        deactivate_users(user_ids: $usuarios) {
          deactivated_users { id name }
          errors { message code user_id }
        }
      }
    `,
    validar: (v) => ({ usuarios: [idMonday(v.usuario, 'usuario')] }),
  },

  /**
   * El estado de una fila: lo único que se puede cambiar de alguien ya creado.
   *
   * Una sola columna escribible. Desde acá no se le puede cambiar el equipo, el tipo ni las apps
   * a nadie: para eso está monday, donde queda registro de quién lo hizo.
   */
  estadoUsuarioListaBlanca: {
    modulo: 'usuarios',
    query: `
      mutation ($tablero: ID!, $item: ID!, $valores: JSON!) {
        change_multiple_column_values(board_id: $tablero, item_id: $item, column_values: $valores) { id }
      }
    `,
    validar: (v) => ({
      tablero: TABLEROS.listaBlanca,
      item: idMonday(v.item, 'item'),
      /* Dos columnas y nada más: el estado —dar de baja— y el ID de usuario, que el alta guarda
         apenas monday devuelve el id. Ni el equipo, ni las apps, ni el tipo: eso se corrige en
         monday, donde queda registrado quién lo hizo. */
      valores: valoresAcotados(
        v.valores,
        new Set([COL_LISTA_BLANCA.estado, COL_LISTA_BLANCA.usuarioId]),
        'el estado del usuario',
      ),
    }),
  },

  /**
   * El Estado Pedido de un tractor del Inventario, desde el módulo del DESPACHANTE.
   *
   * Existe para que el estado del tractor siga al de su OP. Es deliberadamente angosta: **una sola
   * columna de un solo tablero**. El despachante es externo, y darle la operación genérica de
   * escritura al Inventario —que también toca el estado de pago— sería darle mucho más de lo que
   * este circuito necesita.
   */
  estadoPedidoDesdeAduana: {
    modulo: 'aduana',
    query: CONSULTA_ESTADO_PEDIDO,
    validar: validarEstadoPedido,
  },

  /** Lo mismo, desde el módulo de BERGER: es quien marca el arribo de un contenedor. */
  estadoPedidoDesdeBerger: {
    modulo: 'aduanaBerger',
    query: CONSULTA_ESTADO_PEDIDO,
    validar: validarEstadoPedido,
  },

  /**
   * Las etiquetas de una columna del tablero de contenedores.
   *
   * Hoy se usa para los depósitos de entrega. La lista vive en monday y no en el código porque
   * BERGER va a ir sumando depósitos, y una etiqueta inventada hace fallar la escritura entera.
   * El id de la columna lo valida el catálogo: no se puede pedir cualquiera.
   */
  etiquetasDeColumna: {
    modulo: 'aduanaBerger',
    query: `
      query ($tablero: ID!, $columna: [String!]) {
        boards(ids: [$tablero]) { columns(ids: $columna) { id settings_str } }
      }
    `,
    validar: (v) => {
      const columna = String(v.columna)
      if (columna !== COL_CONT_DESPACHO.ubicacionEntrega) {
        throw new OperacionInvalida('Esa columna no se puede consultar.')
      }
      return { tablero: TABLEROS.contenedoresDespacho, columna: [columna] }
    },
  },

  /**
   * El turno de carga: lo único que el despachante escribe en un contenedor.
   *
   * Comparte la mutation con la de BERGER pero NO su lista de columnas: acá la única escribible
   * es la fecha del turno.
   */
  asignarTurnoContenedor: {
    modulo: 'aduana',
    query: `
      mutation ($tablero: ID!, $item: ID!, $valores: JSON!) {
        change_multiple_column_values(board_id: $tablero, item_id: $item, column_values: $valores) { id }
      }
    `,
    validar: (v) => ({
      tablero: TABLEROS.contenedoresDespacho,
      item: idMonday(v.item, 'item'),
      valores: valoresAcotados(v.valores, COLUMNAS_DE_TURNO, 'el turno de carga'),
    }),
  },

  /** Contenedores del despacho por id: los que ya están armados. */
  contenedoresDeDespacho: {
    modulo: 'aduana',
    query: `
      query ($ids: [ID!]!, $columnas: [String!]) {
        items(ids: $ids) { id name column_values(ids: $columnas) { ${CAMPOS_COLUMNA} } }
      }
    `,
    validar: (v) => {
      if (!Array.isArray(v.ids) || v.ids.length === 0) {
        throw new OperacionInvalida('Faltan los ids de los contenedores.')
      }
      if (v.ids.length > 200) throw new OperacionInvalida('Demasiados ids.')
      return { ids: v.ids.map((id) => idMonday(id, 'ids')), columnas: idsDeColumnas(v.columnas) }
    },
  },

  /**
   * Un contenedor armado por el despachante.
   *
   * Sólo se escribe el lado del contenedor: la conexión con el subitem del tractor es de doble vía,
   * así que monday completa el otro lado solo. Escribir los dos sería pisar el mismo dato dos veces.
   */
  crearContenedorDespacho: {
    modulo: 'aduana',
    query: `
      mutation ($tablero: ID!, $nombre: String!, $valores: JSON!) {
        create_item(board_id: $tablero, item_name: $nombre, column_values: $valores) { id }
      }
    `,
    validar: (v) => ({
      tablero: TABLEROS.contenedoresDespacho,
      nombre: nombre(v.nombre),
      valores: valoresAcotados(v.valores, COLUMNAS_DE_CONTENEDOR, 'el módulo de aduana'),
    }),
  },

  /** Ubicación de entrega y transportista de un contenedor. Lo completa BERGER. */
  actualizarContenedorDespacho: {
    modulo: 'aduanaBerger',
    query: `
      mutation ($tablero: ID!, $item: ID!, $valores: JSON!) {
        change_multiple_column_values(board_id: $tablero, item_id: $item, column_values: $valores) { id }
      }
    `,
    validar: (v) => ({
      tablero: TABLEROS.contenedoresDespacho,
      item: idMonday(v.item, 'item'),
      valores: valoresAcotados(v.valores, COLUMNAS_DE_CONTENEDOR, 'BERGER'),
    }),
  },

  /** Los contactos, para elegir el transportista de cada contenedor. */
  contactos: {
    modulo: 'aduanaBerger',
    query: `
      query ($tablero: ID!, $columnas: [String!], $limite: Int!) {
        boards(ids: [$tablero]) {
          items_page(limit: $limite) {
            items { id name column_values(ids: $columnas) { id text } }
          }
        }
      }
    `,
    validar: (v) => ({
      tablero: TABLEROS.contactos,
      columnas: idsDeColumnas(v.columnas),
      limite: entero(v.limite, 'limite', 1, 500),
    }),
  },

  /** Forma de pago, fondeo, banco, VEP y estado del pago: lo que completa BERGER de una OP. */
  actualizarOpBerger: {
    modulo: 'aduanaBerger',
    query: `
      mutation ($tablero: ID!, $item: ID!, $valores: JSON!) {
        change_multiple_column_values(board_id: $tablero, item_id: $item, column_values: $valores) { id }
      }
    `,
    validar: (v) => ({
      tablero: TABLEROS.despachante,
      item: idMonday(v.item, 'item'),
      valores: valoresAcotados(v.valores, COLUMNAS_DE_BERGER, 'BERGER'),
    }),
  },

  /**
   * Un update en el item de la OP, con menciones de verdad.
   *
   * `mentions_list` es lo que hace que a la persona LE LLEGUE la mención. Incrustar el marcado de
   * la mención dentro del `body` no sirve: monday lo descarta al guardar, el texto queda pero nadie
   * se entera. Probado contra la API.
   *
   * Necesita una versión de la API **más nueva que la de la app**: `mentions_list` aparece recién
   * en 2025-07, y la app corre en 2024-10. Por eso esta operación declara la suya.
   */
  crearUpdate: {
    modulo: 'aduana',
    apiVersion: API_CON_MENCIONES,
    query: `
      mutation ($item: ID!, $cuerpo: String!, $menciones: [UpdateMention]) {
        create_update(item_id: $item, body: $cuerpo, mentions_list: $menciones) { id }
      }
    `,
    validar: (v) => {
      const cuerpo = String(v.cuerpo ?? '')
      if (!cuerpo.trim()) throw new OperacionInvalida('El update está vacío.')
      if (cuerpo.length > 5000) throw new OperacionInvalida('El update es demasiado largo.')

      /* Sólo se mencionan PERSONAS, y por id: con el tipo libre se podrían mencionar tableros o
         proyectos enteros de la cuenta desde una pantalla que sólo habla de una OP. */
      const crudas = Array.isArray(v.menciones) ? v.menciones : []
      if (crudas.length > 20) throw new OperacionInvalida('Demasiadas menciones.')
      const menciones = crudas.map((m) => ({
        id: idMonday((m as { id?: unknown })?.id, 'mención'),
        type: 'User',
      }))

      return { item: idMonday(v.item, 'item'), cuerpo, menciones }
    },
  },

  /** Notificación a una persona, apuntando al item de la OP. */
  notificar: {
    modulo: 'aduana',
    query: `
      mutation ($usuario: ID!, $item: ID!, $texto: String!) {
        create_notification(user_id: $usuario, target_id: $item, text: $texto, target_type: Project) { id }
      }
    `,
    validar: (v) => {
      const texto = String(v.texto ?? '')
      if (!texto.trim()) throw new OperacionInvalida('La notificación está vacía.')
      if (texto.length > 1000) throw new OperacionInvalida('La notificación es demasiado larga.')
      return {
        usuario: idMonday(v.usuario, 'usuario'),
        item: idMonday(v.item, 'item'),
        texto,
      }
    },
  },
}

/**
 * Si un perfil con estos módulos puede pedir esta operación.
 *
 * Es el candado que separa a las dos poblaciones: la operación existe en el catálogo, pero tiene
 * que pertenecer a un módulo habilitado. Un despachante que pida los pagos del inventario se choca
 * con esto aunque su pantalla no ofrezca el botón.
 */
export const operacionPermitida = (operacion: Operacion, modulos: readonly ModuloApp[]): boolean =>
  modulos.includes(operacion.modulo) || (operacion.tambienEn ?? []).some((m) => modulos.includes(m))

/** Resuelve una operación por nombre. Lanza si no existe: no hay consultas fuera del catálogo. */
export function resolverOperacion(nombreOperacion: unknown): Operacion {
  const clave = String(nombreOperacion ?? '')
  const operacion = (OPERACIONES as Record<string, Operacion | undefined>)[clave]
  if (!operacion) throw new OperacionInvalida(`Operación desconocida: "${clave}".`)
  return operacion
}

/** Mutation de subida de archivos. El texto lo pone el servidor, igual que el resto. */
export const MUTATION_ARCHIVO =
  'mutation ($itemId: ID!, $columnId: String!, $file: File!) {' +
  ' add_file_to_column (item_id: $itemId, column_id: $columnId, file: $file) { id } }'

/**
 * Valida el destino de un archivo: sólo las columnas de comprobante habilitadas.
 *
 * Devuelve además el MÓDULO al que pertenece esa columna, para que el proxy compruebe que quien
 * sube el archivo lo tiene habilitado. Sin eso, habilitar los comprobantes de aduana le habría
 * abierto al despachante externo la puerta del circuito de pago.
 */
export function validarDestinoArchivo(
  itemId: unknown,
  columnId: unknown,
): {
  itemId: string
  columnId: string
  modulo: ModuloApp
} {
  const columna = String(columnId ?? '')
  if (!COLUMNAS_ARCHIVO.has(columna)) {
    throw new OperacionInvalida('Esa columna no admite archivos desde la app.')
  }
  return {
    itemId: idMonday(itemId, 'itemId'),
    columnId: columna,
    modulo: MODULO_DE_ARCHIVO[columna] ?? 'despacho',
  }
}
