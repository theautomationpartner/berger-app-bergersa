import type { MesAnio } from '@/types'

const NOMBRES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/** Cuántos meses hacia atrás y hacia adelante del mes actual ofrece el filtro. */
export const MESES_ALREDEDOR = 12

/** Clave estable de un mes (`2026-09`). Es lo que se guarda en el filtro y lo que se compara. */
export const claveMes = ({ anio, mes }: MesAnio): string =>
  `${anio}-${String(mes).padStart(2, '0')}`

/** Rótulo de la etiqueta del filtro: "septiembre 2026". */
export const rotuloMes = ({ anio, mes }: MesAnio): string => `${NOMBRES[mes - 1] ?? ''} ${anio}`

/** El mes en curso, según el reloj del dispositivo. */
export function mesActual(): MesAnio {
  const hoy = new Date()
  return { anio: hoy.getFullYear(), mes: hoy.getMonth() + 1 }
}

/**
 * Los meses que ofrece el filtro: doce para atrás y doce para adelante del actual, en orden.
 *
 * Son 25 opciones y no 24: el mes actual cuenta aparte, así que hay un año completo a cada lado.
 * Se arman con `new Date(año, mes + delta, 1)` en vez de sumar a mano porque así el cambio de año
 * —de diciembre a enero— lo resuelve el calendario y no una cuenta que se puede equivocar.
 */
export function mesesDelFiltro(referencia: MesAnio = mesActual()): MesAnio[] {
  const meses: MesAnio[] = []
  for (let delta = -MESES_ALREDEDOR; delta <= MESES_ALREDEDOR; delta += 1) {
    const d = new Date(referencia.anio, referencia.mes - 1 + delta, 1)
    meses.push({ anio: d.getFullYear(), mes: d.getMonth() + 1 })
  }
  return meses
}
