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
import {
  COL_LISTA_BLANCA,
  TABLERO_DE_ETIQUETA,
  TEAM_DE_ETIQUETA,
  TEAM_LISTA,
  USUARIO,
} from './columns'
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
  /** Las apps habilitadas, por el nombre de su etiqueta en 🤚App Habilitadas. */
  apps: string[]
  team: string
  /** Sólo para el team Despachantes. */
  tableros: string[]
}

const COLUMNAS = [
  COL_LISTA_BLANCA.nombreCompleto,
  COL_LISTA_BLANCA.apps,
  COL_LISTA_BLANCA.estado,
  COL_LISTA_BLANCA.email,
  COL_LISTA_BLANCA.telefono,
  COL_LISTA_BLANCA.team,
  COL_LISTA_BLANCA.tipoUsuario,
  COL_LISTA_BLANCA.tablerosDespachante,
  COL_LISTA_BLANCA.usuarioId,
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
export async function crearUsuario(
  d: AltaUsuario,
  /** Qué id le corresponde a cada etiqueta de app. Lo lee la pantalla del propio tablero. */
  idsPorApp: Record<string, string> = {},
): Promise<{ id: string; nombre: string }> {
  const faltan = faltaParaElAlta(d)
  if (faltan.length > 0) throw new Error(`Falta ${faltan.join(', ')}.`)

  const idsDeApps = d.apps.map((a) => idsPorApp[a]).filter(Boolean)
  const idDelTeam = TEAM_DE_ETIQUETA[d.team] ?? ''
  const idsDeTableros =
    d.team === TEAM_LISTA.DESPACHANTES
      ? d.tableros.map((t) => TABLERO_DE_ETIQUETA[t]).filter(Boolean)
      : []

  const valores: Record<string, unknown> = {
    [COL_LISTA_BLANCA.nombreCompleto]: d.nombreCompleto.trim(),
    [COL_LISTA_BLANCA.estado]: { label: USUARIO.ACTIVO },
    [COL_LISTA_BLANCA.email]: { email: d.email.trim(), text: d.email.trim() },
    [COL_LISTA_BLANCA.apps]: { labels: d.apps },
    [COL_LISTA_BLANCA.team]: { labels: [d.team] },
    [COL_LISTA_BLANCA.tipoUsuario]: { label: USUARIO.INVITADO },
  }
  /* Los ids: la app elige por NOMBRE —"APP Berger SA", "Despachantes"— y guarda al lado el id que
     le corresponde, que es con lo que después se compara el acceso. Antes esto lo completaba una
     automatización; hacerlo acá evita el momento en que la fila existe y todavía no deja entrar. */
  if (idsDeApps.length > 0) valores[COL_LISTA_BLANCA.appsIds] = { labels: idsDeApps }
  if (idDelTeam) valores[COL_LISTA_BLANCA.idTeam] = idDelTeam
  if (idsDeTableros.length > 0) valores[COL_LISTA_BLANCA.idTableros] = idsDeTableros.join(', ')

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
        apps: texto(c[COL_LISTA_BLANCA.apps]),
        team: texto(c[COL_LISTA_BLANCA.team]),
        tipoUsuario: texto(c[COL_LISTA_BLANCA.tipoUsuario]),
        tableros: texto(c[COL_LISTA_BLANCA.tablerosDespachante]),
        usuarioId: texto(c[COL_LISTA_BLANCA.usuarioId]),
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
  /** Qué id le corresponde a cada app, para guardarlo al lado del nombre. */
  idsPorApp: Record<string, string>
}> {
  const r = await mondayApi<{ boards: { columns: { id: string; settings_str: string }[] }[] }>(
    'etiquetasDeListaBlanca',
    {
      columnas: [
        COL_LISTA_BLANCA.apps,
        COL_LISTA_BLANCA.appsIds,
        COL_LISTA_BLANCA.team,
        COL_LISTA_BLANCA.tablerosDespachante,
      ],
    },
  )

  const labelsDe = (id: string): { id: number; name: string }[] => {
    const crudo = r.boards?.[0]?.columns?.find((c) => c.id === id)?.settings_str
    if (!crudo) return []
    try {
      const ajustes = JSON.parse(crudo) as { labels?: { id: number; name: string }[] }
      return (ajustes.labels ?? []).filter((l) => l?.name)
    } catch {
      return []
    }
  }
  const etiquetasDe = (id: string): string[] => labelsDe(id).map((l) => l.name)

  /* El nombre de la app y su id son dos columnas distintas, y lo que las une es el número de
     etiqueta: la etiqueta 1 de "App Habilitadas" y la 1 de "ID APP Habilitadas" son la misma app.
     Es la convención del tablero, y al agregar una app nueva hay que respetarla. */
  const ids = new Map(labelsDe(COL_LISTA_BLANCA.appsIds).map((l) => [l.id, l.name]))
  const idsPorApp: Record<string, string> = {}
  for (const l of labelsDe(COL_LISTA_BLANCA.apps)) {
    const id = ids.get(l.id)
    if (id) idsPorApp[l.name] = id
  }

  return {
    apps: etiquetasDe(COL_LISTA_BLANCA.apps),
    /* El "Concesionario" existe en el tablero pero no se ofrece: todavía no está definido qué ve
       un concesionario dentro de la app. */
    teams: etiquetasDe(COL_LISTA_BLANCA.team).filter((t) => t in TEAM_DE_ETIQUETA),
    tableros: etiquetasDe(COL_LISTA_BLANCA.tablerosDespachante),
    idsPorApp,
  }
}

/* ------------------------------------------------------------------ *
 * La cuenta de monday
 * ------------------------------------------------------------------ */

const motivo = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** ¿Ya está suscripto a ese tablero? */
async function estaSuscripto(tablero: string, usuarioId: string): Promise<boolean> {
  try {
    const r = await mondayApi<{ boards: { subscribers: { id: string }[] }[] }>(
      'suscriptosDelTablero',
      { tablero },
    )
    return (r.boards?.[0]?.subscribers ?? []).some((u) => String(u.id) === usuarioId)
  } catch {
    return false
  }
}

export interface ResultadoDeAlta {
  /** Id del item en la Lista Blanca. */
  filaId: string
  nombre: string
  /** Id del usuario en monday, si se pudo averiguar. */
  usuarioId: string
  /**
   * Lo que no salió.
   *
   * Nunca aborta: para cuando algo falla, la fila ya está creada y puede que la invitación ya haya
   * salido. Deshacer eso sería peor que decir qué quedó pendiente, porque lo que se deshace no se
   * puede volver a mandar sin molestar a la persona dos veces.
   */
  advertencias: string[]
}

/**
 * El alta completa: la fila, la invitación a monday, el equipo y los tableros.
 *
 * Antes esto lo hacía un escenario de Make que miraba el tablero y reaccionaba. Hacerlo acá tiene
 * una ventaja concreta: el alta termina sabiendo qué salió y qué no, y lo dice. Con Make, la fila
 * quedaba creada y si la invitación fallaba nadie se enteraba hasta que la persona avisaba que no
 * podía entrar.
 *
 * El orden importa. Primero la fila —es el registro y lo que decide el acceso a la app—, después
 * la invitación, y recién con el id del usuario el equipo y los tableros.
 */
export async function altaCompleta(
  d: AltaUsuario,
  idsPorApp: Record<string, string> = {},
): Promise<ResultadoDeAlta> {
  const advertencias: string[] = []

  const fila = await crearUsuario(d, idsPorApp)
  const email = d.email.trim()

  /* La invitación puede "fallar" porque la persona YA está en la cuenta, que no es un error: es el
     caso de alguien que ya trabaja con BERGER en otra app. Por eso el id se pregunta aparte. */
  try {
    await mondayApi('invitarUsuarioAMonday', { email })
  } catch (e) {
    advertencias.push(`No se pudo mandar la invitación a ${email}: ${motivo(e)}`)
  }

  let usuarioId = ''
  try {
    const r = await mondayApi<{ users: { id: string }[] | null }>('usuarioPorEmail', { email })
    usuarioId = r.users?.[0]?.id ?? ''
  } catch (e) {
    advertencias.push(`No se pudo leer el usuario de ${email} en monday: ${motivo(e)}`)
  }

  if (!usuarioId) {
    advertencias.push(
      `${email} todavía no figura como usuario de la cuenta, así que no se lo pudo sumar al ` +
        'equipo ni a los tableros. Revisá que la invitación haya salido.',
    )
    return { filaId: fila.id, nombre: fila.nombre, usuarioId, advertencias }
  }

  /* El id del usuario se guarda en la fila: es con lo que el circuito de seguridad lo reconoce al
     entrar, y con lo que se lo da de baja después. */
  try {
    await mondayApi('estadoUsuarioListaBlanca', {
      item: fila.id,
      valores: JSON.stringify({ [COL_LISTA_BLANCA.usuarioId]: usuarioId }),
    })
  } catch (e) {
    advertencias.push(`No se pudo guardar el ID de usuario en la fila: ${motivo(e)}`)
  }

  const idTeam = TEAM_DE_ETIQUETA[d.team]
  if (idTeam) {
    try {
      await mondayApi('sumarUsuarioATeam', { team: idTeam, usuario: usuarioId })
    } catch (e) {
      advertencias.push(`No se lo pudo sumar al equipo ${d.team}: ${motivo(e)}`)
    }
  }

  if (d.team === TEAM_LISTA.DESPACHANTES) {
    for (const etiqueta of d.tableros) {
      const tablero = TABLERO_DE_ETIQUETA[etiqueta]
      if (!tablero) {
        advertencias.push(`No sé qué tablero es "${etiqueta}", así que no se lo pudo suscribir.`)
        continue
      }
      try {
        await mondayApi('sumarUsuarioATablero', { tablero, usuario: usuarioId })
      } catch (e) {
        /* monday contesta 403 cuando la persona YA está suscripta, que es indistinguible de un
           problema de permisos. Se mira la lista: si ya estaba, no hay nada que avisar. */
        if (!(await estaSuscripto(tablero, usuarioId))) {
          advertencias.push(`No se lo pudo suscribir a ${etiqueta}: ${motivo(e)}`)
        }
      }
    }
  }

  return { filaId: fila.id, nombre: fila.nombre, usuarioId, advertencias }
}

/**
 * La baja completa: la fila pasa a Inactivo y el usuario se desactiva en monday.
 *
 * Las dos cosas, porque sin la segunda la persona sigue siendo usuario de la cuenta: pierde la app
 * pero conserva los tableros a los que esté suscripta, que es justo lo que una baja tiene que
 * cortar.
 */
export async function bajaCompleta(
  filaId: string,
  usuarioId: string,
): Promise<{ advertencias: string[] }> {
  const advertencias: string[] = []

  await desactivarUsuario(filaId)

  if (!usuarioId) {
    advertencias.push(
      'La fila quedó Inactiva, pero no tiene cargado el ID de usuario de monday, así que no se lo ' +
        'pudo desactivar en la cuenta. Hacelo desde monday.',
    )
    return { advertencias }
  }

  try {
    await mondayApi('desactivarUsuarioDeMonday', { usuario: usuarioId })
  } catch (e) {
    advertencias.push(
      `La fila quedó Inactiva, pero no se lo pudo desactivar en monday: ${motivo(e)}`,
    )
  }

  return { advertencias }
}
