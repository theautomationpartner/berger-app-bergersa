import { useCallback, useMemo, useRef, useState } from 'react'
import { useClickAfuera } from '@/hooks/useClickAfuera'

export interface OpcionDesplegable {
  valor: string
  rotulo: string
  /** Una segunda línea, para cuando el rótulo solo no alcanza. */
  detalle?: string
}

interface Props {
  valor: string
  opciones: readonly (string | OpcionDesplegable)[]
  onCambiar: (valor: string) => void
  /** Qué se lee cuando no hay nada elegido. */
  vacio?: string
  /** Deshabilita el campo entero. */
  bloqueado?: boolean
  /** Si la lista es larga, aparece un buscador arriba. */
  buscable?: boolean
  /**
   * No muestra nada hasta que se escribe.
   *
   * Para listas que crecen sin techo —las cuentas del CRM— desplegar las primeras doscientas no
   * ayuda a nadie: la que se busca nunca está entre las que se ven, y la lista tapa el formulario.
   * Con esto el panel arranca invitando a escribir.
   */
  soloAlBuscar?: boolean
  id?: string
}

const normalizar = (o: string | OpcionDesplegable): OpcionDesplegable =>
  typeof o === 'string' ? { valor: o, rotulo: o } : o

/**
 * Desplegable propio.
 *
 * El `<select>` nativo dibuja su lista con el motor del sistema operativo: en Windows es una caja
 * gris de bordes cuadrados que no se parece a nada del resto de la app, no respeta los colores ni
 * los tamaños, y en el iframe de monday queda especialmente fuera de lugar. Éste se dibuja con los
 * mismos elementos que todo lo demás.
 *
 * Lo que sí se conserva del nativo es cómo se **maneja**: se abre y se cierra con Enter o Espacio,
 * se recorre con las flechas, Escape cierra, y al abrirse queda enfocada la opción elegida. Un
 * desplegable que sólo funciona con el mouse es un retroceso, por lindo que sea.
 */
export function Desplegable({
  valor,
  opciones,
  onCambiar,
  vacio = '(sin definir)',
  bloqueado,
  buscable,
  soloAlBuscar,
  id,
}: Props) {
  const lista = useMemo(() => opciones.map(normalizar), [opciones])
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  /** Qué opción está "apuntada" con el teclado. */
  const [foco, setFoco] = useState(0)

  const caja = useRef<HTMLDivElement>(null)
  const cerrar = useCallback(() => {
    setAbierto(false)
    setBusqueda('')
  }, [])
  useClickAfuera(caja, abierto, cerrar)

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    if (!texto) return soloAlBuscar ? [] : lista
    return lista.filter(
      (o) =>
        o.rotulo.toLowerCase().includes(texto) || (o.detalle ?? '').toLowerCase().includes(texto),
    )
  }, [lista, busqueda, soloAlBuscar])

  const elegida = lista.find((o) => o.valor === valor)

  const abrir = () => {
    if (bloqueado) return
    const i = visibles.findIndex((o) => o.valor === valor)
    setFoco(i >= 0 ? i : 0)
    setAbierto(true)
  }

  const elegir = (v: string) => {
    onCambiar(v)
    cerrar()
  }

  const alTeclear = (e: React.KeyboardEvent) => {
    if (bloqueado) return
    if (!abierto) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault()
        abrir()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFoco((n) => Math.min(n + 1, visibles.length)) // el último índice es "(sin definir)"
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFoco((n) => Math.max(n - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      elegir(visibles[foco]?.valor ?? '')
    } else if (e.key === 'Escape') {
      cerrar()
    }
  }

  return (
    <div className={`desp${bloqueado ? ' desp--bloq' : ''}`} ref={caja}>
      <button
        id={id}
        type="button"
        className={`desp-btn${abierto ? ' desp-btn--abierto' : ''}`}
        disabled={bloqueado}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => (abierto ? cerrar() : abrir())}
        onKeyDown={alTeclear}
      >
        <span className={`desp-val${elegida ? '' : ' desp-val--vacio'}`}>
          {elegida?.rotulo ?? vacio}
        </span>
        <i
          className={`fa-solid fa-chevron-${abierto ? 'up' : 'down'} desp-flecha`}
          aria-hidden="true"
        />
      </button>

      {abierto && (
        <div className="desp-panel">
          {buscable && (
            <input
              className="input desp-buscar"
              autoFocus
              value={busqueda}
              placeholder="Filtrar…"
              onChange={(e) => {
                setBusqueda(e.target.value)
                setFoco(0)
              }}
              onKeyDown={alTeclear}
            />
          )}

          <ul className="desp-lista" role="listbox">
            {visibles.map((o, i) => (
              <li key={o.valor}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.valor === valor}
                  className={`desp-op${o.valor === valor ? ' desp-op--elegida' : ''}${
                    i === foco ? ' desp-op--foco' : ''
                  }`}
                  onMouseEnter={() => setFoco(i)}
                  onClick={() => elegir(o.valor)}
                >
                  <span className="desp-op-txt">
                    <span className="desp-op-rot">{o.rotulo}</span>
                    {o.detalle && <span className="desp-op-det">{o.detalle}</span>}
                  </span>
                  {o.valor === valor && (
                    <i className="fa-solid fa-check desp-op-tic" aria-hidden="true" />
                  )}
                </button>
              </li>
            ))}

            {visibles.length === 0 && (
              <li className="desp-vacio">
                {soloAlBuscar && !busqueda.trim()
                  ? `Escribí para buscar entre ${lista.length}.`
                  : 'Nada coincide'}
              </li>
            )}

            {/* Volver a "sin definir" tiene que ser posible: una opción elegida por error queda
                pegada si la única forma de sacarla es desde monday. */}
            <li>
              <button
                type="button"
                role="option"
                aria-selected={!elegida}
                className={`desp-op desp-op--limpiar${
                  foco === visibles.length ? ' desp-op--foco' : ''
                }`}
                onMouseEnter={() => setFoco(visibles.length)}
                onClick={() => elegir('')}
              >
                <span className="desp-op-txt">
                  <span className="desp-op-rot">{vacio}</span>
                </span>
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  )
}
