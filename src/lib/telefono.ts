/**
 * El número de WhatsApp, armado en tres partes.
 *
 * Un solo casillero de teléfono libre produce "11 4567-8900", "+54 9 11 4567 8900" y
 * "0111545678900" para el mismo número, y después nadie puede mandarle un mensaje a nadie sin
 * revisar a ojo. Partirlo en país + característica + número deja una sola forma posible de
 * escribirlo, y la app arma el internacional.
 *
 * El caso argentino tiene una trampa conocida: para WhatsApp el número lleva un **9** después del
 * 54, y la característica va **sin el 0** y el abonado **sin el 15**. Es el error más repetido
 * cargando contactos, así que el prefijo ya viene con el 9 y la ayuda lo dice al lado del campo.
 */

export interface Pais {
  /** Como lo guarda monday en la columna `country`: ISO 3166-1 alfa-2. */
  codigo: string
  nombre: string
  /** Prefijo internacional, ya listo para WhatsApp (Argentina incluye el 9). */
  prefijo: string
}

/**
 * Sudamérica y los países latinos con los que opera BERGER.
 *
 * No es la lista completa del mundo a propósito: un desplegable de doscientos países para elegir
 * entre seis es peor que uno corto. Si algún día hace falta otro, se suma acá.
 */
export const PAISES: Pais[] = [
  { codigo: 'AR', nombre: 'Argentina', prefijo: '549' },
  { codigo: 'BO', nombre: 'Bolivia', prefijo: '591' },
  { codigo: 'BR', nombre: 'Brasil', prefijo: '55' },
  { codigo: 'CL', nombre: 'Chile', prefijo: '56' },
  { codigo: 'CO', nombre: 'Colombia', prefijo: '57' },
  { codigo: 'CR', nombre: 'Costa Rica', prefijo: '506' },
  { codigo: 'EC', nombre: 'Ecuador', prefijo: '593' },
  { codigo: 'SV', nombre: 'El Salvador', prefijo: '503' },
  { codigo: 'GT', nombre: 'Guatemala', prefijo: '502' },
  { codigo: 'HN', nombre: 'Honduras', prefijo: '504' },
  { codigo: 'MX', nombre: 'México', prefijo: '52' },
  { codigo: 'NI', nombre: 'Nicaragua', prefijo: '505' },
  { codigo: 'PA', nombre: 'Panamá', prefijo: '507' },
  { codigo: 'PY', nombre: 'Paraguay', prefijo: '595' },
  { codigo: 'PE', nombre: 'Perú', prefijo: '51' },
  { codigo: 'DO', nombre: 'República Dominicana', prefijo: '1809' },
  { codigo: 'UY', nombre: 'Uruguay', prefijo: '598' },
  { codigo: 'VE', nombre: 'Venezuela', prefijo: '58' },
]

export const PAIS_POR_DEFECTO = 'AR'

export const paisPorCodigo = (codigo: string): Pais | undefined =>
  PAISES.find((p) => p.codigo === codigo)

export const prefijoDe = (codigo: string): string => paisPorCodigo(codigo)?.prefijo ?? ''

const digitos = (texto: string): string => texto.replace(/\D/g, '')

/**
 * Arma el número internacional. Vacío si falta la característica o el abonado.
 *
 * Al área se le saca el 0 de adelante y al abonado el 15, que es como la gente los tiene anotados
 * en la agenda y como NO van en un número internacional. Sacarlo acá en vez de rechazarlo es
 * deliberado: quien carga no tiene por qué saber la regla.
 */
export function armarWhatsapp(codigoPais: string, area: string, abonado: string): string {
  const prefijo = prefijoDe(codigoPais)
  const a = digitos(area).replace(/^0+/, '')
  const n = digitos(abonado).replace(/^15/, '')
  if (!prefijo || !a || !n) return ''
  return `+${prefijo}${a}${n}`
}

/**
 * Qué le falta al teléfono para estar bien. `null` si está bien o si está vacío.
 *
 * El teléfono es opcional —un contacto puede tener sólo mail— pero cargado a medias no sirve:
 * una característica sin número no le sirve a nadie y encima parece un dato cargado.
 */
export function problemaDelTelefono(
  codigoPais: string,
  area: string,
  abonado: string,
): string | null {
  const a = digitos(area)
  const n = digitos(abonado)
  if (!a && !n) return null
  if (!a) return 'Falta la característica del teléfono.'
  if (!n) return 'Falta el número de teléfono.'
  if (!codigoPais) return 'Falta el país del teléfono.'
  if (a.length + n.length < 8)
    return 'El teléfono es demasiado corto: revisá la característica y el número.'
  return null
}

/** Sólo los dígitos de un WhatsApp ya armado, para comparar dos números sin que importe el formato. */
export const normalizarWhatsapp = (texto: string): string => digitos(texto)
