/**
 * Estructuras de datos de la app.
 *
 * Todo lo que llega de Monday se normaliza acá antes de entrar a la interfaz: los componentes
 * nunca ven un `column_values` crudo. Eso es lo que permite que un cambio de columna se resuelva
 * en `services/monday/` sin tocar una sola vista.
 */

/**
 * Navegación de la app, en tres niveles:
 *
 *   Operación principal  →  Modalidad  →  Etapa
 *   DESPACHO             →  ANTICIPADO →  Cargar / Aprobar / Confirmar
 *                        →  VISTA      →  (paso único)
 *
 * El primer nivel hoy tiene una sola opción, pero existe desde ya: es donde se van a sumar los
 * próximos tipos de operación sin tener que rearmar la pantalla de entrada.
 */
export type OperacionPrincipal = 'despacho' | 'aduana' | 'drafts' | 'fechas'

/** Operaciones dentro de "Fechas de Producción Inventario". */
export type OperacionFechas = 'confirmar' | 'enviar'

/** Operaciones dentro de "Despacho de Aduana". */
export type OperacionAduana = 'actualizar' | 'turnos' | 'berger' | 'contenedores' | 'dashboard'

/** Operaciones dentro de "Planificación de Drafts". */
export type OperacionDrafts = 'planificar' | 'enviar' | 'dashboard'

/** Las dos formas de despachar: con el circuito de pago previo, o a la vista (contra VL). */
export type ModalidadDespacho = 'anticipado' | 'vista'

/** Las tres etapas del circuito de pago del despacho ANTICIPADO. */
export type EtapaAnticipado = 'cargar' | 'aprobar' | 'confirmar'

/** Tarjeta de un panel de elección (operación principal o modalidad). */
/**
 * Una sección del panel: agrupa operaciones que hace la misma gente.
 *
 * En DESPACHO DE ADUANA conviven dos trabajos que no se mezclan —lo del despachante y lo de
 * BERGER— sobre las mismas OP, con nombres casi iguales. Agruparlos y darles color es lo que
 * evita entrar a la pantalla equivocada: el nombre corto alcanza cuando ya se sabe de quién es.
 */
export interface SeccionPanel {
  id: string
  titulo: string
  detalle: string
  /** Se usa como clase CSS: `panel-grupo--${tono}`. */
  tono: 'azul' | 'naranja'
  icono: string
}

export interface OpcionPanel<T extends string> {
  id: T
  /** A qué sección del panel pertenece, si el panel tiene secciones. */
  seccion?: string
  titulo: string
  /** Rótulo corto, para la miga de pan y las pantallas angostas. */
  corto: string
  detalle: string
  icono: string
}

export interface DefinicionEtapa {
  id: EtapaAnticipado
  titulo: string
  detalle: string
  icono: string
}

/**
 * Un tractor del tablero de Inventario, ya normalizado.
 *
 * Los importes vienen de columnas MIRROR: Monday las devuelve como texto en `display_value` y
 * nunca como número, así que se parsean una sola vez acá. `null` significa "el espejo no trajo
 * valor", que no es lo mismo que cero y por eso no se colapsa a 0.
 */
export interface Tractor {
  id: string
  /** Nombre del item: ya trae el N° de draft y el código de producto. */
  nombre: string
  numInterno: string
  numDraft: string
  codProducto: string
  /** Fecha de Prod en ISO (`YYYY-MM-DD`), o `''` si el item no la tiene cargada. */
  fechaProd: string
  estadoPago: string
  costoFlete: number | null
  precioUnitario: number | null
  valorNeto: number | null
  formaPago: string
  /** Modelo, espejado del Catálogo de Productos. `''` si el item no está conectado. */
  modelo: string
  /** "Con Rodado" / "Sin Rodado", o `''` si no está cargado. */
  estadoRodado: string
  /** Producto del Catálogo al que está conectado. Es la llave para saber en qué contenedor entra. */
  catalogoId: string | null
  /**
   * Puertos de carga del modelo, leídos del Catálogo. Vacío si el item no está conectado o el
   * modelo no tiene puerto cargado. Un modelo puede salir por más de uno.
   */
  puertos: string[]
  /** Etiqueta de la confirmación de la Fecha de Producción. */
  confirmacionFecha: string
}

/**
 * Una combinación del tablero de Contenedores: qué productos viajan juntos, en qué contenedor,
 * cuántos entran y con qué rodado.
 *
 * Un mismo grupo de productos puede tener varias opciones. Por ejemplo los 6205/6175/6155: uno
 * solo en un 40 H con ruedas, dos en un 20 H + 40 H con ruedas, o dos sin ruedas en un 40 H.
 */
export interface OpcionContenedor {
  id: string
  /** Nombre de la fila, como "6205 - 6175 - 6155". */
  nombre: string
  /** Ids de los productos del catálogo que entran combinados. */
  catalogo: string[]
  /** Etiqueta del contenedor: "40 H", "20 H + 40 H", "CUALQUIER CONTENEDOR"… */
  tipo: string
  /** Cuántos contenedores FÍSICOS ocupa esta opción: el "+" de la etiqueta suma uno. */
  contenedores: number
  /** Cuántos tractores entran en total. */
  capacidad: number
  /** "Con Ruedas", "Sin Ruedas" o "Con y Sin Ruedas". */
  ruedas: string
}

/** Un contenedor (o par de contenedores) ya armado con tractores concretos. */
export interface ContenedorArmado {
  opcion: OpcionContenedor
  tractores: Tractor[]
  /** Lugares que quedan sin usar. */
  libres: number
  /** Otros tractores disponibles que podrían completarlo. */
  sugerencias: Tractor[]
}

/** Un tractor que no se puede ubicar, con el motivo. */
export interface TractorSinContenedor {
  tractor: Tractor
  motivo: string
}

/** Lo que la app le muestra al usuario mientras selecciona, y lo que después queda como reporte. */
export interface ResumenContenedores {
  armados: ContenedorArmado[]
  sinContenedor: TractorSinContenedor[]
  /** Contenedores físicos en total. */
  totalContenedores: number
  /** Lugares libres sumando todos los contenedores armados. */
  totalLibres: number
}

/** Un mes del calendario. `mes` es 1-12, no el 0-11 de `Date`. */
export interface MesAnio {
  anio: number
  mes: number
}

/** Datos de la transferencia que completa el usuario en la operación 1. */
export interface DatosTransferencia {
  archivo: File | null
  /**
   * Monto tipeado, TAL CUAL lo escribió el usuario.
   *
   * Se guarda como texto y no como número a propósito: parsear en cada tecla y volver a
   * imprimir el resultado borra la coma decimal apenas se escribe ("1234," vuelve como "1234")
   * y deja el campo imposible de completar. La conversión a número ocurre una sola vez, al
   * confirmar.
   */
  monto: string
  /** Fecha de emisión en ISO (`YYYY-MM-DD`). */
  fechaEmision: string
}

/**
 * Un tractor dentro de un pago ya registrado: el subitem del tablero de Pagos.
 *
 * `tractorId` es la conexión al item del Inventario. Es el dato que hace posible que las
 * operaciones 2 y 3 avancen el estado del tractor sin tener que volver a buscarlo por nombre.
 */
export interface SubitemPago {
  id: string
  nombre: string
  numDraft: string
  codProducto: string
  numInterno: string
  valorNeto: number | null
  /** Item del Inventario conectado, o `null` si el subitem quedó sin conexión. */
  tractorId: string | null
  /** Estado Pago actual del tractor en el Inventario. */
  estadoTractor: string
  /**
   * Modelo y rodado del tractor. El tablero de subitems NO tiene estas columnas: se leen del item
   * del Inventario al que apunta la conexión, en la misma consulta que trae su estado.
   */
  modelo: string
  estadoRodado: string
  /** Producto del Catálogo del tractor conectado: de ahí cuelga el puerto de carga. */
  catalogoId: string | null
}

/** Un pago del tablero de Pagos del Inventario, con sus tractores. */
export interface Pago {
  id: string
  nombre: string
  /**
   * `ANTICIPADO` o `VISTA`. Es lo que decide si al confirmarlo hay que armar el despacho de
   * aduana: un pago VISTA corresponde a tractores que YA se despacharon, así que no se vuelve a
   * crear nada ni se elige despachante.
   */
  tipoPago: string
  monto: number | null
  fechaEmision: string
  estadoPago: string
  operacionPend: string
  fechaCargado: string
  fechaAprobado: string
  /** URL del archivo adjunto en cada etapa, o `''` si todavía no hay. */
  urlTransferencia: string
  urlTransferenciaConNumero: string
  urlComprobanteBanco: string
  /**
   * Reporte de contenedores que dejó escrito la operación que creó el pago. La operación 3 lo lee
   * —no lo vuelve a calcular— para saber cuántos contenedores declarar ante el despachante: lo que
   * se informa tiene que ser lo mismo que ya se reportó, aunque el tablero de Contenedores haya
   * cambiado desde entonces.
   */
  reporteContenedores: string
  tractores: SubitemPago[]
}

/** Resultado de la operación 1. */
export interface ResultadoCarga {
  /** Item creado en el tablero de Pagos del Inventario. */
  pagoId: string
  /** Subitems creados, uno por tractor. */
  subitemIds: string[]
  /** Tractores cuyo estado quedó en `Transf Cargada`. */
  tractoresActualizados: number
  /**
   * Pasos que fallaron sin abortar la operación (por ejemplo, un estado que no se pudo
   * actualizar). El pago ya está creado: la app lo informa en vez de fingir que salió todo bien.
   */
  advertencias: string[]
}

/** Resultado de las operaciones 2 y 3. */
export interface ResultadoAvance {
  pagoId: string
  tractoresActualizados: number
  advertencias: string[]
  /** Item creado en el Despachante de aduana, cuando la etapa cierra el despacho. */
  itemDespachanteId?: string | null
}

/**
 * Un despachante: alguien del equipo "Despachantes" de monday.
 *
 * Es quien recibe el mail con la información del despacho y a quien queda asignado el item del
 * Despachante de aduana.
 */
export interface Despachante {
  /** Id de usuario de monday: es lo que se escribe en la columna de persona. */
  id: string
  nombre: string
  email: string
  /** Foto de perfil, o `''` si no tiene. */
  foto: string
}

/** Un tractor, como se lo carga en el tablero del Despachante de aduana. */
export interface TractorDeDespacho {
  nombre: string
  valorNeto: number | null
  numDraft: string
  codProducto: string
  /** Item del Inventario al que se conecta el subitem, o `null` si no se sabe cuál es. */
  tractorId: string | null
}

/** Etapa del asistente de la operación 1. */
export type Etapa = 'seleccion' | 'transferencia' | 'listo'

/**
 * Etapa del asistente de las operaciones 2 y 3.
 *
 * `despachante` sólo existe en la operación que CIERRA el despacho (la 3): ahí se elige a quién se
 * le manda y se ve qué se le manda, antes de confirmar.
 */
export type EtapaAvance = 'seleccion' | 'archivo' | 'despachante' | 'listo'

/**
 * Una OP del tablero del Despachante de aduana.
 *
 * Es el mismo item que crea el circuito de despacho, visto del otro lado: lo que a BERGER le
 * importa es qué tractores lleva; al despachante, dónde está la carga.
 */
export interface DespachoOP {
  id: string
  /** Nombre del item: viene del pago que lo originó. */
  nombre: string
  /** ID legible que numera monday ("DESPACHO-003"). */
  idDespacho: string
  nroOp: string
  estadoCarga: string
  viaTransporte: string
  nroDocTransporte: string
  nroDespachoImpo: string
  contenedorRef: string
  /** ETA en ISO (`AAAA-MM-DD`), o `''`. */
  eta: string
  buque: string
  observaciones: string
  paisOrigen: string
  /** Puerto(s) de carga. Puede traer más de uno cuando el modelo sale por cualquiera de dos. */
  puertoOrigen: string
  proveedor: string
  cantidadContenedores: number | null
  /** Nombre del despachante asignado, o `''`. */
  despachante: string
  /** Lo que completa BERGER cuando la carga está por llegar. */
  formaPago: string
  fondeo: string
  bancoDeclarar: string
  formaPagoVepArca: string
  estadoPagoVepArca: string
  formaPagoVepTerminal: string
  estadoPagoVepTerminal: string
  /** Nombres de los archivos ya cargados en cada columna de comprobante. */
  archivos: Record<string, string>
  /** Última vez que se tocó el item, como lo devuelve monday. */
  ultimaActualizacion: string
}

/** Un tractor de una OP, como lo ve el despachante al armar los contenedores. */
export interface TractorDeOp {
  /** Id del SUBITEM del Despachante de aduana, que es lo que se conecta al contenedor. */
  id: string
  nombre: string
  modelo: string
  rodado: string
  /** Matrícula o chasis: es lo único que distingue dos tractores del mismo modelo. */
  chasis: string
  numDraft: string
  /** Valor neto del tractor en el despacho, tal como lo escribió la app al crearlo. */
  valorNeto: string
  /** N° de factura de compra, espejado del Inventario. */
  nroFactCompra: string
  /** Contenedor en el que ya está cargado, o `null`. */
  contenedorId: string | null
  /** El item de este tractor en el 🧮Inventario, o `null` si el subitem no lo trae conectado. */
  inventarioId: string | null
}

/** Un contenedor real del despacho, con los tractores que lleva. */
export interface ContenedorDespacho {
  id: string
  nombre: string
  numero: string
  /** Depósito de entrega, tal como figura en el desplegable del tablero. */
  ubicacion: string
  /** Lo que había en la columna vieja de tipo location. Se muestra sólo si el depósito está vacío. */
  ubicacionVieja: string
  transportista: string
  patente: string
  fechaTurno: string
  fechaCreacion: string
  /** La hora del turno, separada: monday la guarda en UTC y la muestra en la zona de la cuenta. */
  horaTurno: string
  /** Si el aviso del turno al transportista ya salió, el contenedor queda congelado para BERGER. */
  estadoEnvioTurno: string
  estadoArribo: string
  fechaArribo: string
  /** Id del contacto asignado como transportista, para poder dejarlo elegido en el desplegable. */
  transportistaId: string | null
  /** Ids de los subitems (tractores) que van adentro. */
  tractorIds: string[]
  /** Los mismos tractores, pero como items del 🧮Inventario. */
  inventarioIds: string[]
  /** OP a la que pertenece, conectada a nivel item. */
  opId: string | null
  /** Datos de esa OP, espejados: sirven para reconocerlo y para buscarlo. */
  nroOpDespachante: string
  idOp: string
  estadoCargaOp: string
  /** Matrículas de los tractores que lleva, espejadas de los subitems. */
  chasis: string
}

/** Un contenedor mientras se está armando, antes de existir en monday. */
export interface ContenedorEnArmado {
  /** Id local, sólo para React. */
  clave: string
  numero: string
  tractorIds: string[]
}

/** Resultado de armar los contenedores de una OP. */
export interface ResultadoContenedores {
  creados: string[]
  advertencias: string[]
}

/** Un contacto del tablero de Contactos: de ahí salen los transportistas. */
export interface Contacto {
  id: string
  nombre: string
  /** Etiquetas de 🤚Categoria. Un mismo contacto puede ser transportista y cliente a la vez. */
  categorias: string[]
}

/** Los campos de una OP que completa BERGER cuando la carga está por llegar. */
export interface EdicionBerger {
  formaPago: string
  fondeo: string
  bancoDeclarar: string
  /* El VEP de la aduana y el de la terminal: mismo circuito, dos trámites y dos pagos. */
  formaPagoVepArca: string
  estadoPagoVepArca: string
  formaPagoVepTerminal: string
  estadoPagoVepTerminal: string
}

/** Lo que BERGER puede cambiarle a un contenedor. */
export interface EdicionContenedor {
  /** Depósito elegido del desplegable. */
  ubicacion: string
  transportistaId: string | null
  /** Si ya llegó. Se marca desde "Actualizar Contenedores". */
  estadoArribo?: string
  /** Cuándo llegó. Por defecto hoy, pero se puede corregir si el arribo se marcó tarde. */
  fechaArribo?: string
}

/** El turno de carga que le asigna el despachante a un contenedor. */
export interface EdicionTurno {
  fecha: string
  hora: string
}

/** Etapa del asistente de "Actualizar OP - BERGER SA". */
export type EtapaBerger = 'seleccion' | 'edicion' | 'listo'

/** Qué va a hacer el despachante con la OP que eligió. */
export type ModoDespachante = 'datos' | 'contenedores'

/** Los campos que el despachante puede editar de una OP. */
export interface EdicionDespacho {
  nroOp: string
  viaTransporte: string
  nroDocTransporte: string
  nroDespachoImpo: string
  contenedorRef: string
  eta: string
  buque: string
  estadoCarga: string
  observaciones: string
}

/** Un campo que cambió, con los dos valores. Es lo que se muestra en el resumen. */
export interface CambioDespacho {
  campo: keyof EdicionDespacho
  rotulo: string
  antes: string
  despues: string
}

/** Los cuatro comprobantes que el despachante puede subir a una OP. */
/**
 * Los comprobantes que se van a subir al guardar.
 *
 * Cada uno es una **lista** aunque casi todos admitan uno solo: monday no reemplaza el archivo de
 * una columna, lo suma, así que la columna es una lista de por sí. Tenerlo así en el formulario
 * evita el caso especial de Senasa —el único que hoy acepta varios— desparramado por el código.
 */
export interface ArchivosDespacho {
  fcTransporteImpo: File[]
  despachoImpo: File[]
  fcTerminal: File[]
  gastosVarios: File[]
  /** Senasa admite VARIOS: de un mismo despacho pueden salir varios certificados. */
  facturaSenasa: File[]
  facturaModoc: File[]
  facturaPrecintos: File[]
  /** Los dos VEP que emite el despachante: sin el archivo, BERGER no puede pagar el suyo. */
  vepArca: File[]
  vepTerminal: File[]
}

/** Un archivo que YA está subido en una columna de monday. */
export interface ArchivoSubido {
  nombre: string
  url: string
}

/** Resultado de guardar las ediciones de un lote de OP. */
export interface ResultadoActualizacion {
  actualizadas: string[]
  advertencias: string[]
  /** OP que además dispararon el aviso a BERGER por pasar a "Próxima a Arribar". */
  avisadas: string[]
}

/** Un producto dentro de un draft: lo que el proveedor va a fabricar. */
export interface ProductoDraft {
  id: string
  nombre: string
  rodado: string
  cantidad: number | null
  precioUnitario: number | null
  /** Costo de transporte del producto, ya elegido según la condición de entrega del draft. */
  costoTransporte: number | null
  valorNeto: number | null
  /** Subtotal del producto, con transporte. */
  subtotal: number | null
}

/** Un draft: el pedido al proveedor, antes de que el tractor exista en el Inventario. */
export interface Draft {
  id: string
  /** Nombre del item: es el número de draft. */
  nombre: string
  /** ID legible que numera monday ("DRAFT-014"). */
  idDraft: string
  estado: string
  lectura: string
  /** Período de producción sugerido, o `''` si todavía no tiene. */
  periodo: string
  /** Fecha del draft en ISO (`AAAA-MM-DD`), o `''`. */
  fecha: string
  ordenPedido: string
  condicionEntrega: string
  transporte: string
  formaPago: string
  divisa: string
  /**
   * Costo del transporte que corresponde a la condición de entrega: el FOB si dice FOB, el FCA si
   * dice FCA. Es uno u otro, nunca los dos.
   */
  costoTransporte: number | null
  /** Cómo se llama ese costo, para poder rotularlo. */
  rotuloTransporte: string
  total: number | null
  productos: ProductoDraft[]
}

/** Resultado de asignar períodos a un lote de drafts. */
export interface ResultadoPlanificacion {
  planificados: string[]
  advertencias: string[]
}

/** Resultado de crear una planificación para mandarle al proveedor. */
export interface ResultadoEnvio {
  planificacionId: string
  nombre: string
  drafts: number
  advertencias: string[]
}

/**
 * Un tractor del Inventario visto desde el módulo de fechas: lo que hace falta para decidir si la
 * fecha que propuso el proveedor se acepta o se le propone otra.
 */
export interface TractorFecha {
  id: string
  nombre: string
  modelo: string
  numInterno: string
  /** PRIMARY STATUS de fábrica, y su traducción. */
  primaryStatus: string
  primaryStatusEsp: string
  tipoRodado: string
  precioUnitario: number | null
  /** Fecha de producción que informó el proveedor, en ISO. */
  fechaProd: string
  /** Fecha que BERGER propuso, si ya propuso alguna. */
  fechaPropuesta: string
  /** Estado de confirmación (`Fecha Pend Confirmar`, `Fecha Confirmada`, `Fecha a Confirmar`). */
  estadoConfirmacion: string
  /** Estado de la fecha (`Aceptada`, `Nueva Fecha Propuesta`), o `''`. */
  estadoFecha: string
  /**
   * Confirmación de DEUTZ conectada. Sin ella no se puede confirmar ni proponer: no habría
   * respaldo de que el proveedor dijo esa fecha.
   */
  confirmacionId: string | null
}

/** Qué se decidió para un tractor: aceptar la fecha del proveedor, o proponer otra. */
export type DecisionFecha = { tipo: 'confirmar' } | { tipo: 'proponer'; fecha: string }

/** Resultado de confirmar o proponer fechas en un lote. */
export interface ResultadoFechas {
  confirmados: string[]
  propuestos: string[]
  advertencias: string[]
}

/** Una confirmación que mandó el proveedor, con los tractores que trae. */
export interface Confirmacion {
  id: string
  nombre: string
  idConfirmacion: string
  /** Fecha del item, en ISO. */
  fecha: string
  /** Estado de la actualización del Inventario por la automatización. */
  estadoActInventario: string
  /** Estado de la creación de la planilla de Google. */
  creacionSheet: string
  /** Estado del envío de la propuesta. La app lo deja en "Enviar". */
  estadoPropuesta: string
  /** Link a la planilla con las fechas confirmadas y propuestas. */
  driveLink: string
  /** Ids de los items del Inventario conectados. */
  inventarioIds: string[]
  /** Esos mismos items, ya cargados. */
  tractores: TractorFecha[]
}

/** Etapa del asistente de "Confirmar / Proponer Fecha de Producción". */
export type EtapaFechas = 'seleccion' | 'decision' | 'listo'

/** Etapa del asistente de "Enviar Confirmación". */
export type EtapaConfirmacion = 'seleccion' | 'resumen' | 'listo'

/** Etapa del asistente de "Planificar Período de Producción". */
export type EtapaPlanificacion = 'seleccion' | 'periodos' | 'listo'

/** Etapa del asistente de "Enviar Planificación". */
export type EtapaEnvio = 'seleccion' | 'confirmacion' | 'listo'

/** Etapa del asistente de "Actualizar Despacho OP - DESPACHANTE". */
export type EtapaAduana = 'seleccion' | 'modo' | 'edicion' | 'resumen' | 'contenedores' | 'listo'

/** Etapa del asistente del despacho a la VISTA. */
export type EtapaVista = 'seleccion' | 'despachante' | 'listo'

/**
 * Configuración de una operación que avanza un pago ya existente (las número 2 y 3).
 *
 * Las dos hacen exactamente lo mismo —elegir un pago pendiente, adjuntar un comprobante y
 * empujar el circuito un casillero— y sólo cambian en QUÉ estados leen y escriben. Describirlas
 * como datos, en vez de duplicar el flujo en dos componentes casi iguales, es lo que garantiza
 * que un arreglo en el manejo de errores valga para las dos.
 */
export interface FlujoAvance {
  etapa: EtapaAnticipado
  /** Qué pagos se ofrecen: etiqueta de "Operacion Pend" y, si hace falta, de "Estado Pago". */
  filtroOperacionPend: string
  filtroEstadoPago?: string

  /** Textos de la pantalla. */
  tituloSeleccion: string
  detalleSeleccion: string
  vacioTitulo: string
  vacioDetalle: string
  tituloArchivo: string
  detalleArchivo: string
  zonaTitulo: string
  botonAccion: string
  finalTitulo: string
  finalDetalle: string

  /** Dónde se guarda el comprobante que sube el usuario. */
  columnaArchivo: string
  /** Estados y fecha que quedan en el pago. */
  nuevoEstadoPago: string
  nuevaOperacionPend: string
  columnaFecha: string
  /** Estado al que pasan los tractores del pago en el Inventario. */
  nuevoEstadoInventario: string
  /** Columna del aviso por mail que se deja en "Enviar". */
  columnaEmail: string
  /** Qué hace ese mail, para poder contarlo en pantalla. */
  detalleEmail: string
  /**
   * Si esta etapa cierra el despacho: crea el item en el tablero del Despachante de aduana y deja
   * el aviso al despachante en "Enviar". En ANTICIPADO eso pasa recién al confirmar el SWIFT.
   */
  cierraDespacho?: boolean
}
