import { useCallback, useEffect, useRef, useState } from 'react'
import { useClickAfuera } from '@/hooks/useClickAfuera'
import { usePanelQueEntra } from '@/hooks/usePanelQueEntra'
import { claveMes, mesActual, rotuloMes } from '@/lib/meses'
import type { MesAnio } from '@/types'

interface Props {
  /** Meses que se ofrecen, en orden cronológico. */
  meses: MesAnio[]
  /** Claves (`2026-09`) de los meses elegidos. */
  elegidos: string[]
  onCambiar: (claves: string[]) => void
  /** Cuántos tractores hay en cada mes. Se muestra al lado de cada opción. */
  conteos: Map<string, number>
}

/**
 * Filtro de meses: un desplegable para elegir, y las etiquetas de lo elegido, cada una con su X.
 *
 * Las dos piezas están separadas a propósito. El desplegable es para AGREGAR y se cierra solo;
 * las etiquetas quedan siempre a la vista, porque son la respuesta a "¿por qué estoy viendo estos
 * tractores y no otros?". Si el filtro activo sólo se viera abriendo el desplegable, una lista
 * corta parecería un inventario vacío.
 *
 * Cada opción muestra cuántos tractores tiene ese mes: elegir un mes para descubrir que no trae
 * nada es un viaje de ida y vuelta que el número evita.
 */
export function SelectorMeses({ meses, elegidos, onCambiar, conteos }: Props) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  /* Si abajo no hay lugar, el panel se abre para arriba (o hacia el otro costado). */
  const panel = usePanelQueEntra<HTMLDivElement>(abierto)
  const opcionActual = useRef<HTMLButtonElement>(null)

  const cerrar = useCallback(() => setAbierto(false), [])
  useClickAfuera(caja, abierto, cerrar)

  const actual = claveMes(mesActual())
  const elegidosSet = new Set(elegidos)

  /* Al abrir se lleva la lista hasta el mes en curso. Con 25 meses en orden cronológico, sin esto
     el desplegable abre en el de hace un año, que es justo el que menos se busca. */
  useEffect(() => {
    if (abierto) opcionActual.current?.scrollIntoView({ block: 'center' })
  }, [abierto])

  const alternar = (clave: string) => {
    const proximos = elegidosSet.has(clave)
      ? elegidos.filter((c) => c !== clave)
      : [...elegidos, clave]
    // Se guardan en orden cronológico: así las etiquetas se leen como un calendario, no en el
    // orden en que se fueron tocando.
    onCambiar(proximos.sort())
  }

  // Agrupadas por año, para que "enero" no se confunda entre dos eneros distintos.
  const porAnio = meses.reduce<Map<number, MesAnio[]>>((grupos, m) => {
    grupos.set(m.anio, [...(grupos.get(m.anio) ?? []), m])
    return grupos
  }, new Map())

  const rotuloDe = (clave: string) => {
    const m = meses.find((x) => claveMes(x) === clave)
    return m ? rotuloMes(m) : clave
  }

  return (
    <div className="meses" ref={caja}>
      <button
        type="button"
        className={`meses-disparador${abierto ? ' meses-disparador--abierto' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
      >
        <i className="fa-solid fa-calendar-days" aria-hidden="true" />
        <span className="meses-disparador-txt">
          {elegidos.length === 0
            ? 'Todos los meses de producción'
            : `${elegidos.length} ${elegidos.length === 1 ? 'mes elegido' : 'meses elegidos'}`}
        </span>
        <i className="fa-solid fa-chevron-down meses-caret" aria-hidden="true" />
      </button>

      {abierto && (
        <div ref={panel} className="meses-panel" role="listbox" aria-multiselectable="true">
          {[...porAnio.entries()].map(([anio, delAnio]) => (
            <div key={anio} className="meses-grupo">
              <div className="meses-anio">{anio}</div>
              {delAnio.map((m) => {
                const clave = claveMes(m)
                const marcado = elegidosSet.has(clave)
                const cantidad = conteos.get(clave) ?? 0
                return (
                  <button
                    key={clave}
                    ref={clave === actual ? opcionActual : undefined}
                    type="button"
                    role="option"
                    aria-selected={marcado}
                    className={`meses-opcion${marcado ? ' meses-opcion--sel' : ''}`}
                    onClick={() => alternar(clave)}
                  >
                    <span className="trow-check">
                      {marcado && <i className="fa-solid fa-check" aria-hidden="true" />}
                    </span>
                    <span className="meses-opcion-txt">{rotuloMes(m)}</span>
                    {clave === actual && <span className="chip chip--azul">este mes</span>}
                    <span
                      className={`meses-cuenta${cantidad > 0 ? ' meses-cuenta--hay' : ''}`}
                      title={`${cantidad} tractor${cantidad === 1 ? '' : 'es'}`}
                    >
                      {cantidad}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {elegidos.length > 0 && (
        <div className="meses-etiquetas">
          {elegidos.map((clave) => (
            <span key={clave} className="chip chip--azul meses-etiqueta">
              {rotuloDe(clave)}
              <button
                type="button"
                className="meses-quitar"
                aria-label={`Quitar ${rotuloDe(clave)} del filtro`}
                onClick={() => onCambiar(elegidos.filter((c) => c !== clave))}
              >
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            </span>
          ))}
          <button type="button" className="btn btn--texto btn--chico" onClick={() => onCambiar([])}>
            Quitar todos
          </button>
        </div>
      )}
    </div>
  )
}
