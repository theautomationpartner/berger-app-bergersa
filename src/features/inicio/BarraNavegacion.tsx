/**
 * La navegación, toda en el renglón del logo.
 *
 * Antes había dos renglones: el de la marca y, debajo, uno con «Atrás», «Inicio» y la miga de pan.
 * La miga decía dónde estaba parado uno pero no servía para ir a otro lado: para pasar de una
 * operación a otra había que volver al inicio y bajar de nuevo por los paneles.
 *
 * Acá cada nivel es un desplegable con **todo lo que hay en ese nivel**, así que moverse es elegir
 * en vez de retroceder. Y como cada uno muestra lo elegido, dónde está parado uno se lee igual que
 * antes, sin un renglón aparte.
 *
 * Los desplegables aparecen de a uno: en el inicio no hay ninguno —sólo están COMPRA y VENTA, que
 * es lo que la pantalla ya ofrece—, al entrar a un área aparece el de áreas y el de operaciones, y
 * el tercero sólo si la operación tiene pantallas adentro.
 */
import { useCallback, useRef, useState } from 'react'
import { useClickAfuera } from '@/hooks/useClickAfuera'
import { destinosDe, RUTA_INICIO, type Destino, type Ruta } from '@/lib/catalogo'
import {
  AREAS,
  areasDeModulos,
  OPERACIONES_PRINCIPALES,
  principalesDeArea,
  SECCIONES_POR_PRINCIPAL,
} from '@/lib/navegacion'
import type { ModuloApp } from '@/services/monday/operaciones'
import type { AreaApp, OperacionPrincipal } from '@/types'

interface OpcionNav {
  valor: string
  rotulo: string
  icono: string
  /** Separada del resto por una línea: «Inicio» no es un área más. */
  aparte?: boolean
  /**
   * Bajo qué encabezado va, cuando la lista está dividida por quién usa cada pantalla.
   *
   * En DESPACHO DE ADUANA hay dos "ACTUALIZAR OP" —la del despachante y la de BERGER— y el título
   * solo no alcanza para saber cuál es cuál.
   */
  grupo?: string
}

interface PropsSelector {
  etiqueta: string
  /** Lo elegido. `null` dibuja el "Seleccionar…". */
  actual: OpcionNav | null
  opciones: OpcionNav[]
  onElegir: (valor: string) => void
}

/** Un nivel de la navegación: la etiqueta arriba y el desplegable abajo. */
function SelectorNav({ etiqueta, actual, opciones, onElegir }: PropsSelector) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  const cerrar = useCallback(() => setAbierto(false), [])
  useClickAfuera(caja, abierto, cerrar)

  return (
    <div className="topnav-item" ref={caja}>
      <span className="topnav-lbl">{etiqueta}</span>
      <div className="topnav-sel">
        <button
          type="button"
          className={`topnav-btn${abierto ? ' topnav-btn--abierto' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={abierto}
          onClick={() => setAbierto((v) => !v)}
        >
          {actual ? (
            <>
              <i className={`${actual.icono} topnav-btn-ic`} aria-hidden="true" />
              <span className="topnav-btn-txt">{actual.rotulo}</span>
            </>
          ) : (
            <span className="topnav-btn-txt topnav-btn-txt--vacio">Seleccionar…</span>
          )}
          <i
            className={`fa-solid fa-chevron-${abierto ? 'up' : 'down'} topnav-btn-flecha`}
            aria-hidden="true"
          />
        </button>

        {abierto && (
          <ul className="topnav-panel" role="listbox">
            {opciones.map((o, i) => (
              <li key={o.valor} className={o.aparte ? 'topnav-op-aparte' : undefined}>
                {/* El encabezado del grupo se dibuja sólo cuando cambia: con una línea por opción
                    repetiría "Despachante" dos veces seguidas. */}
                {o.grupo && o.grupo !== opciones[i - 1]?.grupo && (
                  <span className="topnav-grupo">{o.grupo}</span>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={o.valor === actual?.valor}
                  className={`topnav-op${o.valor === actual?.valor ? ' topnav-op--elegida' : ''}`}
                  onClick={() => {
                    onElegir(o.valor)
                    cerrar()
                  }}
                >
                  <i className={o.icono} aria-hidden="true" />
                  <span>{o.rotulo}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

interface Props {
  ruta: Ruta
  modulos: ModuloApp[]
  onIr: (ruta: Ruta) => void
  onAbrirPanel: () => void
}

/** `Inicio` dentro del desplegable de áreas: volver también es moverse. */
const INICIO = '__inicio__'

export function BarraNavegacion({ ruta, modulos, onIr, onAbrirPanel }: Props) {
  const destinos = destinosDe(modulos)

  /* ---- área ---- */
  const areas = areasDeModulos(modulos)
  const defArea = AREAS.find((a) => a.id === ruta.area) ?? null

  const opcionesArea: OpcionNav[] = [
    { valor: INICIO, rotulo: 'Inicio', icono: 'fa-solid fa-house', aparte: true },
    ...areas.map((a) => ({ valor: a.id, rotulo: a.titulo, icono: a.icono })),
  ]

  /* ---- operación principal ---- */
  const principales = ruta.area ? principalesDeArea(modulos, ruta.area) : []
  const defPrincipal = OPERACIONES_PRINCIPALES.find((o) => o.id === ruta.principal) ?? null

  /* ---- la pantalla de adentro, si la operación tiene más de una ---- */
  const dentro = destinos.filter((d) => d.ruta.principal === ruta.principal)
  const hayPantallas = Boolean(ruta.principal) && dentro.length > 1
  const actualDentro =
    dentro.find(
      (d) =>
        d.ruta.modalidad === ruta.modalidad &&
        d.ruta.aduana === ruta.aduana &&
        d.ruta.drafts === ruta.drafts &&
        d.ruta.fechas === ruta.fechas,
    ) ?? null

  /**
   * Las pantallas del desplegable, agrupadas por quién las usa si la operación está dividida.
   *
   * El orden lo da la lista de secciones y no el de las pantallas: así el desplegable se lee en el
   * mismo orden en que están los bloques de la pantalla de elección, y lo que no cae en ninguna
   * sección va primero, suelto.
   */
  const pantallas: OpcionNav[] = (() => {
    const secciones = ruta.principal ? SECCIONES_POR_PRINCIPAL[ruta.principal] : undefined
    const comoOpcion = (d: Destino, grupo?: string): OpcionNav => ({
      valor: d.id,
      rotulo: d.titulo,
      icono: d.icono,
      grupo,
    })
    if (!secciones) return dentro.map((d) => comoOpcion(d))
    return [
      ...dentro.filter((d) => !d.seccion).map((d) => comoOpcion(d)),
      ...secciones.flatMap((sec) =>
        dentro.filter((d) => d.seccion === sec.id).map((d) => comoOpcion(d, sec.titulo)),
      ),
    ]
  })()

  const irADestino = (id: string) => {
    const d = dentro.find((x: Destino) => x.id === id)
    if (d) onIr(d.ruta)
  }

  return (
    <nav className="topnav" aria-label="Navegación">
      <button
        type="button"
        className="topnav-icono"
        title="Todas las operaciones"
        aria-label="Todas las operaciones"
        onClick={onAbrirPanel}
      >
        <i className="fa-solid fa-bars" aria-hidden="true" />
      </button>

      {/* El atajo al inicio, suelto y grande: es el movimiento más repetido y no tiene por qué
          costar abrir un desplegable. */}
      <button
        type="button"
        className="topnav-icono topnav-icono--casa"
        title="Ir al inicio"
        aria-label="Ir al inicio"
        onClick={() => onIr(RUTA_INICIO)}
      >
        <i className="fa-solid fa-house" aria-hidden="true" />
      </button>

      <img className="topnav-logo" src="/logo-berger.svg" alt="BERGER S.A." />

      {/* En el inicio no se dibuja ninguno: la pantalla ya ofrece COMPRA y VENTA, y repetirlas
          arriba sería preguntar dos veces lo mismo. */}
      {ruta.area && (
        <>
          <SelectorNav
            etiqueta="Área:"
            actual={
              defArea ? { valor: defArea.id, rotulo: defArea.titulo, icono: defArea.icono } : null
            }
            opciones={opcionesArea}
            onElegir={(v) =>
              onIr(v === INICIO ? RUTA_INICIO : { ...RUTA_INICIO, area: v as AreaApp })
            }
          />

          <i className="fa-solid fa-chevron-right topnav-flecha" aria-hidden="true" />

          <SelectorNav
            etiqueta="Operación:"
            actual={
              defPrincipal
                ? {
                    valor: defPrincipal.id,
                    rotulo: defPrincipal.titulo,
                    icono: defPrincipal.icono,
                  }
                : null
            }
            opciones={principales.map((o) => ({
              valor: o.id,
              rotulo: o.titulo,
              icono: o.icono,
            }))}
            onElegir={(v) =>
              onIr({
                ...RUTA_INICIO,
                area: ruta.area,
                principal: v as OperacionPrincipal,
              })
            }
          />
        </>
      )}

      {/* El tercer nivel sólo donde existe: DESPACHO DE ADUANA tiene cinco pantallas adentro,
          ALTA DE CUENTAS Y CONTACTOS es la pantalla. */}
      {hayPantallas && (
        <>
          <i className="fa-solid fa-chevron-right topnav-flecha" aria-hidden="true" />
          <SelectorNav
            etiqueta="Pantalla:"
            actual={
              actualDentro
                ? { valor: actualDentro.id, rotulo: actualDentro.titulo, icono: actualDentro.icono }
                : null
            }
            opciones={pantallas}
            onElegir={irADestino}
          />
        </>
      )}
    </nav>
  )
}
