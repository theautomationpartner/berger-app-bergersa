/**
 * VENTA · alta de cuentas y contactos en el CRM.
 *
 * Es el único lugar donde se dan de alta: en los tableros se puede cargar una fila a mano, pero
 * ahí nadie comprueba que el CUIT exista ni que el contacto no esté repetido. Acá sí, y por eso
 * esta pantalla existe en vez de mandar a la gente al tablero.
 *
 * **La regla de los duplicados**, que es la razón de ser de casi todo este archivo: un contacto se
 * identifica por su mail o por su WhatsApp. Dentro de UNA cuenta no puede haber dos contactos que
 * compartan alguno de los dos —sería la misma persona cargada dos veces—. Entre cuentas distintas
 * sí: el mismo señor puede ser el comprador de dos empresas, y son dos contactos legítimos con los
 * mismos datos de contacto.
 */
import { CRM, COL_CONTACTO, COL_CUENTA } from './columns'
import { normalizarWhatsapp } from '@/lib/telefono'
import { porId, texto, type ColumnaCruda } from './parse'
import { mondayApi } from './sdk'

const hoy = (): string => {
  const ahora = new Date()
  const en = (opcion: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', ...opcion })
  return en({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora)
}

/* ------------------------------------------------------------------ *
 * Lectura
 * ------------------------------------------------------------------ */

export interface CuentaCrm {
  id: string
  nombre: string
  cuit: string
  clasificacion: string
  categoria: string
  /** Ids de los contactos conectados. */
  contactoIds: string[]
}

export interface ContactoCrm {
  id: string
  nombre: string
  email: string
  whatsapp: string
  categoria: string
  estado: string
  /** Ids de las cuentas a las que está conectado. */
  cuentaIds: string[]
}

/** Las columnas de conexión traen los ids del otro lado vía `... on BoardRelationValue`. */
type ColumnaConRelacion = ColumnaCruda & { linked_item_ids?: string[] | null }

interface ItemCrudo {
  id: string
  name: string
  column_values: ColumnaConRelacion[]
}

const COLUMNAS_CUENTA = [
  COL_CUENTA.cuit,
  COL_CUENTA.clasificacion,
  COL_CUENTA.categoria,
  COL_CUENTA.contactos,
]

const COLUMNAS_CONTACTO = [
  COL_CONTACTO.email,
  COL_CONTACTO.whatsapp,
  COL_CONTACTO.categoria,
  COL_CONTACTO.estado,
  COL_CONTACTO.cuenta,
]

/** Ids conectados de una columna de conexión. */
const conectados = (c: ColumnaConRelacion | undefined): string[] =>
  (c?.linked_item_ids ?? []).map(String)

/** Todas las cuentas, para el buscador y para controlar que el CUIT no esté repetido. */
export async function cuentasDelCrm(): Promise<CuentaCrm[]> {
  const r = await mondayApi<{ boards: { items_page: { items: ItemCrudo[] } }[] }>('cuentasDelCrm', {
    columnas: COLUMNAS_CUENTA,
    limite: 500,
  })
  return (r.boards?.[0]?.items_page.items ?? [])
    .map((i) => {
      const c = porId(i.column_values)
      return {
        id: i.id,
        nombre: i.name.trim(),
        cuit: texto(c[COL_CUENTA.cuit]),
        clasificacion: texto(c[COL_CUENTA.clasificacion]),
        categoria: texto(c[COL_CUENTA.categoria]),
        contactoIds: conectados(c[COL_CUENTA.contactos]),
      }
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/** Todos los contactos. Se leen enteros porque la comprobación de duplicados los recorre. */
export async function contactosDelCrm(): Promise<ContactoCrm[]> {
  const r = await mondayApi<{ boards: { items_page: { items: ItemCrudo[] } }[] }>(
    'contactosDelCrm',
    { columnas: COLUMNAS_CONTACTO, limite: 500 },
  )
  return (r.boards?.[0]?.items_page.items ?? [])
    .map((i) => {
      const c = porId(i.column_values)
      return {
        id: i.id,
        nombre: i.name.trim(),
        email: texto(c[COL_CONTACTO.email]),
        whatsapp: texto(c[COL_CONTACTO.whatsapp]),
        categoria: texto(c[COL_CONTACTO.categoria]),
        estado: texto(c[COL_CONTACTO.estado]),
        cuentaIds: conectados(c[COL_CONTACTO.cuenta]),
      }
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

export interface Concesionario {
  id: string
  nombre: string
}

export async function concesionariosDelCrm(): Promise<Concesionario[]> {
  const r = await mondayApi<{
    boards: { items_page: { items: { id: string; name: string }[] } }[]
  }>('concesionariosDelCrm', { limite: 200 })
  return (r.boards?.[0]?.items_page.items ?? [])
    .map((i) => ({ id: i.id, nombre: i.name.trim() }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/**
 * Las etiquetas de los desplegables de los dos tableros.
 *
 * Se leen de monday y nunca se escriben desde el código: una etiqueta que no existe hace fallar la
 * escritura ENTERA del item, no sólo esa columna.
 */
export async function etiquetasDelCrm(): Promise<{
  tipoPersona: string[]
  clasificacion: string[]
  categoriaCuenta: string[]
  condicionFiscal: string[]
  categoriaContacto: string[]
}> {
  const r = await mondayApi<{
    boards: {
      id: string
      cuenta: { id: string; settings_str: string }[]
      contacto: { id: string; settings_str: string }[]
    }[]
  }>('etiquetasDelCrm', {
    columnasCuenta: [
      COL_CUENTA.tipoPersona,
      COL_CUENTA.clasificacion,
      COL_CUENTA.categoria,
      COL_CUENTA.condicionFiscal,
    ],
    columnasContacto: [COL_CONTACTO.categoria],
  })

  const etiquetas = (id: string): string[] => {
    /* Las dos listas de columnas se piden sobre los dos tableros, así que de cada tablero vuelven
       las que tiene y vacías las del otro. Se recorre todo y se queda con la que aparezca. */
    for (const b of r.boards ?? []) {
      const col = [...(b.cuenta ?? []), ...(b.contacto ?? [])].find((c) => c.id === id)
      if (!col?.settings_str) continue
      try {
        const ajustes = JSON.parse(col.settings_str) as {
          labels?: { id: number; name: string }[] | Record<string, string>
        }
        const l = ajustes.labels
        if (Array.isArray(l)) return l.map((x) => x.name).filter(Boolean)
        if (l && typeof l === 'object') return Object.values(l).filter(Boolean)
      } catch {
        /* una columna ilegible no tiene por qué dejar sin opciones a las otras cuatro */
      }
    }
    return []
  }

  return {
    tipoPersona: etiquetas(COL_CUENTA.tipoPersona),
    clasificacion: etiquetas(COL_CUENTA.clasificacion),
    categoriaCuenta: etiquetas(COL_CUENTA.categoria),
    condicionFiscal: etiquetas(COL_CUENTA.condicionFiscal),
    categoriaContacto: etiquetas(COL_CONTACTO.categoria),
  }
}

/* ------------------------------------------------------------------ *
 * Duplicados
 * ------------------------------------------------------------------ */

const mismoEmail = (a: string, b: string): boolean =>
  Boolean(a.trim()) && a.trim().toLowerCase() === b.trim().toLowerCase()

const mismoWhatsapp = (a: string, b: string): boolean => {
  const x = normalizarWhatsapp(a)
  const y = normalizarWhatsapp(b)
  return Boolean(x) && x === y
}

/**
 * ¿Ya hay en ESTA cuenta un contacto con este mail o este WhatsApp?
 *
 * Devuelve el contacto que choca y por qué dato, para poder decirlo con nombre y apellido: "Ya
 * está Ricardo Gutiérrez con ese mail" se entiende; "contacto duplicado" obliga a ir a buscarlo.
 */
export function contactoRepetido(
  contactos: ContactoCrm[],
  cuentaId: string,
  email: string,
  whatsapp: string,
): { contacto: ContactoCrm; por: 'el e-mail' | 'el WhatsApp' } | null {
  if (!cuentaId) return null
  for (const c of contactos) {
    if (!c.cuentaIds.includes(cuentaId)) continue
    if (mismoEmail(c.email, email)) return { contacto: c, por: 'el e-mail' }
    if (mismoWhatsapp(c.whatsapp, whatsapp)) return { contacto: c, por: 'el WhatsApp' }
  }
  return null
}

/** ¿Ya existe una cuenta con este CUIT? El CUIT es la llave: no puede haber dos. */
export function cuentaConElMismoCuit(cuentas: CuentaCrm[], cuit: string): CuentaCrm | null {
  const d = cuit.replace(/\D/g, '')
  if (!d) return null
  return cuentas.find((c) => c.cuit.replace(/\D/g, '') === d) ?? null
}

/* ------------------------------------------------------------------ *
 * Alta
 * ------------------------------------------------------------------ */

export interface AltaContacto {
  nombres: string
  apellidos: string
  categorias: string[]
  email: string
  /** Ya armado: `+5492494520152`. Vacío si no cargaron teléfono. */
  whatsapp: string
  /** Código ISO del país del teléfono, para la columna `country`. */
  paisCodigo: string
  paisNombre: string
  comentarios: string
  /** Cuenta a la que se conecta. Vacío = contacto suelto. */
  cuentaId: string
}

/** El nombre del item: "Nombre Apellido". Monday no acepta items sin nombre. */
export const nombreDeContacto = (nombres: string, apellidos: string): string =>
  [nombres.trim(), apellidos.trim()].filter(Boolean).join(' ')

export async function crearContacto(d: AltaContacto): Promise<{ id: string; nombre: string }> {
  const valores: Record<string, unknown> = {
    [COL_CONTACTO.nombres]: d.nombres.trim(),
    [COL_CONTACTO.apellidos]: d.apellidos.trim(),
    [COL_CONTACTO.estado]: { label: CRM.CONTACTO_ACTIVO },
    [COL_CONTACTO.fechaAlta]: { date: hoy() },
  }
  if (d.categorias.length > 0) valores[COL_CONTACTO.categoria] = { labels: d.categorias }
  if (d.email.trim()) valores[COL_CONTACTO.email] = { email: d.email.trim(), text: d.email.trim() }
  if (d.whatsapp) {
    /* La columna `phone` de monday guarda el número y el país por separado. El número va sin el
       "+": monday lo agrega al mostrarlo. */
    valores[COL_CONTACTO.whatsapp] = {
      phone: d.whatsapp.replace(/^\+/, ''),
      countryShortName: d.paisCodigo,
    }
  }
  if (d.paisCodigo) {
    valores[COL_CONTACTO.pais] = { countryCode: d.paisCodigo, countryName: d.paisNombre }
  }
  if (d.comentarios.trim()) valores[COL_CONTACTO.comentarios] = d.comentarios.trim()
  if (d.cuentaId) valores[COL_CONTACTO.cuenta] = { item_ids: [d.cuentaId] }

  const r = await mondayApi<{ create_item: { id: string; name: string } }>('crearContactoCrm', {
    nombre: nombreDeContacto(d.nombres, d.apellidos),
    valores: JSON.stringify(valores),
  })
  return { id: r.create_item.id, nombre: r.create_item.name }
}

export interface AltaCuenta {
  razonSocial: string
  cuit: string
  tipoPersona: string
  clasificacion: string
  categorias: string[]
  condicionFiscal: string
  direccion: string
  ciudad: string
  provincia: string
  paisCodigo: string
  paisNombre: string
  descripcion: string
  concesionarioIds: string[]
  /** Contactos que ya existen y se conectan a la cuenta nueva. */
  contactoIds: string[]
}

export async function crearCuenta(d: AltaCuenta): Promise<{ id: string; nombre: string }> {
  const valores: Record<string, unknown> = {
    [COL_CUENTA.cuit]: d.cuit.trim(),
    [COL_CUENTA.estado]: { label: CRM.CUENTA_ACTIVA },
    [COL_CUENTA.fechaAlta]: { date: hoy() },
  }
  if (d.tipoPersona) valores[COL_CUENTA.tipoPersona] = { label: d.tipoPersona }
  if (d.clasificacion) valores[COL_CUENTA.clasificacion] = { label: d.clasificacion }
  if (d.categorias.length > 0) valores[COL_CUENTA.categoria] = { labels: d.categorias }
  if (d.condicionFiscal) valores[COL_CUENTA.condicionFiscal] = { label: d.condicionFiscal }

  /* La dirección va en texto y no en la columna de ubicación: la de ubicación necesita latitud y
     longitud, y lo que devuelve ARCA es una dirección escrita. Cargarla ahí con coordenadas
     inventadas pondría a todos los clientes en el mismo punto del mapa. */
  if (d.direccion.trim()) valores[COL_CUENTA.direccionTexto] = d.direccion.trim()
  if (d.ciudad.trim()) valores[COL_CUENTA.ciudad] = d.ciudad.trim()
  if (d.provincia.trim()) valores[COL_CUENTA.provincia] = d.provincia.trim()
  if (d.paisCodigo) {
    valores[COL_CUENTA.pais] = { countryCode: d.paisCodigo, countryName: d.paisNombre }
  }
  if (d.descripcion.trim()) valores[COL_CUENTA.descripcion] = d.descripcion.trim()
  if (d.concesionarioIds.length > 0) {
    valores[COL_CUENTA.concesionario] = { item_ids: d.concesionarioIds }
  }
  if (d.contactoIds.length > 0) valores[COL_CUENTA.contactos] = { item_ids: d.contactoIds }

  const r = await mondayApi<{ create_item: { id: string; name: string } }>('crearCuentaCrm', {
    nombre: d.razonSocial.trim(),
    valores: JSON.stringify(valores),
  })
  return { id: r.create_item.id, nombre: r.create_item.name }
}

/* ------------------------------------------------------------------ *
 * Validaciones del formulario
 * ------------------------------------------------------------------ */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Qué falta para dar de alta un contacto. Vacío = se puede. */
export function faltaParaElContacto(d: AltaContacto): string[] {
  const faltan: string[] = []
  if (!d.nombres.trim()) faltan.push('el nombre')
  if (!d.apellidos.trim()) faltan.push('el apellido')
  if (d.email.trim() && !EMAIL.test(d.email.trim())) faltan.push('un e-mail válido')
  /* Sin mail y sin WhatsApp el contacto no sirve para nada: es una fila con un nombre. Y son
     justamente los dos datos con los que se detectan los duplicados. */
  if (!d.email.trim() && !d.whatsapp) faltan.push('el e-mail o el WhatsApp')
  return faltan
}

/** Qué falta para dar de alta una cuenta. Vacío = se puede. */
export function faltaParaLaCuenta(d: AltaCuenta): string[] {
  const faltan: string[] = []
  if (!d.razonSocial.trim()) faltan.push('la razón social')
  if (!d.cuit.trim()) faltan.push('el CUIT')
  if (!d.condicionFiscal) faltan.push('la condición fiscal')
  return faltan
}
