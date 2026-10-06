import type { ReactNode } from 'react'

interface Props {
  /** La navegación, que vive en este mismo renglón: ver `BarraNavegacion`. */
  navegacion?: ReactNode
  /** Perfil con el que se entró. Se muestra junto a la acción de salir. */
  perfil?: string
  onSalir?: () => void
}

/**
 * Barra superior de la app.
 *
 * El nombre de la app y el subtítulo que había al lado del logo se fueron: decían siempre lo
 * mismo y ocupaban el lugar donde ahora está la navegación, que cambia según dónde esté parado
 * uno. Que la app es la de BERGER ya lo dice el logo, y en qué cuenta de monday está, monday.
 *
 * A la derecha, quién está adentro y cómo salir. Con la cuenta de monday compartida entre varios
 * administradores, ver con qué perfil se entró evita cargar algo a nombre de otro, y "Salir" es la
 * forma de que otra persona entre desde la misma computadora sin esperar al día siguiente.
 */
export function BarraMarca({ navegacion, perfil, onSalir }: Props) {
  return (
    <header className="marca">
      {navegacion}
      <div className="marca-derecha">
        {perfil && (
          <span className="chip chip--indigo marca-perfil" title="Perfil con el que entraste">
            <i className="fa-solid fa-user" aria-hidden="true" /> {perfil}
          </span>
        )}
        {onSalir && (
          <button type="button" className="btn btn--texto btn--chico marca-salir" onClick={onSalir}>
            <i className="fa-solid fa-right-from-bracket" aria-hidden="true" />
            <span className="marca-salir-txt">Salir</span>
          </button>
        )}
        <span className="marca-build" title="Build en ejecución">
          {__COMMIT__}
        </span>
      </div>
    </header>
  )
}
