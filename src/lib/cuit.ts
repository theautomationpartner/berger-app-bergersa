/**
 * CUIT / CUIL: formato y dígito verificador.
 *
 * Se valida acá, antes de mandar nada, por dos motivos. El primero es que monday guarda cualquier
 * cosa en una columna de texto: un CUIT mal tipeado queda cargado y aparece meses después, cuando
 * alguien factura. El segundo es que el CUIT es la llave con la que se busca duplicados — si está
 * mal escrito, la misma empresa entra dos veces.
 *
 * El dígito verificador no es un capricho: detecta el 90% de los errores de tipeo (un dígito
 * cambiado, dos dígitos dados vuelta) sin preguntarle nada a nadie.
 */

/** Sólo los números: "20-12345678-6", "20 12345678 6" y "20123456786" son el mismo CUIT. */
export const soloDigitos = (texto: string): string => texto.replace(/\D/g, '')

/** "20123456786" → "20-12345678-6". Con menos de 11 dígitos devuelve lo que haya. */
export function formatearCuit(texto: string): string {
  const d = soloDigitos(texto)
  if (d.length !== 11) return texto.trim()
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`
}

/**
 * Los prefijos válidos de un CUIT.
 *
 * 20/23/24/27 son personas físicas (el 23 y el 24 aparecen cuando el DNI colisiona), 30/33/34 son
 * personas jurídicas. El 50 al 55 existen pero no se usan en este circuito.
 */
const PREFIJOS = ['20', '23', '24', '27', '30', '33', '34']

/** Pesos del dígito verificador, en orden. Es el algoritmo de ARCA, no una invención. */
const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]

/**
 * Qué tiene de malo este CUIT. `null` si está bien.
 *
 * Devuelve el motivo y no un booleano porque "CUIT inválido" no le dice a nadie qué corregir:
 * faltan dígitos, sobran, o está bien escrito pero el número no existe.
 */
export function problemaDelCuit(texto: string): string | null {
  const d = soloDigitos(texto)
  if (d.length === 0) return 'Falta el CUIT.'
  if (d.length < 11) return `El CUIT tiene ${d.length} dígitos y necesita 11.`
  if (d.length > 11) return `El CUIT tiene ${d.length} dígitos y son 11.`
  if (!PREFIJOS.includes(d.slice(0, 2))) {
    return `Un CUIT no empieza con ${d.slice(0, 2)}: empieza con 20, 23, 24 o 27 si es una persona, y con 30, 33 o 34 si es una empresa.`
  }

  const suma = PESOS.reduce((acc, peso, i) => acc + peso * Number(d[i]), 0)
  const resto = suma % 11
  const esperado = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto
  if (esperado !== Number(d[10])) {
    return 'El CUIT no es válido: revisá que no haya un dígito cambiado.'
  }
  return null
}

export const cuitValido = (texto: string): boolean => problemaDelCuit(texto) === null

/**
 * ¿Es de una persona física o de una empresa?
 *
 * Lo dice el prefijo, así que la app puede completar el Tipo de Persona sola en vez de preguntarlo.
 * Un dato menos que cargar es un dato menos que cargar mal.
 */
export function tipoDePersonaSegunCuit(
  texto: string,
): 'Persona Física' | 'Persona Jurídica' | null {
  const d = soloDigitos(texto)
  if (d.length !== 11) return null
  if (['20', '23', '24', '27'].includes(d.slice(0, 2))) return 'Persona Física'
  if (['30', '33', '34'].includes(d.slice(0, 2))) return 'Persona Jurídica'
  return null
}
