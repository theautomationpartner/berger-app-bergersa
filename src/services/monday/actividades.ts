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
import { porId, texto, type ColumnaCruda } from './parse'
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
  /** Nombre de la cuenta. Va adelante del nombre del item; no se escribe en ninguna columna. */
  cuentaNombre: string
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

/** `2026-10-06` → `06/10/2026`. Es como se lee una fecha acá, y el nombre es para leer. */
export function aFechaCorta(iso: string): string {
  const [a, m, d] = iso.split('-')
  return a && m && d ? `${d}/${m}/${a}` : iso
}

/**
 * El nombre del item: **cuenta - tipo - fecha**, con la hora si la tiene.
 *
 * monday no acepta items sin nombre, y dejar que cada uno lo escriba termina en "llamada",
 * "Llamada Juan" y "LLAMADO" para lo mismo. Con la cuenta adelante, la lista del tablero se puede
 * ordenar por nombre y queda agrupada por cliente, que es como se la mira.
 */
export const nombreDeActividad = (cuenta: string, tipo: string, fecha: string, hora = ''): string =>
  [cuenta.trim(), tipo || 'Actividad', [aFechaCorta(fecha), hora].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(' - ')

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
    nombre: nombreDeActividad(d.cuentaNombre, d.tipo, d.fecha, d.hora),
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

/* ------------------------------------------------------------------ *
 * Lo que cada uno tiene pendiente
 * ------------------------------------------------------------------ */

/** Los estados que la app considera "todavía hay que hacerlo". */
export const PENDIENTES = ['Pendiente', 'Vencida', 'Abierto'] as const

export interface ActividadPendiente {
  id: string
  nombre: string
  tipo: string
  /** `AAAA-MM-DD`, o `''` si no tiene fecha cargada. */
  fecha: string
  hora: string
  estado: string
  descripcion: string
  cuenta: string
  contactos: string
  /** La fecha ya pasó: es lo que separa "lo que viene" de "lo que quedó colgado". */
  atrasada: boolean
}

type ColumnaDeActividad = ColumnaCruda & {
  linked_item_ids?: string[] | null
  display_value?: string | null
}

/** Los ids de persona de una columna `people`. */
function personasDe(c: ColumnaDeActividad | undefined): string[] {
  try {
    const v = JSON.parse(c?.value ?? '') as {
      personsAndTeams?: { id: number | string; kind?: string }[]
    }
    return (v.personsAndTeams ?? [])
      .filter((p) => !p.kind || p.kind === 'person')
      .map((p) => String(p.id))
  } catch {
    return []
  }
}

/**
 * Las actividades que le quedan por hacer a quien está usando la app.
 *
 * Filtra por el responsable y no por "todas las pendientes" a propósito: el tablero es de todo el
 * equipo, y una lista con las de los demás convierte "lo que me queda" en algo que hay que leer
 * entero para encontrar lo propio. Además, dar por hecha la actividad de otro no es algo que esta
 * pantalla tenga por qué permitir.
 *
 * Si no hay sesión de monday —en desarrollo, fuera del iframe— devuelve la lista vacía en vez de
 * fallar: no hay a quién filtrar.
 */
export async function misActividadesPendientes(): Promise<ActividadPendiente[]> {
  let usuarioId = ''
  try {
    usuarioId = String((await obtenerDatosSesion()).userId ?? '')
  } catch {
    return []
  }
  if (!usuarioId) return []

  const r = await mondayApi<{
    boards: {
      items_page: { items: { id: string; name: string; column_values: ColumnaDeActividad[] }[] }
    }[]
  }>('actividadesDelTablero', {
    columnas: [
      COL_ACTIVIDAD.tipo,
      COL_ACTIVIDAD.fecha,
      COL_ACTIVIDAD.estado,
      COL_ACTIVIDAD.descripcion,
      COL_ACTIVIDAD.responsable,
      COL_ACTIVIDAD.cuenta,
      COL_ACTIVIDAD.contactos,
    ],
    limite: 500,
  })

  const hoy = hoyEnArgentina()

  return (
    (r.boards?.[0]?.items_page.items ?? [])
      .map((i) => {
        const c = porId(i.column_values) as Record<string, ColumnaDeActividad>
        const crudo = texto(c[COL_ACTIVIDAD.fecha])
        return {
          item: i,
          responsables: personasDe(c[COL_ACTIVIDAD.responsable]),
          datos: {
            id: i.id,
            nombre: i.name.trim(),
            tipo: texto(c[COL_ACTIVIDAD.tipo]),
            /* Una columna de fecha CON hora devuelve "2026-10-06 16:45". */
            fecha: crudo.slice(0, 10),
            hora: crudo.length > 10 ? crudo.slice(11, 16) : '',
            estado: texto(c[COL_ACTIVIDAD.estado]),
            descripcion: texto(c[COL_ACTIVIDAD.descripcion]),
            cuenta: c[COL_ACTIVIDAD.cuenta]?.display_value ?? '',
            contactos: c[COL_ACTIVIDAD.contactos]?.display_value ?? '',
            atrasada: Boolean(crudo) && crudo.slice(0, 10) < hoy,
          },
        }
      })
      .filter((x) => x.responsables.includes(usuarioId))
      .filter((x) => (PENDIENTES as readonly string[]).includes(x.datos.estado))
      .map((x) => x.datos)
      /* Lo más viejo primero: lo que está atrasado es lo que hay que resolver antes. */
      .sort((a, b) => (a.fecha || '9999').localeCompare(b.fecha || '9999'))
  )
}

/** La da por hecha. Es lo ÚNICO que esta pantalla le cambia a una actividad que ya existe. */
export async function completarActividad(id: string): Promise<void> {
  await mondayApi('completarActividadCrm', {
    item: id,
    valores: JSON.stringify({
      [COL_ACTIVIDAD.estado]: { label: ESTADO_ACTIVIDAD.COMPLETADA },
    }),
  })
}
