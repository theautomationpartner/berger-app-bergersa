/**
 * Alta y baja de gente en la 🔒Lista Blanca.
 *
 * Es el tablero que decide quién entra a la app, así que todo lo de acá es deliberadamente
 * angosto: se **crea** una fila con los datos del formulario, y de una fila que ya existe lo único
 * que se puede cambiar es el **estado**. Todo lo demás —equipo, tipo de usuario, apps— se corrige
 * en monday, donde queda registro de quién lo hizo.
 *
 * Lo que pasa después no es asunto de la app: al crearse el item, una automatización manda la
 * invitación y, si es despachante, lo suma al equipo y a los tableros. Al pasar a `Inactivo`, otra
 * lo desactiva en monday. La app deja el dato; el circuito lo mueve Make.
 */
import { COL_LISTA_BLANCA, TEAM_LISTA, USUARIO } from './columns'
import { porId, texto, type ColumnaCruda } from './parse'
import { mondayApi } from './sdk'
import type { UsuarioListaBlanca } from '@/types'

/** Los datos del formulario de alta. */
export interface AltaUsuario {
  /** Alias. Si viene vacío se usa el nombre completo: monday no acepta items sin nombre. */
  alias: string
  nombreCompleto: string
  email: string
  telefono: string
  /** Ids de tablero de las apps habilitadas, tal como figuran en el dropdown. */
  apps: string[]
  team: string
  /** Sólo para el team Despachantes. */
  tableros: string[]
}

const COLUMNAS = [
  COL_LISTA_BLANCA.nombreCompleto,
  COL_LISTA_BLANCA.estado,
  COL_LISTA_BLANCA.email,
  COL_LISTA_BLANCA.telefono,
  COL_LISTA_BLANCA.appsIds,
  COL_LISTA_BLANCA.team,
  COL_LISTA_BLANCA.tipoUsuario,
  COL_LISTA_BLANCA.tablerosDespachante,
]

/** Qué falta para poder dar de alta. Vacío = se puede. */
export function faltaParaElAlta(d: AltaUsuario): string[] {
  const faltan: string[] = []
  if (!d.nombreCompleto.trim()) faltan.push('el nombre completo')
  if (!d.email.trim()) faltan.push('el email')
  /* Un email mal escrito no se rechaza en monday: queda guardado igual y la invitación no llega
     nunca, sin que nadie se entere. Por eso se mira acá. */
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) faltan.push('un email válido')
  if (d.apps.length === 0) faltan.push('al menos una app habilitada')
  if (!d.team.trim()) faltan.push('el equipo')
  if (d.team === TEAM_LISTA.DESPACHANTES && d.tableros.length === 0) {
    faltan.push('los tableros a los que accede el despachante')
  }
  return faltan
}

/**
 * Crea la fila.
 *
 * El estado y el tipo de usuario NO salen del formulario: se crea siempre **Activo** e
 * **INVITADO**. Dejarlos elegir sería ofrecer la posibilidad de dar de alta a alguien inactivo
 * —que no sirve para nada— o como MIEMBRO, que es una decisión de la cuenta de monday y no de
 * esta pantalla.
 */
export async function crearUsuario(d: AltaUsuario): Promise<{ id: string; nombre: string }> {
  const faltan = faltaParaElAlta(d)
  if (faltan.length > 0) throw new Error(`Falta ${faltan.join(', ')}.`)

  const valores: Record<string, unknown> = {
    [COL_LISTA_BLANCA.nombreCompleto]: d.nombreCompleto.trim(),
    [COL_LISTA_BLANCA.estado]: { label: USUARIO.ACTIVO },
    [COL_LISTA_BLANCA.email]: { email: d.email.trim(), text: d.email.trim() },
    [COL_LISTA_BLANCA.appsIds]: { labels: d.apps },
    [COL_LISTA_BLANCA.team]: { labels: [d.team] },
    [COL_LISTA_BLANCA.tipoUsuario]: { label: USUARIO.INVITADO },
  }
  if (d.telefono.trim()) {
    valores[COL_LISTA_BLANCA.telefono] = { phone: d.telefono.trim(), countryShortName: 'AR' }
  }
  /* Los tableros son del despachante. A alguien de Administración no se le cargan: no le hacen
     falta y dejaría la fila diciendo algo que no es. */
  if (d.team === TEAM_LISTA.DESPACHANTES && d.tableros.length > 0) {
    valores[COL_LISTA_BLANCA.tablerosDespachante] = { labels: d.tableros }
  }

  const r = await mondayApi<{ create_item: { id: string; name: string } }>(
    'crearUsuarioListaBlanca',
    { nombre: d.alias.trim() || d.nombreCompleto.trim(), valores: JSON.stringify(valores) },
  )
  return { id: r.create_item.id, nombre: r.create_item.name }
}

/** Todas las filas de la Lista Blanca, ya normalizadas. */
export async function usuariosDeListaBlanca(): Promise<UsuarioListaBlanca[]> {
  const r = await mondayApi<{
    boards: {
      items_page: { items: { id: string; name: string; column_values: ColumnaCruda[] }[] }
    }[]
  }>('usuariosDeListaBlanca', { columnas: COLUMNAS, limite: 500 })

  return (r.boards?.[0]?.items_page.items ?? [])
    .map((i) => {
      const c = porId(i.column_values)
      return {
        id: i.id,
        alias: i.name,
        nombreCompleto: texto(c[COL_LISTA_BLANCA.nombreCompleto]),
        estado: texto(c[COL_LISTA_BLANCA.estado]),
        email: texto(c[COL_LISTA_BLANCA.email]),
        telefono: texto(c[COL_LISTA_BLANCA.telefono]),
        team: texto(c[COL_LISTA_BLANCA.team]),
        tipoUsuario: texto(c[COL_LISTA_BLANCA.tipoUsuario]),
        tableros: texto(c[COL_LISTA_BLANCA.tablerosDespachante]),
      }
    })
    .sort((a, b) => a.alias.localeCompare(b.alias, 'es'))
}

/** Pasa a Inactivo. Es lo único que la app le puede cambiar a alguien ya creado. */
export async function desactivarUsuario(id: string): Promise<void> {
  await mondayApi('estadoUsuarioListaBlanca', {
    item: id,
    valores: JSON.stringify({ [COL_LISTA_BLANCA.estado]: { label: USUARIO.INACTIVO } }),
  })
}

/**
 * Las etiquetas de los tres desplegables del tablero.
 *
 * Se leen de monday y no se escriben acá: las apps y los tableros del despachante van a cambiar, y
 * una etiqueta que no existe hace fallar la escritura entera del item.
 */
export async function etiquetasDeListaBlanca(): Promise<{
  apps: string[]
  teams: string[]
  tableros: string[]
}> {
  const r = await mondayApi<{ boards: { columns: { id: string; settings_str: string }[] }[] }>(
    'etiquetasDeListaBlanca',
    {
      columnas: [
        COL_LISTA_BLANCA.appsIds,
        COL_LISTA_BLANCA.team,
        COL_LISTA_BLANCA.tablerosDespachante,
      ],
    },
  )

  const etiquetasDe = (id: string): string[] => {
    const crudo = r.boards?.[0]?.columns?.find((c) => c.id === id)?.settings_str
    if (!crudo) return []
    try {
      const ajustes = JSON.parse(crudo) as { labels?: { id: number; name: string }[] }
      return (ajustes.labels ?? []).map((l) => l.name).filter(Boolean)
    } catch {
      return []
    }
  }

  return {
    apps: etiquetasDe(COL_LISTA_BLANCA.appsIds),
    teams: etiquetasDe(COL_LISTA_BLANCA.team),
    tableros: etiquetasDe(COL_LISTA_BLANCA.tablerosDespachante),
  }
}
