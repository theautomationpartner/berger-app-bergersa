/**
 * VENTA · las actividades: lo que se habló con un cliente, y lo que falta hablar.
 *
 * Una actividad es un contacto con el cliente —una llamada, un WhatsApp, una visita— con su fecha,
 * quién la hizo y con quién. Sirve para dos cosas distintas y por eso el estado importa: dejar
 * registrado lo que ya pasó, y anotar lo que hay que hacer.
 *
 * De ahí la regla del estado: **lo que ya ocurrió se guarda como hecho y lo que está en el futuro
 * como pendiente**. Nadie puede haber hecho mañana una llamada, y una actividad futura marcada
 * como completada envenena cualquier lista de "qué me queda por hacer".
 */
import { aFechaHoraMonday } from '@/lib/format'
import { COL_ACTIVIDAD, ESTADO_ACTIVIDAD } from './columns'
import { mondayApi } from './sdk'
import { obtenerDatosSesion } from './sesion'

/** Hoy, en Argentina. Se compara contra esto y no contra el reloj del navegador. */
export function hoyEnArgentina(ahora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora)
}

/**
 * El estado que le corresponde a una actividad por su fecha.
 *
 * Hoy cuenta como pasado: una actividad de hoy ya se hizo o se está haciendo, y obligar a
 * marcarla al final del día sería pedirle a alguien que vuelva a entrar a la app para eso.
 */
export const estadoSegunFecha = (fecha: string, hoy = hoyEnArgentina()): string =>
  !fecha || fecha <= hoy ? ESTADO_ACTIVIDAD.COMPLETADA : ESTADO_ACTIVIDAD.PENDIENTE

/** ¿Esta actividad es a futuro? Entonces no se puede dar por hecha. */
export const esFutura = (fecha: string, hoy = hoyEnArgentina()): boolean =>
  Boolean(fecha) && fecha > hoy

export interface AltaActividad {
  tipo: string
  /** `AAAA-MM-DD`. */
  fecha: string
  /** `HH:MM`. Vacío = sin hora. */
  hora: string
  estado: string
  descripcion: string
  cuentaId: string
  contactoIds: string[]
}

/** Qué falta para poder cargarla. Vacío = se puede. */
export function faltaParaLaActividad(d: AltaActividad): string[] {
  const faltan: string[] = []
  if (!d.cuentaId) faltan.push('el cliente')
  if (!d.tipo) faltan.push('el tipo de actividad')
  if (!d.fecha) faltan.push('la fecha')
  return faltan
}

/**
 * El nombre del item.
 *
 * monday no acepta items sin nombre, y dejar que cada uno lo escriba termina en "llamada",
 * "Llamada Juan" y "LLAMADO" para lo mismo. Se arma con el tipo y la fecha, que es lo que
 * identifica a una actividad en una lista.
 */
export const nombreDeActividad = (tipo: string, fecha: string): string =>
  [tipo || 'Actividad', fecha].filter(Boolean).join(' · ')

export async function crearActividad(d: AltaActividad): Promise<{ id: string; nombre: string }> {
  const valores: Record<string, unknown> = {
    [COL_ACTIVIDAD.cuenta]: { item_ids: [d.cuentaId] },
    [COL_ACTIVIDAD.estado]: { label: d.estado },
  }
  if (d.tipo) valores[COL_ACTIVIDAD.tipo] = { label: d.tipo }
  if (d.fecha) {
    valores[COL_ACTIVIDAD.fecha] = d.hora ? aFechaHoraMonday(d.fecha, d.hora) : { date: d.fecha }
  }
  if (d.descripcion.trim()) valores[COL_ACTIVIDAD.descripcion] = d.descripcion.trim()
  if (d.contactoIds.length > 0) valores[COL_ACTIVIDAD.contactos] = { item_ids: d.contactoIds }

  /* El responsable es quien está usando la app: sale del token de sesión de monday, no de un
     desplegable. Preguntarlo sería dejar que alguien cargue una actividad a nombre de otro, y el
     dato que importa es quién la hizo de verdad. */
  try {
    const { userId } = await obtenerDatosSesion()
    if (userId) {
      valores[COL_ACTIVIDAD.responsable] = {
        personsAndTeams: [{ id: userId, kind: 'person' }],
      }
    }
  } catch {
    /* Fuera de monday —en desarrollo— no hay sesión: la actividad se crea sin responsable en vez
       de no crearse. */
  }

  const r = await mondayApi<{ create_item: { id: string; name: string } }>('crearActividadCrm', {
    nombre: nombreDeActividad(d.tipo, d.fecha),
    valores: JSON.stringify(valores),
  })
  return { id: r.create_item.id, nombre: r.create_item.name }
}

/** Las etiquetas de los dos desplegables del tablero, leídas de monday. */
export async function etiquetasDeActividad(): Promise<{ tipos: string[]; estados: string[] }> {
  const r = await mondayApi<{ boards: { columns: { id: string; settings_str: string }[] }[] }>(
    'etiquetasDeActividad',
    { columnas: [COL_ACTIVIDAD.tipo, COL_ACTIVIDAD.estado] },
  )

  const etiquetas = (id: string): string[] => {
    const crudo = r.boards?.[0]?.columns?.find((c) => c.id === id)?.settings_str
    if (!crudo) return []
    try {
      const ajustes = JSON.parse(crudo) as {
        labels?: { id: number; name: string }[] | Record<string, string>
      }
      const l = ajustes.labels
      if (Array.isArray(l)) return l.map((x) => x.name).filter(Boolean)
      if (l && typeof l === 'object') return Object.values(l).filter(Boolean)
      return []
    } catch {
      return []
    }
  }

  return { tipos: etiquetas(COL_ACTIVIDAD.tipo), estados: etiquetas(COL_ACTIVIDAD.estado) }
}
