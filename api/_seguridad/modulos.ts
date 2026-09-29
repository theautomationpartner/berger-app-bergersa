/**
 * Qué parte de la app puede usar cada persona.
 *
 * Hasta acá la Lista Blanca decidía una sola cosa: si entrás o no. Con el módulo del Despachante
 * de Aduana eso ya no alcanza, porque entran dos poblaciones distintas: la gente de BERGER, que
 * despacha tractores, y los despachantes de aduana, que son externos y sólo actualizan el estado
 * de las OP que ya existen. Un despachante no tiene por qué ver —ni poder pedir— los pagos del
 * inventario.
 *
 * La decisión se toma UNA vez, al ingresar, y viaja firmada dentro de la sesión del día. Los
 * pedidos de datos la vuelven a comprobar contra la Lista Blanca en vivo, así que sacarle a
 * alguien el tipo o el equipo en el tablero le corta el módulo en el acto.
 *
 * El control de verdad está acá, en el servidor. La pantalla esconde lo que no corresponde, pero
 * esconder un botón no impide pedir el dato: lo impide esta lista.
 */
import type { ModuloApp } from '../../src/services/monday/operaciones'
import { ETIQUETA, TEAM, TEAM_MONDAY } from './config'
import { consultarMonday } from './mondayServidor'
import type { Perfil } from './listaBlanca'

/**
 * Los módulos de la app. El tipo se define junto al catálogo de operaciones, que es donde cada
 * consulta declara a qué módulo pertenece: así no hay dos listas de módulos que se puedan separar.
 */
export type Modulo = ModuloApp

export const MODULOS: Modulo[] = [
  'despacho',
  'aduana',
  'aduanaBerger',
  'aduanaDashboard',
  'drafts',
  'fechas',
  'usuarios',
]

/** Que el valor venga de afuera y sea uno de los módulos conocidos. */
export const esModulo = (v: unknown): v is Modulo => MODULOS.includes(v as Modulo)

/**
 * ¿Es un despachante de aduana?
 *
 * Son las tres condiciones juntas, como las pidió BERGER: INVITADO en la Lista Blanca, con el
 * equipo "Despachantes" en su fila, Y efectivamente en el equipo Despachantes de monday. Las tres
 * porque cada una la administra alguien distinto —la fila la carga BERGER, el equipo lo maneja
 * monday—, y exigir las tres significa que nadie habilita a un externo por su cuenta.
 */
const esDespachanteEnLaLista = (perfil: Perfil): boolean =>
  perfil.tipoUsuario === ETIQUETA.INVITADO && perfil.teams.includes(TEAM.DESPACHANTES)

/** ¿Está en el equipo de Administración de BERGER? */
const esAdministracion = (perfil: Perfil): boolean => perfil.teams.includes(TEAM.ADMINISTRACION)

/**
 * Los módulos que habilita la FILA de la Lista Blanca, sin preguntarle nada a monday.
 *
 * Es lo que se vuelve a comprobar en cada pedido de datos: es gratis —el perfil ya se leyó— y es
 * lo que hace que un cambio en el tablero valga en el acto.
 *
 * El de Administración ve TODO lo que la app tenga: es el equipo dueño de la operación, y la regla
 * de BERGER es que el único restringido sea el despachante externo, que entra nada más que a
 * cargar las novedades de sus OP.
 *
 * Una fila sin equipo cargado es la de siempre, la de quien venía usando la app antes de que
 * existieran los equipos: se queda con Despacho. Cambiar eso dejaría afuera a gente que hoy
 * trabaja, por un dato que nadie le pidió nunca.
 */
export function modulosSegunLaLista(perfil: Perfil): Modulo[] {
  if (esDespachanteEnLaLista(perfil)) return ['aduana']
  if (esAdministracion(perfil)) return [...MODULOS]
  return ['despacho']
}

/** ¿Este usuario de monday está en ese equipo? */
async function estaEnElEquipo(usuarioId: string, equipoId: string): Promise<boolean> {
  const datos = await consultarMonday<{ teams: { users: { id: string }[] | null }[] | null }>(
    `query ($ids: [ID!]) { teams(ids: $ids) { users(kind: all) { id } } }`,
    { ids: [equipoId] },
  )
  return (datos.teams?.[0]?.users ?? []).some((u) => String(u.id) === usuarioId)
}

/** Los módulos que no alcanza con tenerlos en la fila: hace falta el equipo de monday. */
const EXIGEN_EQUIPO = (m: Modulo): boolean => m.startsWith('aduana') || m === 'usuarios'

/**
 * Los módulos definitivos de un perfil, ya con el equipo de monday comprobado.
 *
 * Se calcula sólo al ingresar, porque es el único que consulta monday. Si el equipo no se puede
 * leer, el módulo que dependía de él NO se otorga: ante la duda, menos acceso.
 */
export async function modulosDelPerfil(perfil: Perfil, usuarioId: string): Promise<Modulo[]> {
  const deLaLista = modulosSegunLaLista(perfil)

  const equipo = esDespachanteEnLaLista(perfil)
    ? TEAM_MONDAY.DESPACHANTES
    : esAdministracion(perfil)
      ? TEAM_MONDAY.ADMINISTRACION
      : null

  // Sin equipo que comprobar —las filas viejas, sin equipo cargado— queda lo de la lista.
  if (!equipo) return deLaLista

  let enElEquipo = false
  try {
    enElEquipo = await estaEnElEquipo(usuarioId, equipo)
  } catch {
    enElEquipo = false
  }
  if (enElEquipo) return deLaLista

  /* El equipo no confirma. Para un despachante eso es quedarse sin nada: su único módulo depende
     de estar en el equipo. Para alguien de Administración se le caen los módulos que exigen el
     equipo —todo lo de Aduana y el alta de usuarios, que escribe la Lista Blanca— y conserva
     Despacho, que es lo que la fila le habilita por sí sola.

     Que "usuarios" esté acá importa: es el módulo que decide quién entra a la app, así que no
     puede sostenerse sólo en la fila del tablero. Si el equipo no se pudo comprobar, no se otorga. */
  return deLaLista.filter((m) => !EXIGEN_EQUIPO(m))
}
