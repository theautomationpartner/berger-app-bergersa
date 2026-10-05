/**
 * Buscador de operaciones.
 *
 * Con cinco operaciones repartidas en dos áreas y tres niveles, llegar a "Cargar turno de
 * contenedor" son cuatro clics y saber de antemano que vive dentro de DESPACHO DE ADUANA, en la
 * sección del despachante. Quien usa la app todos los días ya sabe a dónde va: escribe dos letras
 * y entra.
 *
 * Sólo busca entre las operaciones que este perfil **puede abrir**: ofrecer una pantalla que va a
 * rebotar es peor que no ofrecerla, y encima delata qué hay adentro de la app a quien no entra.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { buscarDestinos, type Destino } from '@/lib/catalogo'

interface Props {
  destinos: Destino[]
  onIr: (destino: Destino) => void
  /** Texto del campo vacío. */
  vacio?: string
  /** Enfoca el campo al montarse. Lo usa el panel lateral, que se abre para buscar. */
  autoFoco?: boolean
}

export function Buscador({ destinos, onIr, vacio, autoFoco }: Props) {
  const [texto, setTexto] = useState('')
  const [resaltado, setResaltado] = useState(0)
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFoco) campo.current?.focus()
  }, [autoFoco])

  const resultados = useMemo(() => buscarDestinos(destinos, texto).slice(0, 8), [destinos, texto])

  useEffect(() => {
    setResaltado(0)
  }, [texto])

  const ir = (d: Destino) => {
    setTexto('')
    onIr(d)
  }

  /* Las flechas y Enter: quien escribe para no usar el mouse tampoco quiere soltarlo para elegir. */
  const teclas = (e: React.KeyboardEvent) => {
    if (resultados.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setResaltado((i) => (i + 1) % resultados.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setResaltado((i) => (i - 1 + resultados.length) % resultados.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      ir(resultados[resaltado])
    } else if (e.key === 'Escape') {
      setTexto('')
    }
  }

  return (
    <div className="buscador">
      <div className="buscador-campo">
        <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
        <input
          ref={campo}
          className="buscador-input"
          type="search"
          value={texto}
          placeholder={vacio ?? 'Buscá una operación: contenedores, VEP, CUIT, drafts…'}
          aria-label="Buscar una operación"
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={teclas}
        />
        {texto && (
          <button
            type="button"
            className="buscador-limpiar"
            aria-label="Limpiar la búsqueda"
            onClick={() => {
              setTexto('')
              campo.current?.focus()
            }}
          >
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        )}
      </div>

      {texto.trim() && (
        <div className="buscador-resultados">
          {resultados.length === 0 ? (
            <div className="buscador-vacio">
              No hay ninguna operación que se llame así. Probá con una palabra suelta: contenedor,
              pago, draft, cuenta.
            </div>
          ) : (
            resultados.map((d, i) => (
              <button
                key={d.id}
                type="button"
                className={`buscador-item${i === resaltado ? ' buscador-item--on' : ''}`}
                onMouseEnter={() => setResaltado(i)}
                onClick={() => ir(d)}
              >
                <span className="buscador-item-ic">
                  <i className={d.icono} aria-hidden="true" />
                </span>
                <span className="buscador-item-txt">
                  <span className="buscador-item-tit">{d.titulo}</span>
                  {/* Dónde vive: con dos "ACTUALIZAR OP" en la app, el título solo no alcanza. */}
                  <span className="buscador-item-donde">{d.donde}</span>
                </span>
                <i className="fa-solid fa-arrow-right buscador-item-flecha" aria-hidden="true" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
