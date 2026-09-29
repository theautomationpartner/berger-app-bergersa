/**
 * Configuración de la capa de seguridad.
 *
 * Los ids de los tableros de seguridad y el id de la app NO están escritos en el código: vienen de
 * variables de entorno del deploy, todas con el prefijo `SEGURIDAD_` para que queden juntas en
 * Vercel. Así no quedan en el repositorio, y el mismo código sirve para la próxima app sin tocar
 * una línea.
 *
 * Las variables son de dos clases, y la diferencia importa el día que haya más de una app:
 *
 * COMPARTIDAS por todas las apps de BERGER — mismo valor en todos los proyectos. Conviene cargarlas
 * una sola vez como "Shared Environment Variables" del equipo en Vercel y vincularlas a cada
 * proyecto:
 *
 *   SEGURIDAD_CLAVE_MAESTRA            SEGURIDAD_AUTENTICADOR_TABLERO_ID
 *   SEGURIDAD_LISTA_BLANCA_TABLERO_ID  SEGURIDAD_REGISTRO_TABLERO_ID
 *
 *   La clave maestra no sólo PUEDE ser la misma: TIENE que serlo. Todas las apps leen y escriben el
 *   mismo tablero del autenticador, y cada una tiene que poder descifrar el secreto que guardó
 *   otra. Con claves distintas, la segunda app encontraría el secreto de la persona y no podría
 *   leerlo. Compartirla no mezcla las sesiones: cada sesión del día lleva la app adentro y sólo
 *   vale para esa.
 *
 * PROPIA de cada app — distinta en cada proyecto:
 *
 *   SEGURIDAD_APP_ID   el id con el que la app figura en "ID APP Habilitadas" de la Lista Blanca
 *
 * Los ids de COLUMNAS sí están en el código (acá abajo): este archivo vive en `api/`, que corre
 * sólo en el servidor y nunca llega al navegador.
 */
import { ErrorDeConfiguracion } from './cripto'

function requerida(nombre: string): string {
  const valor = process.env[nombre]?.trim()
  if (!valor) throw new ErrorDeConfiguracion(`Falta ${nombre} en el entorno del deploy.`)
  return valor
}

export function configSeguridad() {
  return {
    /** Tablero "🔒Lista Blanca". */
    tableroListaBlanca: requerida('SEGURIDAD_LISTA_BLANCA_TABLERO_ID'),
    /** Tablero "🔐 Seguridad · Autenticador (no editar)". */
    tableroAutenticador: requerida('SEGURIDAD_AUTENTICADOR_TABLERO_ID'),
    /** Tablero "🔐 Registro de Accesos". */
    tableroRegistro: requerida('SEGURIDAD_REGISTRO_TABLERO_ID'),
    /**
     * Id con el que esta app figura en la columna "ID APP Habilitadas" de la Lista Blanca.
     *
     * Para Operaciones de Inventario es el id del tablero "OPS: Despechos", donde está instalada la
     * vista. monday no incluye el tablero en el token de sesión, así que no se puede leer del
     * pedido: lo declara el deploy, que es el único que sabe con certeza qué app es.
     */
    appId: requerida('SEGURIDAD_APP_ID'),
  }
}

/** 🔒Lista Blanca — columnas que lee la app. */
export const COL_LISTA_BLANCA = {
  nombreCompleto: 'text_mm77m57b',
  estado: 'status',
  usuarioId: 'text_mm72j4e6',
  email: 'email_mm72cz3e',
  appsIds: 'dropdown_mm72bgr3',
  /** Equipo al que pertenece: decide qué módulos de la app ve. */
  team: 'dropdown_mm72dj2g',
  tipoUsuario: 'color_mm728j0d',
  desactivarAutenticador: 'color_mm779m2m',
} as const

/**
 * Etiquetas de la Lista Blanca que deciden el acceso.
 *
 * ADMIN es el que habilita usar una clave de autenticador YA existente (la de 1Password) en vez
 * del QR que genera la app. Es la cuenta operativa que comparten varias personas: los usuarios
 * MIEMBRO e INVITADO configuran el suyo escaneando el QR.
 */
export const ETIQUETA = {
  ACTIVO: 'Activo',
  ADMIN: 'ADMIN',
  /** Tipo de los externos. Un despachante de aduana es siempre INVITADO. */
  INVITADO: 'INVITADO',
  /**
   * La ÚNICA etiqueta que apaga el autenticador. Cualquier otro valor —"NO Desactivar", vacío, o
   * una etiqueta que alguien agregue mañana— lo deja encendido: ante la duda, se pide el código.
   */
  AUTENTICADOR_DESACTIVADO: 'Desactivar',
} as const

/**
 * Equipos, como se escriben en la columna "Team" de la Lista Blanca.
 *
 * Son los nombres tal cual figuran en el dropdown. Si alguien renombra una etiqueta en monday,
 * acá hay que renombrarla también: es el precio de que el permiso se administre desde el tablero.
 */
export const TEAM = {
  ADMINISTRACION: 'Administracion',
  DESPACHANTES: 'Despachantes',
} as const

/**
 * Los mismos equipos, en monday.
 *
 * La fila de la Lista Blanca dice a qué equipo pertenece; estos ids sirven para COMPROBARLO contra
 * monday. Que las dos cosas tengan que coincidir es lo que evita que un solo tablero mal cargado
 * habilite a un externo.
 */
export const TEAM_MONDAY = {
  ADMINISTRACION: '1509236',
  DESPACHANTES: '1504184',
} as const

/** 🔐 Seguridad · Autenticador — una fila por perfil. */
export const COL_AUTENTICADOR = {
  perfilId: 'perfil_id',
  usuarioId: 'usuario_id',
  secreto: 'secreto',
  secretoPendiente: 'secreto_pendiente',
  recuperacion: 'recuperacion',
  ultimoPeriodo: 'ultimo_periodo',
  intentos: 'intentos',
  configurado: 'configurado',
} as const

/** 🔐 Registro de Accesos — una fila por evento. */
export const COL_REGISTRO = {
  fecha: 'fecha',
  evento: 'evento',
  email: 'email',
  ip: 'ip',
  usuarioId: 'usuario_id',
  perfil: 'perfil',
  cuentaId: 'cuenta_id',
  appId: 'app_id',
  detalle: 'detalle',
} as const

/** Etiquetas de la columna "Evento" del Registro de Accesos. */
export type Evento =
  | 'Ingreso OK'
  | 'Ingreso sin autenticador'
  | 'Acceso denegado'
  | 'Código incorrecto'
  | 'Bloqueado por intentos'
  | 'Autenticador configurado'
  | 'Código de recuperación usado'

/** Límite de intentos fallidos del código: 5 cada 15 minutos, por perfil. */
export const MAX_INTENTOS = 5
export const VENTANA_INTENTOS_MS = 15 * 60 * 1000

/** Cantidad de códigos de recuperación que se entregan al configurar el autenticador. */
export const CANTIDAD_CODIGOS_RECUPERACION = 10

/**
 * Zona horaria del "día" de la sesión. El autenticador se pide una vez por día CALENDARIO en
 * Argentina: quien entra a las 23:50 lo vuelve a necesitar a las 00:10. Es a propósito —así lo
 * pidió BERGER—, y es más fácil de explicar que una ventana móvil de 24 horas.
 */
export const ZONA_HORARIA = 'America/Argentina/Buenos_Aires'
