import type { ModuloApp } from '@/services/monday/operaciones'
import type {
  AreaApp,
  ModalidadDespacho,
  OpcionPanel,
  OperacionAduana,
  SeccionPanel,
  OperacionDrafts,
  OperacionFechas,
  OperacionPrincipal,
} from '@/types'

/**
 * Las áreas: el primer panel de la app.
 *
 * La app nació para la importación y durante meses todo lo que tenía era eso. Cuando se sumó la
 * venta, dejar las dos cosas en una sola lista obligaba a leer diez operaciones para encontrar
 * una. Separarlas en COMPRA y VENTA no es decoración: es la primera pregunta que se hace alguien
 * al entrar, y contestarla descarta la mitad de la app.
 */
export const AREAS: OpcionPanel<AreaApp>[] = [
  {
    id: 'compra',
    titulo: 'COMPRA',
    corto: 'Compra',
    detalle:
      'Todos los procedimientos de importación de tractores: los drafts, las fechas de producción, ' +
      'los pagos del despacho y el seguimiento en aduana.',
    icono: 'fa-solid fa-ship',
  },
  {
    id: 'venta',
    titulo: 'VENTA',
    corto: 'Venta',
    detalle: 'La venta de los tractores a los concesionarios: las cuentas y sus contactos.',
    icono: 'fa-solid fa-handshake',
  },
]

/** Las áreas que tienen al menos una operación visible para este perfil. */
export const areasDeModulos = (modulos: ModuloApp[]): OpcionPanel<AreaApp>[] =>
  AREAS.filter((a) =>
    OPERACIONES_PRINCIPALES.some((o) => o.area === a.id && modulos.includes(o.modulo)),
  )

/**
 * Operaciones principales: el primer panel de la app.
 *
 * Cada una pertenece a un módulo, y cada persona ve sólo las de los módulos que tiene habilitados:
 * la gente de BERGER despacha, el despachante de aduana actualiza las OP. Esconderlas es sólo
 * comodidad —el permiso lo aplica el servidor en cada pedido—, pero ofrecerle a alguien una
 * pantalla que va a rebotar es peor que no ofrecérsela.
 */
export const OPERACIONES_PRINCIPALES: (OpcionPanel<OperacionPrincipal> & {
  modulo: ModuloApp
  area: AreaApp
})[] = [
  {
    id: 'usuarios',
    area: 'compra',
    modulo: 'usuarios',
    titulo: 'REGISTRO DE USUARIO',
    corto: 'Registro de usuario',
    detalle: 'Dar de alta gente en la Lista Blanca, y desactivar invitados que ya no entran.',
    icono: 'fa-solid fa-user-shield',
  },
  {
    id: 'drafts',
    area: 'compra',
    modulo: 'drafts',
    titulo: 'PLANIFICACIÓN DE DRAFTS',
    corto: 'Planificación de drafts',
    detalle:
      'Período de producción de cada draft y envío de la planificación al proveedor, antes de que ' +
      'el tractor exista.',
    icono: 'fa-solid fa-calendar-check',
  },
  {
    id: 'fechas',
    area: 'compra',
    modulo: 'fechas',
    titulo: 'FECHAS DE PRODUCCIÓN INVENTARIO',
    corto: 'Fechas de producción',
    detalle:
      'El ida y vuelta con el proveedor por la fecha de producción de cada tractor: confirmarla o ' +
      'proponer otra.',
    icono: 'fa-solid fa-calendar-day',
  },
  {
    id: 'despacho',
    area: 'compra',
    modulo: 'despacho',
    titulo: 'GESTIÓN DE LOS PAGOS',
    corto: 'Gestión de los pagos',
    detalle: 'Despacho de tractores del inventario, con pago anticipado o a la vista.',
    icono: 'fa-solid fa-truck-ramp-box',
  },
  {
    id: 'aduana',
    area: 'compra',
    modulo: 'aduana',
    titulo: 'DESPACHO DE ADUANA',
    corto: 'Despacho de aduana',
    detalle:
      'Seguimiento de las OP ya despachadas: estado de la carga, contenedores, arribos y pago.',
    icono: 'fa-solid fa-passport',
  },
  {
    id: 'clientes',
    area: 'venta',
    modulo: 'ventas',
    titulo: 'ALTA DE CUENTAS Y CONTACTOS',
    corto: 'Alta de cuentas y contactos',
    detalle:
      'Dar de alta una cuenta con su CUIT, o un contacto de una cuenta que ya existe. Es el único ' +
      'lugar donde se controla que el CUIT esté bien y que no haya duplicados.',
    icono: 'fa-solid fa-address-book',
  },
]

/** Las operaciones principales de un área que puede ver este perfil. */
export const principalesDeArea = (
  modulos: ModuloApp[],
  area: AreaApp,
): OpcionPanel<OperacionPrincipal>[] =>
  OPERACIONES_PRINCIPALES.filter((o) => o.area === area && modulos.includes(o.modulo))

/** Todas las que puede ver, sin mirar el área. La usa el panel lateral. */
export const principalesDeModulos = (modulos: ModuloApp[]): OpcionPanel<OperacionPrincipal>[] =>
  OPERACIONES_PRINCIPALES.filter((o) => modulos.includes(o.modulo))

/**
 * Operaciones dentro de DESPACHANTE DE ADUANA: el segundo panel del módulo de aduana.
 *
 * El dashboard tiene su propio módulo: el despachante externo entra a actualizar los datos de sus
 * OP, no a mirar el estado de toda la operación de BERGER. Administración ve las dos.
 */
export const SECCIONES_ADUANA: SeccionPanel[] = [
  {
    id: 'despachante',
    titulo: 'DESPACHANTE',
    detalle: 'Lo que carga el despachante de aduana sobre sus OP.',
    tono: 'azul',
    icono: 'fa-solid fa-user-tie',
  },
  {
    id: 'berger',
    titulo: 'BERGER S.A.',
    detalle: 'Lo que define BERGER: pago, entrega y seguimiento.',
    tono: 'naranja',
    icono: 'fa-solid fa-building',
  },
]

/**
 * Operaciones dentro de DESPACHO DE ADUANA.
 *
 * Van en **dos secciones** porque son dos trabajos distintos sobre las mismas OP, y con los
 * nombres largos —"ACTUALIZAR OP - BERGER S.A." contra "ACTUALIZAR DESPACHO OP - DESPACHANTE"— lo
 * que distinguía a una de otra estaba al final del renglón. Agrupadas, el nombre corto alcanza:
 * dentro de DESPACHANTE, "ACTUALIZAR OP" no puede ser otra cosa.
 *
 * El dashboard tiene su propio módulo: el despachante externo entra a actualizar los datos de sus
 * OP, no a mirar el estado de toda la operación de BERGER. Administración ve las dos secciones.
 */
export const OPERACIONES_ADUANA: (OpcionPanel<OperacionAduana> & { modulo: ModuloApp })[] = [
  {
    id: 'actualizar',
    seccion: 'despachante',
    modulo: 'aduana',
    titulo: 'ACTUALIZAR OP',
    corto: 'Actualizar OP · despachante',
    detalle:
      'Estado de la carga, ETA, buque, comprobantes del trámite y armado de los contenedores.',
    icono: 'fa-solid fa-pen-to-square',
  },
  {
    id: 'turnos',
    seccion: 'despachante',
    modulo: 'aduana',
    titulo: 'CARGAR TURNO CONTENEDOR',
    corto: 'Turno de carga · despachante',
    detalle: 'Citar el camión de cada contenedor: día y hora del turno de carga en la terminal.',
    icono: 'fa-solid fa-calendar-day',
  },
  {
    id: 'berger',
    seccion: 'berger',
    modulo: 'aduanaBerger',
    titulo: 'ACTUALIZAR OP',
    corto: 'Actualizar OP · BERGER',
    detalle:
      'De las OP próximas a arribar: forma de pago, fondeo, banco y los dos VEP —ARCA y Terminal—.',
    icono: 'fa-solid fa-building-columns',
  },
  {
    id: 'contenedores',
    seccion: 'berger',
    modulo: 'aduanaBerger',
    titulo: 'ACTUALIZAR CONTENEDORES',
    corto: 'Actualizar contenedores',
    detalle: 'Marcar los contenedores que ya llegaron y cargarles la ubicación de entrega.',
    icono: 'fa-solid fa-truck-ramp-box',
  },
  {
    id: 'dashboard',
    seccion: 'berger',
    modulo: 'aduanaDashboard',
    titulo: 'DASHBOARD DE DESPACHOS',
    corto: 'Dashboard',
    detalle: 'Cuántas OP hay en cada estado, qué arriba primero y qué quedó sin cargar.',
    icono: 'fa-solid fa-chart-simple',
  },
]

/** Operaciones dentro de FECHAS DE PRODUCCIÓN INVENTARIO. */
export const OPERACIONES_FECHAS: OpcionPanel<OperacionFechas>[] = [
  {
    id: 'confirmar',
    titulo: 'CONFIRMAR / PROPONER FECHA PRODUCCIÓN',
    corto: 'Confirmar / proponer',
    detalle:
      'Aceptar la fecha que informó el proveedor para cada tractor, o devolverle una propuesta.',
    icono: 'fa-solid fa-calendar-check',
  },
  {
    id: 'enviar',
    titulo: 'ENVIAR CONFIRMACIÓN',
    corto: 'Enviar confirmación',
    detalle:
      'Revisar qué se confirma y qué se propone en una confirmación del proveedor, y mandársela.',
    icono: 'fa-solid fa-paper-plane',
  },
]

/** Operaciones dentro de PLANIFICACIÓN DE DRAFTS: el segundo panel del módulo de drafts. */
export const OPERACIONES_DRAFTS: OpcionPanel<OperacionDrafts>[] = [
  {
    id: 'planificar',
    titulo: 'PLANIFICAR PERÍODO DE PRODUCCIÓN',
    corto: 'Planificar período',
    detalle:
      'Asignarle a cada draft leído el período en el que se le pide al proveedor que lo fabrique.',
    icono: 'fa-solid fa-calendar-plus',
  },
  {
    id: 'enviar',
    titulo: 'ENVIAR PLANIFICACIÓN',
    corto: 'Enviar planificación',
    detalle: 'Mandarle a DEUTZ los drafts ya planificados, con su período sugerido y sus PDF.',
    icono: 'fa-solid fa-paper-plane',
  },
  {
    id: 'dashboard',
    titulo: 'DASHBOARD DE DRAFTS',
    corto: 'Dashboard',
    detalle: 'Cuántos drafts hay en cada estado, qué carga se sugirió y qué está esperando acción.',
    icono: 'fa-solid fa-chart-simple',
  },
]

/** Las operaciones de aduana que puede ver este perfil. */
export const aduanaDeModulos = (modulos: ModuloApp[]): OpcionPanel<OperacionAduana>[] =>
  OPERACIONES_ADUANA.filter((o) => modulos.includes(o.modulo))

/** ¿Tiene permitida ESTA operación de aduana? Es lo que evita dibujar una pantalla que va a rebotar. */
export const puedeEnAduana = (modulos: ModuloApp[], id: OperacionAduana): boolean =>
  aduanaDeModulos(modulos).some((o) => o.id === id)

/** Modalidades de despacho: el segundo panel, dentro de DESPACHO. */
export const MODALIDADES_DESPACHO: OpcionPanel<ModalidadDespacho>[] = [
  {
    id: 'anticipado',
    titulo: 'PAGO ANTICIPADO',
    corto: 'Pago anticipado',
    detalle:
      'El tractor se paga antes de despacharse: carga de la transferencia, aprobación y ' +
      'confirmación del pago.',
    icono: 'fa-solid fa-file-invoice-dollar',
  },
  {
    id: 'vista',
    titulo: 'PAGO VISTA (Contra BL)',
    corto: 'Pago vista',
    detalle:
      'El pedido se hace sin pago previo, con los tractores que tienen Forma de Pago en VISTA.',
    icono: 'fa-solid fa-paper-plane',
  },
]
