import { useCallback, useMemo, useRef, useState } from 'react'
import { useClickAfuera } from '@/hooks/useClickAfuera'
import type { OpcionDesplegable } from './Desplegable'

interface Props {
  valores: string[]
  opciones: readonly (string | OpcionDesplegable)[]
  onCambiar: (valores: string[]) => void
  /** Qué se lee cuando no hay nada elegido. */
  vacio?: string
  bloqueado?: boolean
  /** Si la lista es larga, aparece un buscador arriba. */
  buscable?: boolean
  /**
   * No muestra nada hasta que se escribe.
   *
   * Para listas que crecen sin techo —los contactos del CRM— desplegar las primeras doscientas no
   * ayuda: la que se busca nunca está entre las que se ven.
   */
  soloAlBuscar?: boolean
  id?: string
}

const normalizar = (o: string | OpcionDesplegable): OpcionDesplegable =>
  typeof o === 'string' ? { valor: o, rotulo: o } : o

/**
 * Desplegable de varias opciones a la vez.
 *
 * Es el hermano de `Desplegable` para cuando se puede elegir más de una. La alternativa que había
 * —una fila de botones siempre visibles— funciona con tres opciones y se desarma con ocho: ocupa
 * media pantalla, empuja todo lo demás hacia abajo y en el celular queda una columna de botones
 * que parecen el formulario entero.
 *
 * Al cerrarse muestra lo elegido en el propio botón ("Cliente, Transporte"), así que no hace falta
 * abrirlo para saber qué quedó. Y no se cierra al tildar: elegir tres categorías con el panel
 * cerrándose en cada una serían tres aperturas.
 */
export function DesplegableMulti({
  valores,
  opciones,
  onCambiar,
  vacio = 'Elegir…',
  bloqueado,
  buscable,
  soloAlBuscar,
  id,
}: Props) {
  const lista = useMemo(() => opciones.map(normalizar), [opciones])
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [foco, setFoco] = useState(0)

  const caja = useRef<HTMLDivElement>(null)
  const cerrar = useCallback(() => {
    setAbierto(false)
    setBusqueda('')
  }, [])
  useClickAfuera(caja, abierto, cerrar)

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    /* Las ya tildadas se muestran igual: si no, lo elegido desaparece de la lista al cerrar el
       buscador y parece que se perdió. */
    if (!texto) return soloAlBuscar ? lista.filter((o) => valores.includes(o.valor)) : lista
    return lista.filter(
      (o) =>
        o.rotulo.toLowerCase().includes(texto) || (o.detalle ?? '').toLowerCase().includes(texto),
    )
  }, [lista, busqueda, soloAlBuscar, valores])

  const elegidas = lista.filter((o) => valores.includes(o.valor))
  const rotulo = elegidas.map((o) => o.rotulo).join(', ')

  const alternar = (v: string) =>
    onCambiar(valores.includes(v) ? valores.filter((x) => x !== v) : [...valores, v])

  const alTeclear = (e: React.KeyboardEvent) => {
    if (bloqueado) return
    if (!abierto) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault()
        setFoco(0)
        setAbierto(true)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFoco((n) => Math.min(n + 1, visibles.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFoco((n) => Math.max(n - 1, 0))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const o = visibles[foco]
      if (o) alternar(o.valor)
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
        onClick={() => (abierto ? cerrar() : setAbierto(true))}
        onKeyDown={alTeclear}
      >
        <span className={`desp-val${elegidas.length > 0 ? '' : ' desp-val--vacio'}`}>
          {rotulo || vacio}
        </span>
        {/* Cuántas van: con el rótulo cortado por el ancho, el número es lo que dice que hay más. */}
        {elegidas.length > 1 && <span className="desp-cuenta">{elegidas.length}</span>}
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

          <ul className="desp-lista" role="listbox" aria-multiselectable>
            {visibles.map((o, i) => {
              const tildada = valores.includes(o.valor)
              return (
                <li key={o.valor}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={tildada}
                    className={`desp-op desp-op--multi${tildada ? ' desp-op--elegida' : ''}${
                      i === foco ? ' desp-op--foco' : ''
                    }`}
                    onMouseEnter={() => setFoco(i)}
                    onClick={() => alternar(o.valor)}
                  >
                    <span className={`desp-tilde${tildada ? ' desp-tilde--on' : ''}`}>
                      <i className="fa-solid fa-check" aria-hidden="true" />
                    </span>
                    <span className="desp-op-txt">
                      <span className="desp-op-rot">{o.rotulo}</span>
                      {o.detalle && <span className="desp-op-det">{o.detalle}</span>}
                    </span>
                  </button>
                </li>
              )
            })}

            {visibles.length === 0 && (
              <li className="desp-vacio">
                {soloAlBuscar && !busqueda.trim()
                  ? `Escribí para buscar entre ${lista.length}.`
                  : 'Nada coincide'}
              </li>
            )}
          </ul>

          {/* Vaciar de una: destildar seis categorías de a una es seis clics. */}
          {elegidas.length > 0 && (
            <button type="button" className="desp-limpiar-todo" onClick={() => onCambiar([])}>
              <i className="fa-solid fa-eraser" aria-hidden="true" /> Quitar todo
            </button>
          )}
        </div>
      )}
    </div>
  )
}
