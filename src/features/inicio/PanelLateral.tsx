/**
 * Panel lateral: toda la app de un vistazo, desde cualquier pantalla.
 *
 * La miga de pan dice dónde se está parado, pero para ir de una operación a otra había que volver
 * al inicio y bajar de nuevo por los paneles. Acá está el árbol entero —sólo lo que este perfil
 * puede abrir— y su buscador, así que de "Cargar turno" a "Dashboard" son dos toques.
 *
 * Se abre y se cierra: ocupar una franja fija de la pantalla no se justifica en una app que se usa
 * también desde el celular, dentro del iframe de monday, donde el alto es poco.
 */
import { useEffect } from 'react'
import { Buscador } from './Buscador'
import { AREAS } from '@/lib/navegacion'
import type { Destino } from '@/lib/catalogo'
import type { AreaApp } from '@/types'

interface Props {
  abierto: boolean
  onCerrar: () => void
  destinos: Destino[]
  onIr: (destino: Destino) => void
  /** El destino en el que está parada la app, para marcarlo. */
  actual?: string
}

export function PanelLateral({ abierto, onCerrar, destinos, onIr, actual }: Props) {
  /* Escape cierra. Dentro del iframe de monday no hay otra forma obvia de salir de un panel que
     tapa la pantalla en el celular. */
  useEffect(() => {
    if (!abierto) return
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [abierto, onCerrar])

  if (!abierto) return null

  const porArea = AREAS.map((a) => ({
    area: a,
    dentro: destinos.filter((d) => d.ruta.area === (a.id as AreaApp)),
  })).filter((g) => g.dentro.length > 0)

  const elegir = (d: Destino) => {
    onIr(d)
    onCerrar()
  }

  return (
    <>
      {/* El fondo oscuro también cierra: es lo que todo el mundo intenta primero. */}
      <button className="lateral-fondo" aria-label="Cerrar el menú" onClick={onCerrar} />

      <aside className="lateral" aria-label="Operaciones de la app">
        <div className="lateral-head">
          <span className="lateral-tit">Operaciones</span>
          <button type="button" className="lateral-cerrar" aria-label="Cerrar" onClick={onCerrar}>
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>

        <div className="lateral-buscador">
          <Buscador destinos={destinos} onIr={elegir} autoFoco vacio="Buscar…" />
        </div>

        <nav className="lateral-arbol">
          {porArea.map((g) => (
            <div key={g.area.id} className="lateral-grupo">
              <span className="lateral-grupo-tit">
                <i className={g.area.icono} aria-hidden="true" /> {g.area.titulo}
              </span>
              {g.dentro.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`lateral-item${d.id === actual ? ' lateral-item--on' : ''}`}
                  aria-current={d.id === actual ? 'page' : undefined}
                  onClick={() => elegir(d)}
                >
                  <i className={d.icono} aria-hidden="true" />
                  <span className="lateral-item-txt">
                    <span className="lateral-item-tit">{d.titulo}</span>
                    <span className="lateral-item-donde">{d.donde}</span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>
    </>
  )
}
