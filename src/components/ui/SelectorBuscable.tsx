/**
 * Buscador de una lista larga: se escribe en la misma barra y las coincidencias aparecen debajo.
 *
 * Es distinto del `Desplegable`, que sirve para listas cerradas y cortas —cuatro condiciones
 * fiscales, seis categorías— donde lo natural es desplegar y elegir. Acá la lista son las cuentas
 * o los contactos del CRM: crecen sin techo, nadie las recorre con la vista, y la única forma
 * razonable de llegar a una es escribiendo.
 *
 * El `Desplegable` resolvía eso abriendo un panel con **otra** barra adentro, así que había que
 * tocar el campo, esperar el panel y recién ahí escribir. Acá se escribe donde está el cursor.
 *
 * Cada coincidencia muestra su dato distintivo debajo del nombre —el CUIT de una cuenta, el mail
 * de un contacto—: en un padrón hay tres "Estape" y lo que los separa no es el nombre.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useClickAfuera } from '@/hooks/useClickAfuera'
import { usePanelQueEntra } from '@/hooks/usePanelQueEntra'

export interface OpcionBuscable {
  valor: string
  rotulo: string
  /** La segunda línea: lo que distingue a esta de otra que se llama parecido. */
  detalle?: string
  /**
   * Texto adicional por el que también se encuentra, sin mostrarse.
   *
   * Lo que se ve y por lo que se busca no son lo mismo: el CUIT se muestra con guiones y hay que
   * poder encontrarlo escribiéndolo sin ellos, y a un contacto se lo busca por el apellido suelto
   * aunque en pantalla diga el nombre completo.
   */
  busqueda?: string
}

/** Sin tildes y en minúsculas: nadie escribe "Martínez" con tilde en un buscador. */
const normalizar = (texto: string): string =>
  texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

function coincidencias(
  opciones: OpcionBuscable[],
  texto: string,
  limite: number,
): OpcionBuscable[] {
  const q = normalizar(texto.trim())
  if (!q) return []
  const palabras = q.split(/\s+/).filter(Boolean)
  const donde = (o: OpcionBuscable) =>
    normalizar(`${o.rotulo} ${o.detalle ?? ''} ${o.busqueda ?? ''}`)

  /* Primero las que EMPIEZAN con lo tipeado: buscando "tap", "TAPIR" interesa más que "salTAPe". */
  const peso = (o: OpcionBuscable) => (normalizar(o.rotulo).startsWith(palabras[0]) ? 1 : 0)

  return opciones
    .filter((o) => palabras.every((p) => donde(o).includes(p)))
    .map((o, orden) => ({ o, orden, peso: peso(o) }))
    .sort((a, b) => b.peso - a.peso || a.orden - b.orden)
    .slice(0, limite)
    .map((x) => x.o)
}

interface Comun {
  opciones: OpcionBuscable[]
  bloqueado?: boolean
  /** Qué se lee en la barra vacía. */
  vacio?: string
  /** Cómo se llama lo que se busca, para el contador: "clientes", "contactos". */
  queSon?: string
  /** Cuántas coincidencias se muestran. Más que esto y la lista deja de ayudar. */
  limite?: number
  id?: string
}

interface PropsUno extends Comun {
  valor: string
  onCambiar: (valor: string) => void
}

/** Elegir UNO de una lista larga. */
export function SelectorBuscable({
  valor,
  opciones,
  onCambiar,
  bloqueado,
  vacio = 'Escribí para buscar',
  queSon,
  limite = 8,
  id,
}: PropsUno) {
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [foco, setFoco] = useState(0)
  const caja = useRef<HTMLDivElement>(null)
  /* Si abajo no hay lugar, el panel se abre para arriba (o hacia el otro costado). */
  const panel = usePanelQueEntra<HTMLDivElement>(abierto && Boolean(texto.trim()))
  const campo = useRef<HTMLInputElement>(null)

  useClickAfuera(caja, abierto, () => setAbierto(false))

  const elegida = opciones.find((o) => o.valor === valor)
  const resultados = useMemo(
    () => coincidencias(opciones, texto, limite),
    [opciones, texto, limite],
  )

  useEffect(() => setFoco(0), [texto])

  const elegir = (o: OpcionBuscable) => {
    onCambiar(o.valor)
    setTexto('')
    setAbierto(false)
  }

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setAbierto(false)
      return
    }
    if (resultados.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFoco((i) => (i + 1) % resultados.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFoco((i) => (i - 1 + resultados.length) % resultados.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      elegir(resultados[foco])
    }
  }

  /* Con algo elegido, la barra se reemplaza por una ficha: un buscador vacío encima de lo que ya
     se eligió se lee como "todavía falta buscar". */
  if (elegida && !abierto) {
    return (
      <div className="buscable">
        <div className="buscable-elegida">
          <i className="fa-solid fa-circle-check" aria-hidden="true" />
          <span className="buscable-elegida-txt">
            <span className="buscable-elegida-rot">{elegida.rotulo}</span>
            {elegida.detalle && <span className="buscable-elegida-det">{elegida.detalle}</span>}
          </span>
          <button
            type="button"
            className="buscable-quitar"
            disabled={bloqueado}
            onClick={() => {
              onCambiar('')
              setTexto('')
              setAbierto(true)
              /* El foco va al campo que acaba de aparecer: es lo siguiente que se va a usar. */
              setTimeout(() => campo.current?.focus(), 0)
            }}
          >
            Cambiar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="buscable" ref={caja}>
      <div className={`buscable-barra${abierto && texto ? ' buscable-barra--abierta' : ''}`}>
        <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
        <input
          id={id}
          ref={campo}
          className="buscable-input"
          type="text"
          autoComplete="off"
          disabled={bloqueado}
          value={texto}
          placeholder={vacio}
          onChange={(e) => {
            setTexto(e.target.value)
            setAbierto(true)
          }}
          onFocus={() => setAbierto(true)}
          onKeyDown={teclas}
        />
        {queSon && (
          <span className="buscable-cuantas">
            {opciones.length} {queSon}
          </span>
        )}
      </div>

      {abierto && texto.trim() && (
        <div ref={panel} className="buscable-lista">
          {resultados.length === 0 ? (
            <div className="buscable-vacio">No hay ninguno que coincida con «{texto.trim()}».</div>
          ) : (
            resultados.map((o, i) => (
              <button
                key={o.valor}
                type="button"
                className={`buscable-op${i === foco ? ' buscable-op--foco' : ''}`}
                onMouseEnter={() => setFoco(i)}
                onClick={() => elegir(o)}
              >
                <span className="buscable-op-rot">{o.rotulo}</span>
                {o.detalle && <span className="buscable-op-det">{o.detalle}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

interface PropsVarios extends Comun {
  valores: string[]
  onCambiar: (valores: string[]) => void
  /**
   * Fichas grandes, con el dato que distingue adentro.
   *
   * Para listas de dos o tres —las cuentas de un contacto— la pastilla chica deja afuera
   * justamente lo que hace falta para estar seguro de cuál es: el CUIT. Para listas largas la
   * pastilla sigue siendo lo correcto, porque ocho fichas grandes tapan el formulario.
   */
  fichasGrandes?: boolean
}

/**
 * Elegir VARIOS de una lista larga.
 *
 * Lo elegido queda arriba como fichas, no adentro de la barra: con tres o cuatro, el texto no
 * entra y la barra deja de servir para escribir, que es para lo único que está.
 */
export function SelectorBuscableMulti({
  valores,
  opciones,
  onCambiar,
  bloqueado,
  vacio = 'Escribí para buscar',
  queSon,
  limite = 8,
  fichasGrandes,
  id,
}: PropsVarios) {
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [foco, setFoco] = useState(0)
  const caja = useRef<HTMLDivElement>(null)
  /* Si abajo no hay lugar, el panel se abre para arriba (o hacia el otro costado). */
  const panel = usePanelQueEntra<HTMLDivElement>(abierto && Boolean(texto.trim()))

  useClickAfuera(caja, abierto, () => setAbierto(false))

  const elegidas = opciones.filter((o) => valores.includes(o.valor))
  /* Lo ya elegido no vuelve a aparecer en las coincidencias: tildarlo dos veces no hace nada y
     ocupa el lugar de algo que sí falta elegir. */
  const resultados = useMemo(
    () =>
      coincidencias(
        opciones.filter((o) => !valores.includes(o.valor)),
        texto,
        limite,
      ),
    [opciones, valores, texto, limite],
  )

  useEffect(() => setFoco(0), [texto])

  const sumar = (o: OpcionBuscable) => {
    onCambiar([...valores, o.valor])
    setTexto('')
  }

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setAbierto(false)
      return
    }
    if (resultados.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFoco((i) => (i + 1) % resultados.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFoco((i) => (i - 1 + resultados.length) % resultados.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      sumar(resultados[foco])
    }
  }

  return (
    <div className="buscable" ref={caja}>
      {elegidas.length > 0 && (
        <div className={`buscable-fichas${fichasGrandes ? ' buscable-fichas--grandes' : ''}`}>
          {elegidas.map((o) => (
            <span
              key={o.valor}
              className={`buscable-ficha${fichasGrandes ? ' buscable-ficha--grande' : ''}`}
            >
              {fichasGrandes ? (
                <span className="buscable-ficha-txt">
                  <span className="buscable-ficha-rot">{o.rotulo}</span>
                  {o.detalle && <span className="buscable-ficha-det">{o.detalle}</span>}
                </span>
              ) : (
                o.rotulo
              )}
              <button
                type="button"
                aria-label={`Quitar ${o.rotulo}`}
                disabled={bloqueado}
                onClick={() => onCambiar(valores.filter((v) => v !== o.valor))}
              >
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className={`buscable-barra${abierto && texto ? ' buscable-barra--abierta' : ''}`}>
        <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
        <input
          id={id}
          className="buscable-input"
          type="text"
          autoComplete="off"
          disabled={bloqueado}
          value={texto}
          placeholder={vacio}
          onChange={(e) => {
            setTexto(e.target.value)
            setAbierto(true)
          }}
          onFocus={() => setAbierto(true)}
          onKeyDown={teclas}
        />
        {queSon && (
          <span className="buscable-cuantas">
            {opciones.length} {queSon}
          </span>
        )}
      </div>

      {abierto && texto.trim() && (
        <div ref={panel} className="buscable-lista">
          {resultados.length === 0 ? (
            <div className="buscable-vacio">No hay ninguno que coincida con «{texto.trim()}».</div>
          ) : (
            resultados.map((o, i) => (
              <button
                key={o.valor}
                type="button"
                className={`buscable-op${i === foco ? ' buscable-op--foco' : ''}`}
                onMouseEnter={() => setFoco(i)}
                onClick={() => sumar(o)}
              >
                <span className="buscable-op-rot">{o.rotulo}</span>
                {o.detalle && <span className="buscable-op-det">{o.detalle}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
