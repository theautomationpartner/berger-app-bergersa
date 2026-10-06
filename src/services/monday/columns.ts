/**
 * IDs reales de tableros y columnas de la cuenta de BERGER S.A. (36618349).
 *
 * Relevados con `boards { columns { id title type settings_str } }`: son la ÚNICA fuente de
 * verdad de los identificadores. Ninguna query los escribe sueltos, así que cuando Monday cambie
 * una columna se toca un solo archivo.
 */

/**
 * Cuenta de monday habilitada: BERGER S.A. (slug `maquinariasagricolas`).
 *
 * La app se puede instalar en cualquier cuenta que tenga el link, así que el permiso NO puede
 * depender de dónde esté instalada. Este id es el que decide: el token de sesión que firma monday
 * dice de qué cuenta viene el usuario, y cualquier otra queda afuera.
 *
 * Del lado del cliente esto sólo evita mostrar una pantalla que no va a funcionar. La barrera de
 * verdad está en `api/_guard.ts`, del lado del servidor, con la misma comprobación: sin ella,
 * cualquiera podría pedirle datos al proxy salteándose la interfaz.
 */
export const CUENTA_BERGER = 36618349

export const TABLEROS = {
  /** Inventario: un item por tractor. */
  inventario: '18428578101',
  /** Pagos del Inventario: un item por transferencia. */
  pagos: '18430295445',
  /** Subelementos de Pagos del Inventario: un subitem por tractor pagado. */
  pagosSubitems: '18430295515',
  /** Contenedores: qué modelos viajan juntos y en qué contenedor. */
  contenedores: '18430565324',
  /** Catálogo de Productos: un item por modelo. De acá sale el puerto de carga. */
  catalogo: '18428421090',
  /** Despachante de aduana: un item por despacho, con lo que el despachante necesita operar. */
  despachante: '18430575903',
  /** Subelementos del Despachante: un subitem por tractor despachado. */
  despachanteSubitems: '18431188087',
  /** 🚚Contenedores: los que arma el despachante, con los tractores que van en cada uno. */
  contenedoresDespacho: '18431711942',
  /** 🚹Contactos del CRM: de ahí salen los transportistas, y ahí se dan de alta los contactos. */
  contactos: '18428421093',
  /** 🌐Cuentas del CRM: una por cliente, proveedor o transporte. */
  cuentas: '18428421094',
  /** Concesionarios: a quién se le asigna una cuenta. */
  concesionarios: '18428606865',
  /** 🗓️Actividades: cada contacto con un cliente, hecho o por hacer. */
  actividades: '18428421092',
  /**
   * 🔒Lista Blanca — quién entra a la app y a qué.
   *
   * OJO: el circuito de seguridad de `api/_seguridad` lee este mismo tablero desde la variable
   * de entorno `SEGURIDAD_LISTA_BLANCA_TABLERO_ID`, porque lo comparten varias apps de BERGER.
   * Acá está escrito porque la operación de alta/baja pasa por el catálogo como todas las demás.
   * **Si alguna vez se cambia el tablero, hay que cambiarlo en los dos lados.**
   */
  listaBlanca: '18430553527',
  /** Drafts: un item por draft del proveedor, con un subitem por producto. */
  drafts: '18428667614',
  draftsSubitems: '18428672791',
  /** Confirmación y Planificación de Fecha de Producción. */
  planificacion: '18428677294',
} as const

/**
 * 🧾 Drafts (18428667614) — el pedido al proveedor, antes de que exista el tractor.
 *
 * OJO con dos columnas que se prestan a confusión, porque los nombres no acompañan:
 *
 * - `numeric_mm77ygs7` NO es el costo de transporte FCA: es el **Total del draft sin transporte**.
 *   El costo FCA es `numeric_mm72rv29`.
 * - `numeric_mm6n2m2y` ("Total Draf") es el total CON transporte, que es el que se muestra.
 */
export const COL_DRAFT = {
  /** Lectura del PDF por la automatización. Sólo se planifica lo que ya se leyó bien. */
  lectura: 'color_mm6sr83w',
  /** Estado del draft: es lo que la app avanza a "Periodo Prod Planificada". */
  estado: 'color_mm6zdmzr',
  /** Período de producción sugerido. Una sola etiqueta por draft. */
  periodo: 'dropdown_mm70awrf',

  nroDraft: 'text_mm6ve0h1',
  fecha: 'date4',
  ordenPedido: 'text_mm6sv3rq',
  condicionEntrega: 'dropdown_mm6tve05',
  transporte: 'dropdown_mm6tk49e',
  formaPago: 'dropdown_mm6t6geg',
  divisa: 'color_mm6nbfey',

  /** Costo del transporte, según la condición de entrega sea FOB o FCA. */
  transporteFob: 'numeric_mm6scnmk',
  transporteFca: 'numeric_mm72rv29',
  /** Total del draft, con transporte incluido. */
  total: 'numeric_mm6n2m2y',

  /** ID legible ("DRAFT-014"). Sólo lectura: lo numera monday. */
  idDraft: 'pulse_id_mm6thwyf',
  pdf: 'file_mm6nkfm1',
} as const

/** 🧾 Subelementos de Drafts (18428672791) — un subitem por producto del draft. */
export const COL_DRAFT_SUB = {
  rodado: 'dropdown_mm70988f',
  cantidad: 'numeric_mm6nvzkt',
  precioUnitario: 'numeric_mm6nqrbw',
  costoFob: 'numeric_mm6schww',
  costoFca: 'numeric_mm72y3dz',
  valorNeto: 'numeric_mm6vzz57',
  /** Subtotal del producto, con transporte. */
  subtotal: 'numeric_mm6t6at7',
} as const

/** Etiqueta de "Lectura Draft" que habilita a planificar. */
export const DRAFT_LEIDO = 'Leido'

/** Etiquetas de "Estado Draf" (`color_mm6zdmzr`). */
export const DRAFT_ESTADO = {
  PEND_CONFIRMAR: 'Pend de Confirmar',
  CONFIRMADO: 'Confirmado en ORDEN de Confirmacion',
  CANCELADO: 'Cancelado',
  PEND_PLANIFICAR: 'Pend de Planificar',
  PLANIFICADA: 'Periodo Prod Planificada',
} as const

/**
 * Índices de "Estado Draf", para pedirle menos filas a monday.
 *
 * Como en el resto de la app, el filtro definitivo se vuelve a aplicar en el cliente comparando la
 * ETIQUETA: si mañana cambia el orden, se trae de más y se filtra bien.
 */
export const DRAFT_ESTADO_INDEX: Record<string, number> = {
  [DRAFT_ESTADO.PEND_CONFIRMAR]: 0,
  [DRAFT_ESTADO.CONFIRMADO]: 1,
  [DRAFT_ESTADO.CANCELADO]: 2,
  [DRAFT_ESTADO.PEND_PLANIFICAR]: 3,
  [DRAFT_ESTADO.PLANIFICADA]: 4,
}

/** Los estados del draft en el orden del circuito, para el dashboard. */
export const DRAFT_ESTADOS = [
  DRAFT_ESTADO.PEND_PLANIFICAR,
  DRAFT_ESTADO.PLANIFICADA,
  DRAFT_ESTADO.PEND_CONFIRMAR,
  DRAFT_ESTADO.CONFIRMADO,
  DRAFT_ESTADO.CANCELADO,
] as const

/**
 * 📬 Confirmación y Planificación (18428677294) — el envío a DEUTZ.
 *
 * La app sólo crea items de tipo PLANIFICACION; los de CONFIRMACION los genera otro circuito.
 */
export const COL_PLANIF = {
  tipo: 'color_mm737v3t',
  fecha: 'date4',
  /** Drafts que se mandan en esa planificación. */
  drafts: 'board_relation_mm70ss7g',
  /** Disparador del mail a DEUTZ con los PDF y los períodos sugeridos. */
  estadoEnvio: 'color_mm73xw6w',
} as const

/** Etiqueta de "Tipo" que le corresponde a lo que crea la app. */
export const PLANIF_TIPO = '🤚PLANIFICACION'

/**
 * 📬 El mismo tablero, visto del otro lado: las CONFIRMACIONES que manda DEUTZ.
 *
 * La app no las crea —las genera el circuito que lee los mails del proveedor—: las lee para
 * mostrar qué se va a confirmar y qué se va a proponer, y cuando está todo en orden deja el envío
 * en "Enviar".
 */
export const COL_CONFIRMACION = {
  tipo: 'color_mm737v3t',
  fecha: 'date4',
  /** Items del Inventario que entran en esa confirmación. */
  inventario: 'board_relation_mm6zhvba',
  /** Si la automatización ya volcó las fechas al Inventario. */
  estadoActInventario: 'color_mm6v8tv3',
  /** Si ya existe la planilla de Google con las fechas. */
  creacionSheet: 'color_mm6zx241',
  /** Disparador del envío de la propuesta al proveedor. */
  estadoPropuesta: 'color_mm6ss2d2',
  /** Link a la planilla de Google con las confirmaciones y las propuestas. */
  driveLink: 'link_mm6n3cwf',
  idConfirmacion: 'pulse_id_mm6vwvgr',
} as const

/** Etiqueta de "Tipo" de las confirmaciones, y su índice para filtrar. */
export const CONFIRMACION_TIPO = '🤖CONFIRMACION'
export const CONFIRMACION_TIPO_INDEX = 1

/**
 * Etiquetas de "Estado Propuesta" (`color_mm6ss2d2`): en qué anda el envío de la confirmación.
 *
 * `Enviado` es el final del camino: esa confirmación ya salió y no hay nada más que hacer con
 * ella. Las demás siguen sobre la mesa.
 */
export const ESTADO_PROPUESTA = {
  ENVIANDO: 'Enviando',
  ENVIADO: 'Enviado',
  DETENIDO: 'Detenido',
  ENVIAR: 'Enviar',
} as const

/** Los dos estados que tienen que estar en verde para poder mandar una confirmación. */
export const CONFIRMACION_LISTA = {
  INVENTARIO_ACTUALIZADO: 'Actualizado',
  SHEET_CREADO: 'Creado',
} as const

/** URL del tablero de planificación, para los enlaces "ver en monday". */
export const URL_TABLERO_PLANIFICACION =
  'https://maquinariasagricolas.monday.com/boards/18428677294'

/** URL del tablero de pagos, para los enlaces "ver en monday". */
export const URL_TABLERO_PAGOS = 'https://maquinariasagricolas.monday.com/boards/18430295445'

/** 🚜 Inventario (18428578101) — columnas que lee y escribe esta app. */
export const COL_INV = {
  /** N° Interno del tractor. Se muestra al lado del nombre. */
  numInterno: 'text_mm6n7mk6',
  /** N° de Draft. Viaja al subitem del pago (`text_mm71atj2`). */
  numDraft: 'text_mm6ne4br',
  /** Fecha de Prod. Su MES y AÑO son los que deciden qué tractores entran a la operación 1. */
  fechaProd: 'date_mm6nymx',
  /** Estado Pago. Es lo que la app va avanzando en las tres operaciones. */
  estadoPago: 'color_mm6v6532',
  /**
   * Estado Pedido: dónde está el tractor en el viaje, no en el circuito de pago.
   *
   * La app la toca en un solo momento —cuando el despacho pasa al despachante de aduana— y el
   * resto del recorrido (en tránsito, arribado, nacionalizado…) lo maneja el tablero.
   */
  estadoPedido: 'color_mm6n109a',
  /** Mirror del Costo de Flete (viene de Importación – Drafts). Sólo lectura. */
  costoFlete: 'lookup_mm6vg317',
  /** Mirror del Precio Unitario. Sólo lectura. */
  precioUnitario: 'lookup_mm6vfwgy',
  /** Mirror del Valor Neto. Es el importe que se suma para el total de la transferencia. */
  valorNeto: 'lookup_mm6vj4cp',
  /** Forma de Pago (ANTICIPADO / VISTA / VENCIDO). Sólo lectura en esta app. */
  formaPago: 'dropdown_mm6v2sa0',
  /** Mirror del Cod. de Producto. Viaja al subitem del pago (`text_mm71zgys`). */
  codProducto: 'lookup_mm6z4hd1',
  /** Mirror del Modelo (viene del Catálogo de Productos). Se muestra como etiqueta en todos los pasos. */
  modelo: 'lookup_mm726zx1',
  /** Estado Rodado: "Con Rodado" / "Sin Rodado". Se muestra como etiqueta en todos los pasos. */
  estadoRodado: 'color_mm72mfyd',
  /**
   * Confirmación de la Fecha de Producción. Sólo los tractores con la fecha CONFIRMADA se pueden
   * despachar: los demás no aparecen en ninguna de las dos modalidades.
   */
  confirmacionFecha: 'color_mm6s8xp2',
  /** Conexión al Catálogo de Productos. Es lo que permite saber en qué contenedor entra. */
  catalogo: 'board_relation_mm6sxre2',

  /* Lo que mira y escribe el módulo de Fechas de Producción. */
  /** Estado del PRIMARY STATUS de fábrica, como lo informa el proveedor. */
  primaryStatus: 'color_mm6n5xb',
  /** El mismo estado, en castellano. Es el que se lee en pantalla. */
  primaryStatusEsp: 'color_mm70vjqf',
  /** Medida del rodado. No confundir con `estadoRodado`, que dice si lo lleva o no. */
  tipoRodado: 'dropdown_mm709vd3',
  /** Fecha que BERGER propone cuando NO acepta la del proveedor. */
  fechaPropuesta: 'date_mm6n11kn',
  /** Estado de la fecha: aceptada, o con una nueva propuesta sobre la mesa. */
  estadoFechaProd: 'color_mm6sc76v',
  /** Confirmación de DEUTZ que respalda la fecha. Sin esto no se puede confirmar ni proponer. */
  confirmacion: 'board_relation_mm6z1cn9',
} as const

/** 🚜 Catálogo de Productos (18428421090) — de acá sale el puerto de carga de cada modelo. */
export const COL_CATALOGO = {
  /** Puerto(s) de carga del modelo. Es un dropdown: un modelo puede salir por más de uno. */
  puerto: 'dropdown_mm78jn1v',
} as const

/**
 * En qué país está cada puerto de carga.
 *
 * El Catálogo guarda sólo la ciudad ("Chennai") y el tablero del Despachante pide el país
 * ("India"), así que la traducción tiene que vivir en algún lado. Vive acá, al lado del resto de
 * lo que sabe de monday, y no dentro de la cuenta: son cinco puertos de dos columnas distintas y
 * ninguna de las dos guarda la relación.
 */
export const PAIS_POR_PUERTO: Record<string, string> = {
  Chennai: 'India',
  Gemlik: 'Turquia',
  Bremerhaven: 'Alemania',
  Hamburgo: 'Alemania',
  Genova: 'Italia',
}

/** 👮 Despachante de aduana (18430575903) — el item que la app crea al cerrar un despacho. */
export const COL_DESPACHANTE = {
  /** Conexión al item de Pagos del Inventario que originó el despacho. */
  pago: 'board_relation_mm7815ae',
  /** A quién se le asigna el despacho. Admite una sola persona. */
  despachante: 'person',
  /** Cuántos contenedores se generaron en ese pago. */
  cantidadContenedores: 'numeric_mm77sq5g',
  /** País de origen, deducido del puerto del Catálogo. Admite más de uno. */
  paisOrigen: 'dropdown_mm776ha7',
  /**
   * Puerto de carga, tal como viene del Catálogo de Productos.
   *
   * Va al lado del país porque es el dato con el que trabaja el despachante: el país dice de dónde
   * sale la mercadería, el puerto dice de dónde zarpa. Cuando el modelo tiene más de uno —los
   * alemanes salen por Bremerhaven o por Hamburgo— se cargan LOS DOS: el criterio para elegir
   * todavía no está definido, y elegir uno por nuestra cuenta sería inventarlo.
   */
  puertoOrigen: 'dropdown_mm79vwr1',
  proveedor: 'dropdown_mm77czh3',
  importador: 'color_mm77sys5',
  /**
   * TOTAL 🤖FOB: la suma del FOB de todos los tractores del despacho.
   *
   * La escribe la app al crear el despacho, con los subitems ya armados. Es una columna de números
   * y no un espejo porque sobre ella se calcula el prorrateo, y un número escrito queda igual
   * aunque después cambie el Inventario: el reparto de gastos de una importación no se puede
   * mover solo.
   */
  totalFob: 'numeric_mm7pb5r5',

  /* Lo que completa BERGER cuando la carga está por llegar. */
  formaPago: 'dropdown_mm77scb3',
  fondeo: 'dropdown_mm77t4vd',
  bancoDeclarar: 'dropdown_mm77yeb2',
  /* El VEP ARCA: el de la aduana. */
  formaPagoVepArca: 'dropdown_mm77tkx3',
  estadoPagoVepArca: 'color_mm793phx',

  /* El VEP TERMINAL: el de la terminal portuaria. Mismo circuito, otro trámite y otra plata. */
  formaPagoVepTerminal: 'dropdown_mm7hpn8z',
  estadoPagoVepTerminal: 'color_mm7gwnxh',

  /* Los comprobantes que sube el despachante a medida que avanza el trámite. */
  fcTransporteImpo: 'file_mm77pmw7',
  despachoImpo: 'file_mm77dbsc',
  fcTerminal: 'file_mm77qde5',
  gastosVarios: 'file_mm774a1r',

  /* Las facturas del trámite, todas del despachante. */
  facturaSenasa: 'file_mm7awbzw',
  facturaModoc: 'file_mm7a86et',
  facturaPrecintos: 'file_mm7a9sxq',

  /**
   * Los dos VEP que emite el DESPACHANTE. Cada uno es la llave de su pago: hasta que el archivo no
   * está, no hay VEP que pagar, y BERGER no puede ni marcarlo pagado ni subir su comprobante.
   */
  vepArca: 'file_mm7d41zn',
  vepTerminal: 'file_mm7gw5yt',
  /** Los comprobantes de cada pago, que sube BERGER una vez que pagó. */
  comprobanteVepArca: 'file_mm7d3jvj',
  comprobanteVepTerminal: 'file_mm7hqek2',

  /* Lo que carga el DESPACHANTE, ya con la OP en la calle. La app no lo escribe al crear el
     despacho: lo completa él desde el módulo de Aduana, a medida que la carga avanza. */
  nroOp: 'text_mm78qbvc',
  viaTransporte: 'dropdown_mm78f6fn',
  nroDocTransporte: 'text_mm77wxd4',
  /**
   * N° del despacho de importación. Es EL número del trámite ante la aduana: sin él una OP no
   * puede darse por nacionalizada, así que ese estado lo exige.
   */
  nroDespachoImpo: 'text_mm7756c6',
  contenedorRef: 'text_mm772j1r',
  eta: 'date4',
  buque: 'text_mm77pw8d',
  estadoCarga: 'status',
  observaciones: 'long_text_mm78yvbx',

  /** ID legible del despacho ("DESPACHO-003"). Sólo lectura: lo numera monday. */
  idDespacho: 'pulse_id_mm78a7v4',
  /** Cuándo se tocó por última vez. Sirve para ver qué OP quedaron sin actualizar. */
  ultimaActualizacion: 'pulse_updated_mm784qds',
} as const

/**
 * Etiquetas de "Estado de carga" (`status`), EN EL ORDEN DEL CIRCUITO.
 *
 * El orden no es el del tablero: es el que sigue la carga de verdad, desde que se crea la OP hasta
 * que se nacionaliza. Es el que se usa en los filtros y en el dashboard, porque una fila de estados
 * ordenada por cómo avanza la mercadería se lee sin pensar.
 */
/** Etiquetas de "Estado Pago Vep" (`color_mm793phx`). Un despacho nace en NO PAGADO. */
export const ESTADO_PAGO_VEP = {
  PAGADO: 'PAGADO',
  NO_PAGADO: 'NO PAGADO',
} as const

/**
 * Cómo se traduce el estado de carga de la OP al 🤖Estado Pedido de cada tractor.
 *
 * Son dos tableros que cuentan lo mismo desde dos lados: la OP dice dónde está la carga, el
 * Inventario dice dónde está cada tractor. Mientras avanzan juntos, el del tractor tiene que
 * seguir al de su OP.
 *
 * **Ojo con las etiquetas:** no son iguales. La OP dice "Próxim**a** a Arribar" —habla de la
 * carga— y el Inventario "Próxim**o** a Arribar" —habla del tractor—. Escribir una etiqueta que
 * no existe hace fallar la escritura ENTERA del item, así que el mapa va explícito y no se deduce.
 */
export const ESTADO_PEDIDO_POR_CARGA: Record<string, string> = {
  'En Transito': 'En Transito',
  'Próxima a Arribar': 'Próximo a Arribar',
  Nacionalizado: 'Nacionalizado',
}

/** El estado del tractor cuando su contenedor se marca arribado. */
export const PEDIDO_ARRIBADO = 'Arribado'

/** El estado de carga que obliga a tener los contenedores armados y dispara el aviso a BERGER. */
export const PROXIMA_A_ARRIBAR = 'Próxima a Arribar'

/**
 * El estado que exige el N° de Despacho de Importación.
 *
 * Vive acá y no en `lib/despachos` porque lo usa también el proxy de `api/`, y **este archivo no
 * importa nada**: las funciones edge de Vercel no resuelven el alias `@/`, así que todo lo que
 * llega desde `api/` tiene que colgar de módulos sin alias. Moverlo de acá vuelve a romper el
 * deploy, y el build local no lo avisa.
 */
export const NACIONALIZADO = 'Nacionalizado'

/**
 * Quiénes reciben el aviso cuando una OP pasa a "Próxima a Arribar".
 *
 * Son usuarios de monday y no un equipo: el aviso es una notificación personal, y monday no
 * notifica equipos. Si mañana cambian las personas, se cambian acá.
 */
export const AVISO_PROXIMA_ARRIBAR = [
  { id: '115175712', nombre: 'Sofia' },
  { id: '115175739', nombre: 'Micaela' },
] as const

/** Opciones de los campos que completa BERGER. Son las etiquetas tal cual están en el tablero. */
export const FORMA_PAGO_OP = [
  'B12 - Anticipo Bienes de Capital',
  'B20 - Contra BL Bienes de Capital',
  'B22 - Diferido Bienes de Capital',
  'B05 - Anticipado Bienes Generales',
  'B06 - Diferido Bienes Generales',
] as const

export const FONDEO = ['Propio', 'Prestamo banco', 'Cuenta corriente proveedor'] as const

export const BANCO_DECLARAR = [
  '017 BBVA Frances',
  '014 BPBA Provincia',
  '007 BG Galicia',
  '011 BNA Nacion',
  '072 Santander',
] as const

export const FORMA_PAGO_VEP = ['Interbanking', 'Banelco', 'Link'] as const

export const ESTADO_CARGA = [
  'Nueva OP',
  'Pendiente de Embarque',
  'En Transito',
  'Próxima a Arribar',
  'Nacionalizado',
] as const

export type EstadoCarga = (typeof ESTADO_CARGA)[number]

/** Etiquetas de "Via de transporte" (`dropdown_mm78f6fn`). */
export const VIA_TRANSPORTE = ['Vía Marítima', 'Vía Aérea', 'Vía Terrestre', 'Vía Currier'] as const

/** URL del tablero del Despachante de aduana, para los enlaces "ver en monday". */
export const URL_TABLERO_DESPACHANTE = 'https://maquinariasagricolas.monday.com/boards/18430575903'

/** 👮 Subelementos del Despachante (18431188087) — los mismos datos que el subitem del pago. */
export const COL_DESPACHANTE_SUB = {
  valorNeto: 'numeric_mm78rw31',
  numDraft: 'text_mm78wee6',
  codProducto: 'text_mm78m15e',
  /** Conexión al item del tractor en el Inventario. */
  inventario: 'board_relation_mm78fqs9',

  /* Espejos del Inventario. El chasis es lo que el despachante usa para identificar cada tractor
     cuando carga los contenedores: el nombre y el modelo se repiten, la matrícula no. */
  chasis: 'lookup_mm7am1p1',
  modelo: 'lookup_mm78rbz2',
  rodado: 'lookup_mm78j0hk',
  /** N° de la factura de compra del tractor, espejado del Inventario. */
  nroFactCompra: 'lookup_mm7avmwm',
  /** FOB - Precio Unitario del tractor, espejado del Inventario. */
  fob: 'lookup_mm7fqs33',

  /**
   * % Prorrateo: cuánto pesa el FOB de este tractor sobre el total del despacho.
   *
   * Un tractor de 10 en un despacho de 100 lleva 10. Es con lo que después se reparten los gastos
   * e impuestos de la importación entre los tractores, así que lo escribe la app junto con el
   * total: calcularlo a mano, tractor por tractor, es donde se cuelan los errores.
   */
  prorrateo: 'numeric_mm7nrxcp',
  /** Contenedor en el que viaja. Vacío = todavía no se armó. */
  contenedor: 'board_relation_mm7a62tt',
} as const

/**
 * 🔒Lista Blanca (18430553527) — las columnas que la app escribe al dar de alta a alguien.
 *
 * Es el tablero que decide quién entra: cada columna de acá es un permiso. Por eso la operación
 * que lo escribe tiene su propio módulo —`usuarios`, sólo para Administración— y una lista de
 * columnas escribibles tan corta como este objeto.
 */
export const COL_LISTA_BLANCA = {
  nombreCompleto: 'text_mm77m57b',
  estado: 'status',
  email: 'email_mm72cz3e',
  telefono: 'phone_mm72fchr',
  /**
   * 🤚App Habilitadas: las apps por su nombre. Es lo que se elige en el formulario y lo que se lee
   * de un vistazo en el tablero.
   */
  apps: 'dropdown_mm72c615',
  /**
   * 🤖ID APP Habilitadas: las mismas apps, por id de tablero. Es lo que compara el portón al
   * ingresar, pero **la app no la escribe**: la completa la automatización de BERGER cuando
   * detecta el item nuevo. Está acá porque el circuito de seguridad la lee.
   */
  appsIds: 'dropdown_mm72bgr3',
  team: 'dropdown_mm72dj2g',
  tipoUsuario: 'color_mm728j0d',
  /** Sólo para el team Despachantes: a qué tableros se lo suma. */
  tablerosDespachante: 'dropdown_mm7m1kj4',
  /** Ids de esos tableros. Los escribe la app, con los de las etiquetas elegidas. */
  idTableros: 'text_mm7wyfq',
  /** Id del equipo de monday al que se lo sumó. */
  idTeam: 'text_mm7w9a21',
  /** Id del usuario en monday. Lo escribe la app apenas lo invita. */
  usuarioId: 'text_mm72j4e6',
  /**
   * Si la fila es una PERSONA o un TEAM.
   *
   * El tablero tiene filas de las dos clases: las de un equipo entero —"TEAM Concesionario 1"— no
   * tienen email ni usuario de monday. El alta de la app siempre crea personas.
   */
  claseDeFila: 'color_mm7wwrk1',
} as const

/**
 * El equipo de monday que le corresponde a cada etiqueta de la columna Team.
 *
 * El "Concesionario" existe en el tablero pero no se ofrece en el alta: todavía no está definido
 * qué ve un concesionario dentro de la app, y dar de alta a alguien con un acceso que nadie
 * terminó de decidir es peor que no poder darlo de alta.
 */
export const TEAM_DE_ETIQUETA: Record<string, string> = {
  Administracion: '1509236',
  Despachantes: '1504184',
}

/**
 * El tablero de monday que le corresponde a cada etiqueta de "Tableros para Despachantes".
 *
 * Va escrito y no se busca por nombre: la etiqueta dice "Despachante de Aduana" y el tablero se
 * llama "👮Despachante de aduana". Emparejarlos por texto funcionaría hasta que alguien le cambie
 * el emoji, y ahí el despachante nuevo se quedaría sin acceso sin que nadie entienda por qué.
 */
export const TABLERO_DE_ETIQUETA: Record<string, string> = {
  'Despachante de Aduana': '18430575903',
}

/** Las etiquetas de la Lista Blanca que usa el alta. */
export const USUARIO = {
  /** Toda fila que crea la app es de una persona, no de un equipo. */
  PERSONA: 'PERSONA',
  ACTIVO: 'Activo',
  INACTIVO: 'Inactivo',
  /** Todo usuario que se crea desde la app entra como INVITADO. */
  INVITADO: 'INVITADO',
} as const

/** Los equipos, tal como figuran en el dropdown del tablero. */
export const TEAM_LISTA = {
  ADMINISTRACION: 'Administracion',
  DESPACHANTES: 'Despachantes',
} as const

/**
 * Contactos (18428421093) — de ahí salen los transportistas.
 *
 * El tablero es la agenda entera de BERGER: transportistas, clientes, despachantes y proveedores
 * conviven en él. La categoría es lo único que los separa.
 */
export const COL_CONTACTOS = {
  categoria: 'dropdown_mm7acm6r',
} as const

/** Etiquetas de 🤚Categoria. Un contacto puede tener varias a la vez. */
export const CATEGORIA_CONTACTO = {
  TRANSPORTISTA: 'Transportista',
  CLIENTE: 'Cliente',
  DESPACHANTE: 'Despachante',
  PROVEEDOR: 'Proveedor',
} as const

/**
 * 🚚 Contenedores (18431711942) — los que arma el despachante.
 *
 * OJO: no es el tablero 📦Contenedores (18430565324), que dice qué modelos PUEDEN viajar juntos.
 * Éste es el contenedor real, con su número y los tractores que efectivamente lo ocupan.
 */
export const COL_CONT_DESPACHO = {
  numero: 'text_mm7aye5e',
  fechaCreacion: 'date_mm7dxh72',
  /**
   * Ubicación de entrega: el depósito al que va el contenedor.
   *
   * Es un **desplegable** con los depósitos cargados en el tablero, no una dirección libre. Las
   * etiquetas se leen de monday en vivo —van a ir sumando depósitos— y por eso no están acá.
   */
  ubicacionEntrega: 'dropdown_mm7hvc28',
  /** La columna de ubicación anterior, de tipo location. Sólo se lee, para no perder lo cargado. */
  ubicacionVieja: 'location_mm7a16dx',
  transportista: 'board_relation_mm7axy2m',
  fechaTurno: 'date_mm7a8jds',
  patente: 'text_mm7a8ngn',
  estadoArribo: 'color_mm7ar9rc',
  /** Cuándo llegó. La app la escribe al marcar el arribo. */
  fechaArribo: 'date_mm7dqnek',
  /** Estado del aviso del turno al transportista. En "Enviado" ya se le escribió. */
  estadoEnvioTurno: 'color_mm7dzv11',
  /** ID legible del contenedor ("CONTENED-004"). Sólo lectura: lo numera monday. */
  idContenedor: 'pulse_id_mm7da57j',
  /** Tractores que van adentro: subitems del Despachante de aduana. */
  /** Los SUBITEMS del despachante que viajan adentro. */
  tractores: 'board_relation_mm7abg4',
  /**
   * Los mismos tractores, pero apuntando al 🧮Inventario.
   *
   * No es la misma conexión con otro nombre: una lleva al subitem del despacho —que existe sólo
   * para esa OP— y la otra al item del tractor, que es el que lo acompaña desde que se pide hasta
   * que se entrega. Desde el Inventario, ésta es la única forma de saber en qué contenedor viajó.
   */
  inventario: 'board_relation_mm7hf5x4',
  /**
   * La OP a nivel ITEM.
   *
   * Los tractores ya conectan el contenedor con los subitems, pero eso no alcanza para trabajar
   * desde el contenedor: para saber de qué OP es —y en qué estado está esa OP— habría que subir
   * por cada subitem hasta su padre. Con la conexión al item, el contenedor trae todo espejado.
   */
  opDespacho: 'board_relation_mm7d8kr1',

  /* Espejos de la OP y de los tractores. Son los que permiten buscar un contenedor por cualquiera
     de los nombres con los que se lo llama en la operación. */
  nroOpDespachante: 'lookup_mm7d50jj',
  idOp: 'lookup_mm7dq99y',
  estadoCargaOp: 'lookup_mm7d9537',
  chasis: 'lookup_mm7ds57v',
} as const

/** Etiquetas de "Estado de Arribo" (`color_mm7ar9rc`). */
/**
 * Estados del aviso del turno de carga al transportista (`color_mm7dzv11`).
 *
 * El circuito lo mueve una automatización de monday: se pone en `Enviar`, ella manda el correo y
 * lo deja en `Enviado`. Para la app, `Enviado` significa "ya se le avisó a esta persona a esta
 * hora", y por eso a partir de ahí no se toca ni el transportista ni el lugar de entrega.
 */
export const ESTADO_ENVIO_TURNO = {
  ENVIAR: 'Enviar',
  ENVIANDO: 'Enviando',
  ENVIADO: 'Enviado',
  ERROR: 'Error - Ver Update',
} as const

export const ESTADO_ARRIBO = {
  PENDIENTE: 'Pendientes de Arribar',
  ARRIBADO: 'Arribado',
} as const

/**
 * Estados de la OP en los que sus contenedores ya se pueden marcar como arribados.
 *
 * Antes de "Próxima a Arribar" la carga todavía está navegando: marcar un arribo ahí sería
 * anticiparse a un hecho que no pasó.
 */
export const ESTADOS_CON_ARRIBO: string[] = [PROXIMA_A_ARRIBAR, 'Nacionalizado']

/** URL del tablero de contenedores del despacho, para los enlaces "ver en monday". */
export const URL_TABLERO_CONTENEDORES = 'https://maquinariasagricolas.monday.com/boards/18431711942'

/**
 * Equipo "Despachantes" de la cuenta (`/teams/1504184`).
 *
 * Quién puede recibir un despacho se decide en monday, agregando o sacando gente de ese equipo, y
 * no en el código: así el día que entre un despachante nuevo no hay que tocar ni desplegar nada.
 */
export const TEAM_DESPACHANTES = '1504184'

/**
 * Equipo "Administración Berger SA" de la cuenta (`/teams/1509236`).
 *
 * Reemplazó al anterior (1504155) el 29/09/2026: el viejo no admitía invitados, y este circuito
 * necesita que un INVITADO pueda estar en Administración.
 */
export const TEAM_ADMINISTRACION = '1509236'

/**
 * Los puertos que acepta la columna del Despachante.
 *
 * Son los mismos que el Catálogo, pero la lista vive acá porque es la del tablero DONDE SE ESCRIBE:
 * un dropdown rechaza la escritura entera si una etiqueta no existe, así que lo que no está en
 * esta lista se deja afuera en vez de hacer fallar todo el despacho.
 */
export const PUERTOS_DESPACHANTE = ['Bremerhaven', 'Hamburgo', 'Chennai', 'Gemlik', 'Genova']

/** Valores fijos del despacho: hoy la app despacha un solo proveedor y un solo importador. */
export const PROVEEDOR_DESPACHO = 'Same Deutz Fahr SPA'
export const IMPORTADOR_DESPACHO = 'Berger SA'

/** Etiqueta de "Estado Pedido" que deja la app al armar el despacho de aduana. */
export const PEDIDO_EN_DESPACHANTE = 'En Despachante'

/** Etiquetas de "Estado Confirmación Fecha Producción" (`color_mm6s8xp2`). */
export const FECHA_CONFIRMADA = 'Fecha Confirmada'

/**
 * Las tres etiquetas de esa columna, con su índice para filtrar en monday.
 *
 * `Fecha Pend Confirmar` es la que espera una decisión de BERGER. `Fecha a Confirmar` es en la que
 * queda un tractor al que BERGER le propuso otra fecha: ahora el que tiene que responder es el
 * proveedor.
 */
export const ESTADO_FECHA = {
  CONFIRMADA: FECHA_CONFIRMADA,
  PEND_CONFIRMAR: 'Fecha Pend Confirmar',
  A_CONFIRMAR: 'Fecha a Confirmar',
} as const

export const ESTADO_FECHA_INDEX: Record<string, number> = {
  [ESTADO_FECHA.CONFIRMADA]: 0,
  [ESTADO_FECHA.PEND_CONFIRMAR]: 1,
  [ESTADO_FECHA.A_CONFIRMAR]: 2,
}

/** Etiquetas de "Estado Fecha Producción" (`color_mm6sc76v`): en qué quedó la fecha. */
export const ESTADO_FECHA_PROD = {
  PROPUESTA: 'Nueva Fecha Propuesta',
  ACEPTADA: 'Aceptada',
} as const

/**
 * Opciones de "Forma de Pago" (`dropdown_mm6v2sa0`), con el id de cada etiqueta.
 *
 * Es la columna que separa las dos modalidades de despacho: ANTICIPADO pasa por el circuito de
 * pago de tres operaciones; VISTA se pide sin pago previo. Como en los `status`, Monday filtra
 * los `dropdown` por id y no por texto, así que el id viaja a la consulta y la etiqueta se vuelve
 * a comprobar en el cliente.
 */
export const FORMA_PAGO = {
  ANTICIPADO: { etiqueta: 'ANTICIPADO', id: 1 },
  VISTA: { etiqueta: 'VISTA', id: 2 },
  VENCIDO: { etiqueta: 'VENCIDO', id: 3 },
} as const

/** Etiquetas de "Estado Rodado" (`color_mm72mfyd`). */
export const RODADO = {
  CON: 'Con Rodado',
  SIN: 'Sin Rodado',
} as const

/**
 * Etiquetas de "Estado Pago" del Inventario (`color_mm6v6532`).
 *
 * Marcan el recorrido del tractor por las tres operaciones: `LISTO` → `TRANSF_CARGADA` →
 * `TRANSF_APROBADA` → `PAGADO`.
 */
export const INV_ESTADO = {
  /** Todavía no entra en una transferencia: se paga el mes que viene. */
  A_PAGAR_PROX_MES: 'A Pagar Prox Mes',
  LISTO: 'Listo para Pagar',
  /** En el que quedan los tractores pedidos a la vista: se despachan sin pago previo. */
  PENDIENTE_PAGO: 'Pendiente de Pago',
  TRANSF_CARGADA: 'Transf Cargada',
  TRANSF_APROBADA: 'Transf Aprobada',
  PAGADO: 'Pagado',
} as const

/**
 * Índices de cada etiqueta de "Estado Pago", para filtrar en monday.
 *
 * Monday filtra los `status` por índice, no por texto: mandar la etiqueta devuelve una lista vacía
 * sin error, que es la forma más silenciosa posible de romper una pantalla. El índice sirve para
 * pedirle menos filas a la API; el filtro que decide de verdad se vuelve a aplicar en el cliente
 * comparando la ETIQUETA, así que un cambio de orden no cuelga nada.
 */
export const INV_ESTADO_INDEX: Record<string, number> = {
  [INV_ESTADO.A_PAGAR_PROX_MES]: 0,
  [INV_ESTADO.PAGADO]: 1,
  [INV_ESTADO.LISTO]: 2,
  [INV_ESTADO.TRANSF_CARGADA]: 3,
  [INV_ESTADO.TRANSF_APROBADA]: 4,
  [INV_ESTADO.PENDIENTE_PAGO]: 6,
}

/**
 * Índice de "Listo para Pagar" dentro de la columna de estado del Inventario.
 *
 * Monday filtra los `status` por índice, no por texto: mandar la etiqueta devuelve una lista
 * vacía sin error, que es la forma más silenciosa posible de romper una pantalla. El índice se
 * usa sólo para pedirle menos filas a la API; el filtro que decide de verdad se vuelve a aplicar
 * en el cliente comparando la etiqueta, así que un cambio de índice no cuelga la app.
 */
export const INV_ESTADO_LISTO_INDEX = 2

/** 💸 Pagos del Inventario (18430295445) — columnas que lee y completa esta app. */
export const COL_PAGO = {
  /** Operación 1: PDF de la transferencia emitida. */
  transferencia: 'file_mm71eqv5',
  /** Operación 2: PDF de la transferencia CON número, la que se le manda al proveedor. */
  transferenciaConNumero: 'file_mm71s567',
  /** Operación 3: comprobante del banco que acredita el depósito. */
  comprobanteBanco: 'file_mm713dbc',

  montoTransferencia: 'numeric_mm714xb2',
  fechaEmision: 'date_mm71jrsz',

  /** Estado Pago: CARGADO → APROBADO → CONFIRMADO. */
  estadoPago: 'color_mm71p4rf',
  /** Operación Pendiente: es la columna que dice quién tiene que actuar a continuación. */
  operacionPend: 'color_mm71e2wc',

  /** Modalidad con la que se despachó: ANTICIPADO o VISTA. */
  tipoPago: 'color_mm78170z',
  /** Fecha de emisión del pedido a la vista. */
  fechaPagoVista: 'date_mm77cwrs',
  /** Lo que queda por cobrar de un pedido a la vista. */
  montoPendienteVista: 'numeric_mm78d1ng',
  /**
   * Aviso al despachante. La app lo deja en "Enviar" como ÚLTIMO paso, recién cuando el item
   * quedó completo: el mail sale de ahí, y mandarlo antes sería avisar sobre un despacho a medio
   * cargar.
   */
  emailDespacho: 'color_mm78m8pn',
  /** Reporte de los contenedores que armó la app. Es lo que después va al mail del proveedor. */
  contenedores: 'long_text_mm77ydg9',

  /** Fecha en que se completó cada operación. */
  fechaCargado: 'date_mm71zare',
  fechaAprobado: 'date_mm71xrq5',
  fechaConfirmado: 'date_mm71q4qa',

  /** Disparadores de los avisos por mail al proveedor; los manda la automatización del tablero. */
  estadoEmail1: 'color_mm71tfkp',
  estadoEmail2: 'color_mm71bk6h',
} as const

/** Etiquetas de "Tipo de Pago" (`color_mm78170z`): con qué modalidad se despachó. */
export const TIPO_PAGO = {
  ANTICIPADO: 'ANTICIPADO',
  VISTA: 'VISTA',
} as const

/** Etiquetas de "Estado Pago" del tablero de Pagos (`color_mm71p4rf`). */
export const PAGO_ESTADO = {
  CARGADO: 'CARGADO',
  APROBADO: 'APROBADO',
  CONFIRMADO: 'CONFIRMADO',
} as const

/**
 * Etiquetas de "Operacion Pend" (`color_mm71e2wc`).
 *
 * Es la columna que la app usa para saber qué pagos ofrecer en cada operación: la 2 trabaja sobre
 * los `PEND_APROBAR` y la 3 sobre los `PEND_CONFIRMAR`.
 */
export const PAGO_OPERACION = {
  PEND_APROBAR: 'Pend de Aprobar Transf',
  /** Pedido a la vista: se despachó sin pago, y el pago queda pendiente. */
  PENDIENTE_PAGO: 'Pendiente de Pago',
  PEND_CONFIRMAR: 'Pend de Confirmar Transf',
  PAGADO: 'Pagado',
} as const

/**
 * Índices de "Operacion Pend", para pedirle menos filas a la API. Igual que en el Inventario, el
 * filtro definitivo se aplica después comparando la etiqueta.
 */
export const PAGO_OPERACION_INDEX: Record<string, number> = {
  [PAGO_OPERACION.PEND_APROBAR]: 0,
  [PAGO_OPERACION.PAGADO]: 1,
  [PAGO_OPERACION.PEND_CONFIRMAR]: 2,
  [PAGO_OPERACION.PENDIENTE_PAGO]: 3,
}

/**
 * Etiqueta que dispara el envío del mail.
 *
 * La app sólo la pone en `Enviar`; el resto del ciclo (`Enviando`, `Enviado`, `Error - Ver
 * Update`) lo maneja la automatización del tablero y no tiene sentido que lo escriba la app.
 */
export const EMAIL_ENVIAR = 'Enviar'

/** 💸 Subelementos de Pagos del Inventario (18430295515) — un subitem por tractor. */
export const COL_PAGO_SUB = {
  valorNeto: 'numeric_mm71c5je',
  numDraft: 'text_mm71atj2',
  codProducto: 'text_mm71zgys',
  /** Conexión al item del tractor en el tablero de Inventario. */
  inventario: 'board_relation_mm718zjg',
  /** Mirror del N° Interno del tractor conectado. Sólo lectura. */
  numInterno: 'lookup_mm71zb7h',
} as const

/**
 * 📦 Contenedores (18430565324): qué modelos del catálogo viajan juntos, en qué contenedor y
 * cuántos entran.
 *
 * Cada fila es una COMBINACIÓN posible: los productos conectados pueden compartir contenedor hasta
 * la cantidad indicada. Un mismo grupo de productos puede tener varias filas —distinto contenedor,
 * distinto rodado, distinta capacidad— y la app elige entre ellas al armar el despacho.
 */
export const COL_CONTENEDOR = {
  /** Productos del catálogo que entran combinados en esta fila. */
  catalogo: 'board_relation_mm77crvy',
  tipo: 'status',
  capacidad: 'numeric_mm77r45y',
  ruedas: 'color_mm77eeke',
} as const

/**
 * Tipos de contenedor. El "+" no es decorativo: dice que esa combinación ocupa DOS contenedores,
 * y por eso la cantidad de contenedores se cuenta partiendo la etiqueta.
 */
export const CONTENEDOR_CUALQUIERA = 'CUALQUIER CONTENEDOR'

/**
 * Etiquetas de la columna "Ruedas" de Contenedores.
 *
 * Ojo con los nombres: el Inventario dice "Con Rodado" / "Sin Rodado" y Contenedores dice "Con
 * Ruedas" / "Sin Ruedas". Son la misma idea con distinta palabra, y hay una tercera —"Con y Sin
 * Ruedas"— que sirve para los dos.
 */
export const RUEDAS_CONTENEDOR = {
  CON: 'Con Ruedas',
  SIN: 'Sin Ruedas',
  AMBAS: 'Con y Sin Ruedas',
} as const

/* ------------------------------------------------------------------ *
 * VENTA · el CRM: cuentas y contactos
 * ------------------------------------------------------------------ */

/**
 * 🌐Cuentas (18428421094) — una fila por cliente, proveedor o transporte.
 *
 * El alta vive en la app y no en el tablero por un motivo concreto: es el único lugar donde se
 * controla que el CUIT esté bien formado y que no haya dos cuentas con el mismo. En el tablero,
 * cargar una fila a mano no comprueba nada.
 */
export const COL_CUENTA = {
  tipoPersona: 'color_mm7az0tv',
  /** Toda cuenta nace Activa. La baja se hace en monday, donde queda quién la hizo. */
  estado: 'color_mm7ak3fa',
  clasificacion: 'color_mm7v72pp',
  /** Admite más de una: una misma empresa puede ser cliente y transporte. */
  categoria: 'dropdown_mm7acwp4',
  cuit: 'text_mm7arwz2',
  condicionFiscal: 'color_mm7a82b7',
  /** Dirección como ubicación de monday: necesita `{lat, lng, address}`. */
  direccion: 'location_mm7ak2f4',
  /** La misma dirección en texto plano: es la que se carga si no se pudo geocodificar. */
  direccionTexto: 'text_mm7an434',
  ciudad: 'text_mm7v1gjt',
  provincia: 'text_mm7vr4t2',
  pais: 'country_mm7v20qg',
  descripcion: 'company_description',
  /** Contactos de la cuenta. Es de doble vía con `COL_CONTACTO.cuenta`. */
  contactos: 'account_contact',
  concesionario: 'board_relation_mm7vab3s',
  fechaAlta: 'date_mm7a6c3b',
} as const

/**
 * 🚹Contactos (18428421093) — una fila por persona.
 *
 * El `name` del item se arma con nombre y apellido: monday no acepta items sin nombre, y dejar que
 * cada uno lo escriba a mano termina en "Juan", "juan perez" y "PEREZ, Juan" para la misma persona.
 */
export const COL_CONTACTO = {
  nombres: 'text_mm7a5rkb',
  apellidos: 'text_mm7a4dqr',
  /** Todo contacto nace Activo. */
  estado: 'color_mm7aa66j',
  categoria: 'dropdown_mm7acm6r',
  email: 'contact_email',
  /** País del teléfono: de ahí sale el prefijo del WhatsApp. */
  pais: 'country_mm7v9ta7',
  whatsapp: 'phone_mm7ah51c',
  comentarios: 'long_text4',
  /** Cuenta a la que pertenece. De doble vía con `COL_CUENTA.contactos`. */
  cuenta: 'contact_account',
  fechaAlta: 'date_mm7atktf',
} as const

/** Etiquetas del CRM que la app fija al crear. Las demás se leen del tablero. */
export const CRM = {
  CUENTA_ACTIVA: 'Activa',
  CONTACTO_ACTIVO: 'Activo',
} as const

/**
 * 🗓️Actividades (18428421092) — lo que se habló con un cliente y lo que falta hablar.
 */
export const COL_ACTIVIDAD = {
  tipo: 'activity_type',
  cuenta: 'board_relation_mm7vq21v',
  contactos: 'board_relation_mm7vg8ee',
  /** Quién la hizo. Lo pone la app con el usuario de monday que está usando la pantalla. */
  responsable: 'activity_owner',
  fecha: 'activity_start_time',
  estado: 'activity_status',
  descripcion: 'long_text_mm7vhfe4',
} as const

/**
 * Los dos estados que escribe la app.
 *
 * El tablero tiene cinco —Done, Pendiente, Vencida, Abierto, Completada— pero la app sólo usa
 * estos dos: lo que ya pasó y lo que todavía no. Los otros los mueve quien trabaja el tablero.
 */
export const ESTADO_ACTIVIDAD = {
  COMPLETADA: 'Completada',
  PENDIENTE: 'Pendiente',
} as const
