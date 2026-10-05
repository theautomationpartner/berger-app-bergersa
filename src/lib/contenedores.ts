import { CONTENEDOR_CUALQUIERA, RUEDAS_CONTENEDOR } from '@/services/monday/columns'
import type {
  ContenedorArmado,
  OpcionContenedor,
  ResumenContenedores,
  Tractor,
  TractorSinContenedor,
} from '@/types'
import { fechaCorta } from './format'
import { textoOrigen } from './puertos'

/**
 * Armado de contenedores: con qué tractores se llena cada uno y cuántos hacen falta.
 *
 * El tablero de Contenedores dice qué productos del catálogo viajan juntos, en qué tipo de
 * contenedor, cuántos entran y con qué rodado. Cada fila es una OPCIÓN, y un mismo grupo de
 * modelos suele tener varias: los 6205/6175/6155 entran de a uno en un 40 H con ruedas, de a dos
 * en un 20 H + 40 H con ruedas, o de a dos sin ruedas en un 40 H.
 *
 * Todo esto es una cuenta, no una decisión del negocio: por eso vive acá, aparte de la pantalla y
 * de monday, y se puede probar sola.
 */

/**
 * Los contenedores FÍSICOS que compone una etiqueta: "20 H + 40 H" es un 20 H más un 40 H.
 *
 * Partirla importa para el despachante, que necesita saber cuántos contenedores de cada medida
 * pedir, no cuántas combinaciones armó la app.
 */
export function tiposDeContenedor(tipo: string): string[] {
  if (!tipo || tipo === CONTENEDOR_CUALQUIERA) return [tipo || 'Contenedor']
  const partes = tipo
    .split('+')
    .map((x) => x.trim())
    .filter(Boolean)
  return partes.length > 0 ? partes : [tipo]
}

/** Cuántos contenedores físicos ocupa una etiqueta. */
export const contenedoresDelTipo = (tipo: string): number => tiposDeContenedor(tipo).length

/**
 * ¿Sirve esta opción para un tractor con este rodado?
 *
 * El Inventario dice "Con Rodado" y Contenedores dice "Con Ruedas": son lo mismo con distinta
 * palabra, así que se comparan por el "Con"/"Sin" y no por el texto completo. "Con y Sin Ruedas"
 * sirve para los dos.
 */
export function ruedasCompatibles(ruedasOpcion: string, rodadoTractor: string): boolean {
  if (ruedasOpcion === RUEDAS_CONTENEDOR.AMBAS) return true
  const conRodado = /^con/i.test(rodadoTractor.trim())
  const conRuedas = /^con/i.test(ruedasOpcion.trim())
  // Un tractor sin el dato de rodado no entra en ninguna opción: se informa aparte en vez de
  // meterlo en un contenedor que capaz no le corresponde.
  if (!rodadoTractor.trim()) return false
  return conRodado === conRuedas
}

/** Opciones que sirven para un tractor: mismo producto de catálogo y rodado compatible. */
const opcionesPara = (tractor: Tractor, opciones: OpcionContenedor[]): OpcionContenedor[] =>
  tractor.catalogoId
    ? opciones.filter(
        (o) =>
          o.catalogo.includes(tractor.catalogoId!) &&
          ruedasCompatibles(o.ruedas, tractor.estadoRodado),
      )
    : []

/** Por qué un tractor no se puede ubicar. El motivo se muestra y también va al reporte. */
function motivoSinContenedor(tractor: Tractor, opciones: OpcionContenedor[]): string {
  if (!tractor.catalogoId) return 'No está conectado al Catálogo de Productos.'
  const delProducto = opciones.filter((o) => o.catalogo.includes(tractor.catalogoId!))
  if (delProducto.length === 0) return 'El modelo no figura en el tablero de Contenedores.'
  if (!tractor.estadoRodado.trim()) return 'No tiene cargado el Estado Rodado.'
  return `No hay combinación cargada para este modelo ${tractor.estadoRodado}.`
}

/**
 * Elige con qué opción llenar el próximo contenedor.
 *
 * Primero busca la más chica que alcance para lo que queda: así cinco tractores no viajan en un
 * contenedor de seis cuando hay uno de cinco. Si no queda ninguna que alcance, usa la que mejor
 * aprovecha cada contenedor —más tractores por contenedor físico— y se sigue con el resto.
 */
function mejorOpcion(opciones: OpcionContenedor[], restantes: number): OpcionContenedor {
  const alcanzan = opciones.filter((o) => o.capacidad >= restantes)
  if (alcanzan.length > 0) {
    return alcanzan.reduce((mejor, o) => (o.capacidad < mejor.capacidad ? o : mejor))
  }
  return opciones.reduce((mejor, o) => {
    const rinde = o.capacidad / o.contenedores
    const rindeMejor = mejor.capacidad / mejor.contenedores
    if (rinde !== rindeMejor) return rinde > rindeMejor ? o : mejor
    return o.capacidad > mejor.capacidad ? o : mejor
  })
}

/**
 * Arma los contenedores de una selección de tractores.
 *
 * `disponibles` son los otros tractores que el usuario podría sumar —los que está viendo en la
 * lista y no eligió—: sirven para sugerir con cuál completar un contenedor que quedó a medias.
 */
export function armarContenedores(
  seleccionados: Tractor[],
  opciones: OpcionContenedor[],
  disponibles: Tractor[] = [],
): ResumenContenedores {
  const sinContenedor: TractorSinContenedor[] = []

  /* Los tractores se agrupan por el CONJUNTO de opciones que les sirve. Dos tractores de modelos
     distintos que comparten las mismas opciones pueden viajar juntos, que es justamente lo que
     dice el tablero al conectar varios productos a la misma fila. */
  const grupos = new Map<string, { opciones: OpcionContenedor[]; tractores: Tractor[] }>()

  for (const tractor of seleccionados) {
    const suyas = opcionesPara(tractor, opciones)
    if (suyas.length === 0) {
      sinContenedor.push({ tractor, motivo: motivoSinContenedor(tractor, opciones) })
      continue
    }
    const clave = suyas
      .map((o) => o.id)
      .sort()
      .join('|')
    const grupo = grupos.get(clave) ?? { opciones: suyas, tractores: [] }
    grupo.tractores.push(tractor)
    grupos.set(clave, grupo)
  }

  const armados: ContenedorArmado[] = []

  for (const grupo of grupos.values()) {
    const elegidos = new Set(seleccionados.map((t) => t.id))
    // Candidatos para completar: mismos requisitos, y que no estén ya elegidos.
    const candidatos = disponibles.filter(
      (t) => !elegidos.has(t.id) && opcionesPara(t, grupo.opciones).length > 0,
    )

    const pendientes = [...grupo.tractores]
    while (pendientes.length > 0) {
      const opcion = mejorOpcion(grupo.opciones, pendientes.length)
      const dentro = pendientes.splice(0, opcion.capacidad)
      const libres = opcion.capacidad - dentro.length
      armados.push({
        opcion,
        tractores: dentro,
        libres,
        sugerencias: libres > 0 ? candidatos.splice(0, libres) : [],
      })
    }
  }

  return {
    armados,
    sinContenedor,
    totalContenedores: armados.reduce((n, a) => n + a.opcion.contenedores, 0),
    totalLibres: armados.reduce((n, a) => n + a.libres, 0),
  }
}

/**
 * Cuántos contenedores de cada medida salen en total.
 *
 * Cuenta contenedores FÍSICOS, no combinaciones: dos grupos que viajan en un "20 H + 40 H" son
 * dos 20 H y dos 40 H.
 */
export function desgloseDeContenedores(resumen: ResumenContenedores): string {
  const cuenta = new Map<string, number>()
  for (const armado of resumen.armados) {
    for (const tipo of tiposDeContenedor(armado.opcion.tipo)) {
      cuenta.set(tipo, (cuenta.get(tipo) ?? 0) + 1)
    }
  }
  return [...cuenta.entries()].map(([tipo, n]) => `${n} x ${tipo}`).join(', ')
}

/** Cómo se nombra un contenedor armado en la pantalla y en el reporte. */
export function rotuloContenedor(armado: ContenedorArmado, desde: number): string {
  const { contenedores, tipo } = armado.opcion
  const etiqueta = tipo || 'Contenedor'
  if (contenedores === 1) return `Contenedor ${desde} · ${etiqueta}`
  return `Contenedores ${desde} a ${desde + contenedores - 1} · ${etiqueta}`
}

/** Los dos encabezados del reporte. Se comparten con quien después lo vuelve a leer. */
const TITULO_BERGER = 'Informacion para Berger:'
export const TITULO_DESPACHANTE = 'Informacion para Despachante:'

/** Un tractor, como se lo nombra en el reporte: nombre, número interno y modelo. */
const lineaTractor = (t: Tractor): string =>
  [
    t.nombre,
    t.numInterno && `N° ${t.numInterno}`,
    t.modelo,
    t.estadoRodado,
    fechaCorta(t.fechaProd),
  ]
    .filter(Boolean)
    .join(' · ')

/**
 * Reporte que queda guardado en el pago, en la columna "Contenedores Armados por APP".
 *
 * Tiene dos destinatarios y por eso dos secciones, en ese orden:
 *
 * - **Berger** necesita el detalle para decidir: qué lleva cada contenedor, dónde sobró lugar y qué
 *   tractores quedaron sin ubicar.
 * - **El despachante** necesita lo mínimo para operar: cuántos contenedores, de qué medidas,
 *   cuántos tractores y de qué puerto salen. Nada más, porque de acá sale el mail que se le manda.
 *
 * Va en texto plano, sin colores ni formato: tiene que leerse igual en una celda de monday y en un
 * correo.
 */
export function reporteContenedores(
  resumen: ResumenContenedores,
  titulo: string,
  puertos: string[] = [],
): string {
  const tractores =
    resumen.armados.reduce((n, a) => n + a.tractores.length, 0) + resumen.sinContenedor.length
  const desglose = desgloseDeContenedores(resumen)

  const lineas: string[] = [titulo, '', TITULO_BERGER, '']

  if (resumen.armados.length === 0) {
    lineas.push('No se armó ningún contenedor.')
  } else {
    lineas.push(
      `TOTAL: ${resumen.totalContenedores} contenedor${resumen.totalContenedores === 1 ? '' : 'es'} · ${desglose}`,
    )
    if (resumen.totalLibres > 0) {
      lineas.push(
        `Queda${resumen.totalLibres === 1 ? '' : 'n'} ${resumen.totalLibres} lugar${resumen.totalLibres === 1 ? '' : 'es'} sin usar.`,
      )
    }
    lineas.push('')

    let numero = 1
    for (const armado of resumen.armados) {
      const { opcion, tractores: dentro, libres } = armado
      lineas.push(
        `${rotuloContenedor(armado, numero)} · ${opcion.ruedas} · ${dentro.length} de ${opcion.capacidad}` +
          (libres > 0
            ? ` (queda${libres === 1 ? '' : 'n'} ${libres} lugar${libres === 1 ? '' : 'es'} libre${libres === 1 ? '' : 's'})`
            : ''),
      )
      for (const t of dentro) lineas.push(`   - ${lineaTractor(t)}`)
      if (armado.sugerencias.length > 0) {
        lineas.push('   Para completarlo se podría sumar:')
        for (const t of armado.sugerencias) lineas.push(`   + ${lineaTractor(t)}`)
      }
      lineas.push('')
      numero += opcion.contenedores
    }
  }

  if (resumen.sinContenedor.length > 0) {
    lineas.push(`SIN CONTENEDOR ASIGNADO (${resumen.sinContenedor.length}):`)
    for (const { tractor, motivo } of resumen.sinContenedor) {
      lineas.push(`   - ${lineaTractor(tractor)} — ${motivo}`)
    }
    lineas.push('')
  }

  lineas.push(
    '',
    TITULO_DESPACHANTE,
    '',
    // El total va solo y en su propia línea, sin el desglose al lado: es el número que se copia al
    // tablero del Despachante, y es lo que la operación 3 vuelve a leer de acá.
    `* Cantidad de contenedores: ${resumen.totalContenedores}`,
    `* Contenedores por tipo: ${desglose || '—'}`,
    `* Cantidad de tractores: ${tractores}`,
    `* Origen: ${textoOrigen(puertos)}`,
  )

  return lineas.join('\n').trim()
}

/**
 * La parte del reporte que se le manda al despachante.
 *
 * Es lo que se muestra en el paso donde se lo elige: antes de confirmar hay que poder leer
 * exactamente lo que va a salir, no una versión parecida armada aparte.
 *
 * Si el reporte no tiene esa sección —un pago viejo, cargado antes de que existiera— devuelve `''`
 * y la pantalla lo dice, en vez de mostrar el reporte entero, que incluye el detalle interno de
 * Berger.
 */
export function seccionDespachante(reporte: string): string {
  const desde = (reporte ?? '').indexOf(TITULO_DESPACHANTE)
  if (desde < 0) return ''
  return reporte.slice(desde + TITULO_DESPACHANTE.length).trim()
}

/** La línea del total, tal cual la escribe `reporteContenedores`. */
const LINEA_TOTAL = /^\* Cantidad de contenedores: (\d+)\s*$/m

/**
 * Cuántos contenedores declara un reporte ya guardado.
 *
 * La operación 3 lo necesita para el tablero del Despachante, y lo LEE del reporte en vez de
 * volver a armar los contenedores: entre el primer paso y la confirmación del SWIFT pueden pasar
 * semanas, y si en el medio cambió una combinación del tablero, recalcular declararía un número
 * distinto del que ya se le reportó a Berger.
 *
 * Devuelve `null` si el pago no tiene reporte o su texto no es de esta app: quien llama avisa, en
 * vez de mandar un cero que parecería un despacho sin contenedores.
 */
export function cantidadDeContenedoresDelReporte(reporte: string): number | null {
  const m = LINEA_TOTAL.exec(reporte ?? '')
  return m ? Number(m[1]) : null
}
