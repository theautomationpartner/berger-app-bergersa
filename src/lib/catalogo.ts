/**
 * El catálogo de destinos: todas las pantallas a las que se puede llegar, en una sola lista plana.
 *
 * La navegación de la app es un árbol de cuatro niveles. Para moverse por él hay dos piezas que
 * necesitan verlo **entero y de una**: el buscador del inicio y el panel lateral. Armar cada una
 * recorriendo el árbol por su cuenta terminaría en dos recorridos que se desincronizan —una
 * operación nueva aparecería en el panel y no en el buscador— así que las dos leen de acá.
 *
 * Cada destino lleva su `ruta`: lo que hay que poner en el estado de la app para llegar. Así el
 * buscador no sabe nada de cómo está armada la navegación; devuelve una ruta y la app la aplica.
 */
import {
  AREAS,
  MODALIDADES_DESPACHO,
  OPERACIONES_ADUANA,
  OPERACIONES_DRAFTS,
  OPERACIONES_FECHAS,
  OPERACIONES_PRINCIPALES,
} from './navegacion'
import type { ModuloApp } from '@/services/monday/operaciones'
import type {
  AreaApp,
  ModalidadDespacho,
  OperacionAduana,
  OperacionDrafts,
  OperacionFechas,
  OperacionPrincipal,
} from '@/types'

/** Dónde está parada la app. `null` en un nivel significa "el panel de ese nivel". */
export interface Ruta {
  area: AreaApp | null
  principal: OperacionPrincipal | null
  modalidad: ModalidadDespacho | null
  aduana: OperacionAduana | null
  drafts: OperacionDrafts | null
  fechas: OperacionFechas | null
}

export const RUTA_INICIO: Ruta = {
  area: null,
  principal: null,
  modalidad: null,
  aduana: null,
  drafts: null,
  fechas: null,
}

const ruta = (parcial: Partial<Ruta>): Ruta => ({ ...RUTA_INICIO, ...parcial })

export interface Destino {
  /** Identificador estable, para las listas de React. */
  id: string
  /** Cómo se llama la pantalla. */
  titulo: string
  /** Dónde vive: "Compra · Despacho de aduana". Es lo que ubica a un título repetido. */
  donde: string
  detalle: string
  icono: string
  modulo: ModuloApp
  ruta: Ruta
  /**
   * Quién usa esta pantalla, cuando la operación está dividida por eso.
   *
   * En DESPACHO DE ADUANA conviven dos trabajos sobre las mismas OP —lo del despachante y lo de
   * BERGER— con nombres casi iguales: hay dos "ACTUALIZAR OP". Sin saber de quién es cada una, el
   * título no alcanza para elegir.
   */
  seccion?: string
  busqueda: string
}

/**
 * Sin tildes y en minúsculas.
 *
 * Nadie escribe "importación" con tilde en un buscador, y "Nacionalizado" tipeado como
 * "nacionalisado" no es asunto de esto; pero la tilde sí, porque está en casi todos los títulos.
 */
export const normalizar = (texto: string): string =>
  texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Palabras con las que alguien busca una pantalla y que no están en su título.
 *
 * Son las que la gente usa hablando: "CUIT" para el alta de cuentas, "VEP" para la OP de BERGER.
 * Sin esto, el buscador sólo encuentra lo que ya se sabe cómo se llama, que es justo lo contrario
 * de para qué sirve.
 */
const SINONIMOS: Record<string, string> = {
  'venta/actividades':
    'actividad actividades llamada llamado whatsapp visita reunion meeting email mail agenda tarea pendiente cliente contacto seguimiento',
  'venta/clientes':
    'cuenta cuentas contacto contactos cliente clientes cuit cuil alta crm razon social whatsapp telefono email mail concesionario arca',
  'compra/usuarios': 'usuario usuarios alta baja invitado lista blanca acceso permisos registro',
  'compra/drafts/planificar': 'draft drafts periodo produccion planificar proveedor deutz',
  'compra/drafts/enviar': 'draft drafts enviar planificacion proveedor deutz mail',
  'compra/drafts/dashboard': 'draft drafts dashboard metricas estado tablero',
  'compra/fechas/confirmar': 'fecha fechas produccion confirmar proponer proveedor tractor',
  'compra/fechas/enviar': 'fecha fechas enviar confirmacion proveedor mail',
  'compra/despacho/anticipado': 'pago anticipado transferencia swift comprobante despacho',
  'compra/despacho/vista': 'pago vista contra bl pedido despacho',
  'compra/aduana/actualizar': 'op despachante estado carga eta buque contenedores nacionalizado',
  'compra/aduana/turnos': 'turno carga camion terminal contenedor fecha hora',
  'compra/aduana/berger': 'op berger vep arca terminal forma de pago fondeo banco comprobante',
  'compra/aduana/contenedores': 'contenedor contenedores arribo entrega transportista deposito',
  'compra/aduana/dashboard': 'dashboard despachos metricas estado arribos',
}

const nombreDeArea = (id: AreaApp): string => AREAS.find((a) => a.id === id)?.corto ?? ''

/* Lo que describe el área también se busca: quien escribe "importación" está buscando algo de
   COMPRA, aunque esa palabra no esté en el título de ninguna operación. */
const textoDeArea = (id: AreaApp): string => AREAS.find((a) => a.id === id)?.detalle ?? ''

/** Todos los destinos de la app, sin filtrar por permisos. */
export const DESTINOS: Destino[] = (() => {
  const lista: Destino[] = []

  const sumar = (d: Omit<Destino, 'busqueda'>) => {
    const area = d.ruta.area ? textoDeArea(d.ruta.area) : ''
    lista.push({
      ...d,
      busqueda: normalizar(`${d.titulo} ${d.donde} ${d.detalle} ${area} ${SINONIMOS[d.id] ?? ''}`),
    })
  }

  for (const p of OPERACIONES_PRINCIPALES) {
    const area = nombreDeArea(p.area)

    /* Una principal con hijos no es un destino: entrar a "Despacho de aduana" es entrar a un panel
       de elección, y lo que la gente busca son las pantallas de adentro. Las que NO tienen hijos
       —registro de usuario, alta de cuentas— sí, porque ahí la principal ES la pantalla. */
    const hijos: {
      id: string
      titulo: string
      corto: string
      detalle: string
      icono: string
      modulo?: ModuloApp
      seccion?: string
      ruta: Ruta
    }[] =
      p.id === 'despacho'
        ? MODALIDADES_DESPACHO.map((m) => ({
            ...m,
            id: `compra/despacho/${m.id}`,
            ruta: ruta({ area: 'compra', principal: 'despacho', modalidad: m.id }),
          }))
        : p.id === 'aduana'
          ? OPERACIONES_ADUANA.map((o) => ({
              ...o,
              id: `compra/aduana/${o.id}`,
              ruta: ruta({ area: 'compra', principal: 'aduana', aduana: o.id }),
            }))
          : p.id === 'drafts'
            ? OPERACIONES_DRAFTS.map((o) => ({
                ...o,
                id: `compra/drafts/${o.id}`,
                ruta: ruta({ area: 'compra', principal: 'drafts', drafts: o.id }),
              }))
            : p.id === 'fechas'
              ? OPERACIONES_FECHAS.map((o) => ({
                  ...o,
                  id: `compra/fechas/${o.id}`,
                  ruta: ruta({ area: 'compra', principal: 'fechas', fechas: o.id }),
                }))
              : []

    if (hijos.length === 0) {
      sumar({
        id: `${p.area}/${p.id}`,
        titulo: p.titulo,
        donde: area,
        detalle: p.detalle,
        icono: p.icono,
        modulo: p.modulo,
        ruta: ruta({ area: p.area, principal: p.id }),
      })
      continue
    }

    for (const h of hijos) {
      sumar({
        id: h.id,
        titulo: h.titulo,
        donde: `${area} · ${p.corto}`,
        detalle: h.detalle,
        icono: h.icono,
        /* Las operaciones de aduana tienen módulo propio —el despachante no ve las de BERGER—; las
           demás heredan el de su principal. */
        modulo: h.modulo ?? p.modulo,
        seccion: h.seccion,
        ruta: h.ruta,
      })
    }
  }

  return lista
})()

/** Los destinos que este perfil puede abrir. */
export const destinosDe = (modulos: ModuloApp[]): Destino[] =>
  DESTINOS.filter((d) => modulos.includes(d.modulo))

/**
 * Busca destinos por texto.
 *
 * El orden importa más que el filtro: escribiendo "contenedores" aparecen cuatro pantallas —tres
 * de ellas porque la palabra está en su descripción— y la que se busca es la que se **llama** así.
 * Por eso se ordena por dónde apareció lo tipeado, del título hacia afuera, y recién después por
 * el orden del catálogo.
 */
export function buscarDestinos(destinos: Destino[], texto: string): Destino[] {
  const q = normalizar(texto.trim())
  if (!q) return []

  const palabras = q.split(/\s+/).filter(Boolean)
  const coincide = (d: Destino) => palabras.every((p) => d.busqueda.includes(p))

  /** 3 = el título empieza así · 2 = está en el título · 1 = está en algún otro lado. */
  const peso = (d: Destino): number => {
    const titulo = normalizar(d.titulo)
    if (titulo.startsWith(palabras[0])) return 3
    if (palabras.every((p) => titulo.includes(p))) return 2
    return 1
  }

  return destinos
    .filter(coincide)
    .map((d, orden) => ({ d, orden, peso: peso(d) }))
    .sort((a, b) => b.peso - a.peso || a.orden - b.orden)
    .map((x) => x.d)
}
