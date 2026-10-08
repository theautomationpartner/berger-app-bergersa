import { useEffect, useMemo, useRef, useState } from 'react'
import { useClickAfuera } from '@/hooks/useClickAfuera'
import { usePanelQueEntra } from '@/hooks/usePanelQueEntra'
import { buscarPeriodos } from '@/lib/periodos'

interface Props {
  /** Período elegido, o `''`. */
  valor: string
  onElegir: (periodo: string) => void
  /** Texto cuando no hay nada elegido. */
  vacio?: string
  /** Para distinguir el selector "para todos" del de cada draft. */
  id?: string
}

/** El año de un período ("Marzo 2027" → "2027"). Se usa para agrupar la lista. */
const anioDe = (periodo: string): string => periodo.split(' ')[1] ?? ''
const mesDe = (periodo: string): string => periodo.split(' ')[0] ?? periodo

/**
 * Selector de período de producción con búsqueda.
 *
 * La columna tiene **120 períodos** (Enero 2026 → Diciembre 2035). Un `<select>` nativo con esa
 * cantidad obliga a bajar por una lista interminable para llegar a un mes que ya se sabe cuál es, y
 * en el celular la rueda del sistema es todavía peor. Acá se escribe y la lista se achica.
 *
 * La búsqueda ignora tildes y mayúsculas, y sirve tanto para el mes como para el año: "marz" deja
 * los diez marzos, "2027" deja los doce meses de ese año, y "marzo 27" deja uno solo. Es la forma
 * en que se piensa un período —un mes, un año, o los dos—, y no hace falta explicarla.
 *
 * Mientras no se busca nada, la lista va agrupada por año con el encabezado fijo arriba: así se
 * recorre de a bloques en vez de leer ciento veinte renglones seguidos.
 */
export function SelectorPeriodo({ valor, onElegir, vacio = 'Elegir período…', id }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [resaltado, setResaltado] = useState(0)

  const caja = useRef<HTMLDivElement>(null)

  /* Si abajo no hay lugar, el panel se abre para arriba (o hacia el otro costado). */

  const panel = usePanelQueEntra<HTMLDivElement>(abierto)
  const campo = useRef<HTMLInputElement>(null)
  const lista = useRef<HTMLDivElement>(null)

  useClickAfuera(caja, abierto, () => setAbierto(false))

  const opciones = useMemo(() => buscarPeriodos(busqueda), [busqueda])

  /** Al abrir, la lista arranca en lo ya elegido; al buscar, en el primer resultado. */
  useEffect(() => {
    if (!abierto) return
    const i = valor ? opciones.indexOf(valor) : -1
    setResaltado(i >= 0 ? i : 0)
  }, [abierto, valor, opciones])

  // El resaltado tiene que quedar a la vista cuando se recorre con las flechas.
  useEffect(() => {
    if (!abierto) return
    lista.current
      ?.querySelector<HTMLElement>('[data-resaltado="si"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [abierto, resaltado])

  const abrir = () => {
    setBusqueda('')
    setAbierto(true)
    // El foco va al campo recién cuando el desplegable existe en pantalla.
    requestAnimationFrame(() => campo.current?.focus())
  }

  const elegir = (periodo: string) => {
    onElegir(periodo)
    setAbierto(false)
  }

  const alTeclear = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (opciones.length === 0) return
      const paso = e.key === 'ArrowDown' ? 1 : -1
      setResaltado((i) => (i + paso + opciones.length) % opciones.length)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const elegido = opciones[resaltado]
      if (elegido) elegir(elegido)
      return
    }
    if (e.key === 'Escape') setAbierto(false)
  }

  return (
    <div className="combo" ref={caja}>
      <button
        type="button"
        id={id}
        className={`combo-boton${valor ? ' combo-boton--elegido' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => (abierto ? setAbierto(false) : abrir())}
      >
        <i className="fa-solid fa-calendar-days combo-ic" aria-hidden="true" />
        {valor ? (
          <span className="combo-valor">
            <span className="combo-mes">{mesDe(valor)}</span>
            <span className="combo-anio">{anioDe(valor)}</span>
          </span>
        ) : (
          <span className="combo-vacio">{vacio}</span>
        )}
        <i
          className={`fa-solid fa-chevron-${abierto ? 'up' : 'down'} combo-flecha`}
          aria-hidden="true"
        />
      </button>

      {abierto && (
        <div ref={panel} className="combo-panel">
          <div className="combo-buscador">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <input
              ref={campo}
              className="combo-input"
              value={busqueda}
              placeholder="Escribí un mes o un año: marzo, 2027, marzo 27…"
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={alTeclear}
              aria-label="Buscar período de producción"
            />
            {busqueda && (
              <button
                type="button"
                className="combo-limpiar"
                aria-label="Borrar la búsqueda"
                onClick={() => {
                  setBusqueda('')
                  campo.current?.focus()
                }}
              >
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="combo-lista" role="listbox" ref={lista}>
            {opciones.length === 0 && (
              <div className="combo-sin">
                <i className="fa-solid fa-calendar-xmark" aria-hidden="true" />
                <span>
                  Ningún período coincide con <b>{busqueda}</b>
                </span>
              </div>
            )}

            {opciones.map((periodo, i) => {
              const anio = anioDe(periodo)
              // El encabezado del año sólo cuando arranca uno nuevo, y sólo si no se está buscando:
              // en una búsqueda los resultados son pocos y el año ya se lee en cada renglón.
              const abreAnio = !busqueda && (i === 0 || anioDe(opciones[i - 1]) !== anio)
              const elegido = periodo === valor
              return (
                <div key={periodo} style={{ display: 'contents' }}>
                  {abreAnio && <div className="combo-anio-sep">{anio}</div>}
                  <button
                    type="button"
                    role="option"
                    aria-selected={elegido}
                    data-resaltado={i === resaltado ? 'si' : 'no'}
                    className={`combo-opcion${elegido ? ' combo-opcion--elegida' : ''}${
                      i === resaltado ? ' combo-opcion--resaltada' : ''
                    }`}
                    onMouseEnter={() => setResaltado(i)}
                    onClick={() => elegir(periodo)}
                  >
                    <span className="combo-opcion-mes">{mesDe(periodo)}</span>
                    <span className="combo-opcion-anio">{anio}</span>
                    {elegido && <i className="fa-solid fa-check" aria-hidden="true" />}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
