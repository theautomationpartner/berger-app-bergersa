import { useState } from 'react'
import { MarcoIngreso } from './MarcoIngreso'

interface Props {
  codigos: string[]
  onEntrar: () => void
}

/**
 * Los códigos de recuperación, mostrados UNA sola vez.
 *
 * El servidor no los guarda en claro —sólo su huella—, así que no hay forma de volver a mostrarlos.
 * Por eso no se puede seguir sin confirmar que se guardaron: entrar a la app con un clic y descubrir
 * el día que se pierde el celular que no quedaron anotados en ningún lado es exactamente el
 * problema que estos códigos existen para resolver.
 */
export function CodigosRecuperacion({ codigos, onEntrar }: Props) {
  const [guardados, setGuardados] = useState(false)
  const [copiado, setCopiado] = useState(false)

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(codigos.join('\n'))
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sin portapapeles quedan a la vista para copiarlos a mano.
    }
  }

  return (
    <MarcoIngreso
      ancha
      titulo="Guardá tus códigos de recuperación"
      bajada="Si perdés o cambiás el celular, cada uno de estos códigos te deja entrar UNA vez en lugar del código de 6 dígitos. Guardalos en un lugar seguro: no se vuelven a mostrar."
    >
      <div className="ingreso-codigos">
        {codigos.map((c) => (
          <code key={c} className="ingreso-codigo">
            {c}
          </code>
        ))}
      </div>

      <button type="button" className="btn btn--borde ingreso-copiar" onClick={() => void copiar()}>
        <i className={`fa-solid ${copiado ? 'fa-check' : 'fa-copy'}`} aria-hidden="true" />
        {copiado ? 'Copiados' : 'Copiar los 10 códigos'}
      </button>

      <label className="ingreso-check">
        <input
          type="checkbox"
          checked={guardados}
          onChange={(e) => setGuardados(e.target.checked)}
        />
        <span>Ya guardé los códigos en un lugar seguro</span>
      </label>

      <button
        type="button"
        className="btn btn--marca ingreso-accion"
        disabled={!guardados}
        onClick={onEntrar}
      >
        Entrar a la app <i className="fa-solid fa-arrow-right" aria-hidden="true" />
      </button>
    </MarcoIngreso>
  )
}
