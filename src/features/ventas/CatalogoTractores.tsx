/**
 * El catálogo del que se eligen los tractores, en lista y con filtros.
 *
 * En tarjetas cada modelo ocupaba media pantalla y veinte modelos eran cuatro pantallazos de
 * scroll: para comparar dos precios había que acordarse del primero. En lista entran todos, y las
 * características —marca, línea, tracción, potencia— quedan donde se las puede recorrer con la
 * vista.
 *
 * Los filtros se arman con lo que hay cargado en el catálogo, no con una lista escrita acá. Es la
 * diferencia entre poder filtrar y tener que adivinar: nadie se acuerda de que existe la gama
 * "Agrofarm 5" hasta que la ve, y obligar a escribirla para encontrarla es pedirle a la persona
 * que sepa de antemano lo que vino a averiguar.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { useClickAfuera } from '@/hooks/useClickAfuera'
import { importe as aMoneda, normalizar } from '@/lib/format'
import type { ProductoDeCatalogo } from '@/services/monday/catalogoVenta'

interface FiltroProps {
  rotulo: string
  valores: string[]
  marcados: string[]
  abierto: boolean
  onAbrir: () => void
  onCerrar: () => void
  /** Cuántos modelos quedarían si además se marcara este valor. */
  cuantosCon: (valor: string) => number
  onAlternar: (valor: string) => void
  onLimpiar: () => void
}

/**
 * Un filtro: el botón con lo que está elegido, y su lista de opciones para tildar.
 *
 * Es de tildar y no de elegir uno: querer ver dos marcas es querer ver las dos, y un desplegable
 * de una sola opción obligaría a filtrar dos veces para comparar.
 */
function FiltroDesplegable({
  rotulo,
  valores,
  marcados,
  abierto,
  onAbrir,
  onCerrar,
  cuantosCon,
  onAlternar,
  onLimpiar,
}: FiltroProps) {
  const caja = useRef<HTMLDivElement>(null)
  useClickAfuera(caja, abierto, onCerrar)

  return (
    <div className="filtro" ref={caja}>
      <button
        type="button"
        className={`filtro-btn${marcados.length > 0 ? ' filtro-btn--puesto' : ''}`}
        aria-expanded={abierto}
        onClick={onAbrir}
      >
        {rotulo}
        {marcados.length > 0 && <span className="btn-contador">{marcados.length}</span>}
        <i className={`fa-solid fa-chevron-${abierto ? 'up' : 'down'}`} aria-hidden="true" />
      </button>

      {abierto && (
        <div className="filtro-panel">
          <div className="filtro-opciones">
            {valores.map((v) => {
              const marcado = marcados.includes(v)
              const cuantos = cuantosCon(v)
              return (
                <label
                  key={v}
                  className={`filtro-op${!marcado && cuantos === 0 ? ' filtro-op--vacia' : ''}`}
                >
                  <input type="checkbox" checked={marcado} onChange={() => onAlternar(v)} />
                  <span className="filtro-op-txt">{v}</span>
                  <span className="filtro-op-num">{cuantos}</span>
                </label>
              )
            })}
          </div>
          {marcados.length > 0 && (
            <button type="button" className="btn btn--texto btn--chico" onClick={onLimpiar}>
              Sacar los de {rotulo.toLowerCase()}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Las características por las que se puede filtrar, en el orden en que se muestran. */
const FACETAS = [
  { clave: 'marca', rotulo: 'Marca' },
  { clave: 'linea', rotulo: 'Línea' },
  { clave: 'gama', rotulo: 'Gama' },
  { clave: 'traccion', rotulo: 'Tracción' },
  { clave: 'potencia', rotulo: 'Potencia' },
  { clave: 'cilindrada', rotulo: 'Cilindrada' },
] as const

type Clave = (typeof FACETAS)[number]['clave']

/** El valor de una faceta para un producto. Vacío = ese producto no entra en ese filtro. */
function valorDe(p: ProductoDeCatalogo, clave: Clave): string {
  switch (clave) {
    case 'marca':
      return p.marca
    case 'linea':
      return p.linea
    case 'gama':
      return p.gama
    case 'traccion':
      return p.traccion
    case 'potencia':
      return p.potenciaKw != null ? `${p.potenciaKw} kW` : ''
    case 'cilindrada':
      return p.cilindrada != null ? `${p.cilindrada} cm³` : ''
  }
}

type Elegidos = Record<Clave, string[]>

const SIN_FILTROS: Elegidos = {
  marca: [],
  linea: [],
  gama: [],
  traccion: [],
  potencia: [],
  cilindrada: [],
}

/**
 * Los valores de una faceta, ordenados.
 *
 * Los números van por número y no alfabéticamente: ordenar "100 kW" antes que "45.6 kW" porque el
 * 1 va antes que el 4 convierte la lista en un acertijo.
 */
function valoresDe(productos: ProductoDeCatalogo[], clave: Clave): string[] {
  const vistos = new Set<string>()
  for (const p of productos) {
    const v = valorDe(p, clave)
    if (v) vistos.add(v)
  }
  const lista = [...vistos]
  const numerico = clave === 'potencia' || clave === 'cilindrada'
  return numerico
    ? lista.sort((a, b) => parseFloat(a) - parseFloat(b))
    : lista.sort((a, b) => a.localeCompare(b, 'es'))
}

interface Props {
  productos: ProductoDeCatalogo[]
  /** Cuántas unidades lleva cada producto. */
  cantidadDe: (id: string) => number
  onCambiarCantidad: (p: ProductoDeCatalogo, delta: number) => void
  onVerFotos: (p: ProductoDeCatalogo) => void
  cargando?: boolean
}

export function CatalogoTractores({
  productos,
  cantidadDe,
  onCambiarCantidad,
  onVerFotos,
  cargando,
}: Props) {
  const [texto, setTexto] = useState('')
  const [elegidos, setElegidos] = useState<Elegidos>(SIN_FILTROS)
  /** Cuál de los desplegables está abierto. Uno solo por vez, como cualquier menú. */
  const [abierto, setAbierto] = useState<Clave | null>(null)
  const cerrar = useCallback(() => setAbierto(null), [])

  const porTexto = useMemo(() => {
    const q = normalizar(texto)
    if (!q) return productos
    return productos.filter((p) =>
      normalizar(`${p.nombre} ${p.modelo} ${p.codigo} ${p.marca} ${p.linea} ${p.gama}`).includes(q),
    )
  }, [productos, texto])

  /* Dentro de una faceta los valores suman —"Deutz-Fahr O Massey"— y entre facetas se cruzan
     —"Deutz-Fahr Y tracción doble"—. Es como lee la gente una lista de filtros: elegir dos marcas
     es querer ver las dos, no ver nada. */
  const visibles = useMemo(
    () =>
      porTexto.filter((p) =>
        FACETAS.every(({ clave }) => {
          const marcados = elegidos[clave]
          return marcados.length === 0 || marcados.includes(valorDe(p, clave))
        }),
      ),
    [porTexto, elegidos],
  )

  /**
   * Cuántos quedarían si además se marcara este valor.
   *
   * Un filtro que lleva a cero resultados es una decepción que se podía avisar antes: acá el
   * número está al lado de la etiqueta, y los que no suman nada se muestran apagados.
   */
  const cuantosCon = (clave: Clave, valor: string): number =>
    porTexto.filter(
      (p) =>
        valorDe(p, clave) === valor &&
        FACETAS.every(({ clave: otra }) => {
          if (otra === clave) return true
          const marcados = elegidos[otra]
          return marcados.length === 0 || marcados.includes(valorDe(p, otra))
        }),
    ).length

  const alternar = (clave: Clave, valor: string) =>
    setElegidos((v) => ({
      ...v,
      [clave]: v[clave].includes(valor)
        ? v[clave].filter((x) => x !== valor)
        : [...v[clave], valor],
    }))

  const cuantosFiltros = FACETAS.reduce((a, { clave }) => a + elegidos[clave].length, 0)

  return (
    <div className="catalogo-lista">
      <div className="catalogo-barra">
        <input
          className="input"
          placeholder="Buscar por modelo, código, marca, línea o gama…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
      </div>

      {/* Un desplegable por característica. Todas las etiquetas a la vez eran cuatro renglones de
          chips —veinte potencias distintas— que ocupaban más que el catálogo que venían a filtrar.
          Acá cada lista se abre sólo si se la pide. */}
      <div className="filtros">
        {FACETAS.map(({ clave, rotulo }) => {
          const valores = valoresDe(productos, clave)
          if (valores.length < 2) return null
          const marcados = elegidos[clave]
          return (
            <FiltroDesplegable
              key={clave}
              rotulo={rotulo}
              valores={valores}
              marcados={marcados}
              abierto={abierto === clave}
              onAbrir={() => setAbierto((v) => (v === clave ? null : clave))}
              onCerrar={cerrar}
              cuantosCon={(v) => cuantosCon(clave, v)}
              onAlternar={(v) => alternar(clave, v)}
              onLimpiar={() => setElegidos((v) => ({ ...v, [clave]: [] }))}
            />
          )
        })}
      </div>

      {/* Lo que está filtrado, junto y en un solo lugar: con los filtros cerrados, ésta es la única
          forma de saber por qué la lista muestra tres modelos y no veintiuno. */}
      {cuantosFiltros > 0 && (
        <div className="filtros-puestos">
          {FACETAS.map(({ clave, rotulo }) =>
            elegidos[clave].map((v) => (
              <button
                key={`${clave}-${v}`}
                type="button"
                className="filtro-chip"
                onClick={() => alternar(clave, v)}
                title={`Sacar el filtro ${rotulo}: ${v}`}
              >
                <small>{rotulo}</small>
                {v}
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            )),
          )}
          <button
            type="button"
            className="btn btn--texto btn--chico"
            onClick={() => setElegidos(SIN_FILTROS)}
          >
            Limpiar todo
          </button>
        </div>
      )}

      <div className="catalogo-cuenta">
        {visibles.length} de {productos.length} modelos
      </div>

      <div className="tractores">
        {visibles.map((p) => {
          const q = cantidadDe(p.id)
          return (
            <div key={p.id} className={`tractor${q > 0 ? ' tractor--elegido' : ''}`}>
              <div className="tractor-datos">
                <span className="tractor-nom">
                  {p.modelo || p.nombre}
                  {p.codigo && <small>{p.codigo}</small>}
                </span>
                <div className="tractor-chips">
                  {p.marca && <span className="chip chip--gris">{p.marca}</span>}
                  {p.linea && <span className="chip chip--gris">{p.linea}</span>}
                  {p.gama && <span className="chip chip--gris">{p.gama}</span>}
                  {p.traccion && <span className="chip chip--gris">{p.traccion}</span>}
                  {p.potenciaKw != null && (
                    <span className="chip chip--gris">{p.potenciaKw} kW</span>
                  )}
                  {p.cilindrada != null && (
                    <span className="chip chip--gris">{p.cilindrada} cm³</span>
                  )}
                  {p.rodado && <span className="chip chip--gris">Rodado {p.rodado}</span>}
                </div>
              </div>

              <span className="tractor-precio">
                {aMoneda(p.precio)}
                <small>+ IVA {p.iva}%</small>
              </span>

              <span className="tractor-acciones">
                <button
                  type="button"
                  className="btn btn--texto btn--chico"
                  disabled={p.imagenes.length === 0}
                  title={p.imagenes.length === 0 ? 'Sin fotos cargadas' : 'Ver las fotos'}
                  onClick={() => onVerFotos(p)}
                >
                  <i className="fa-solid fa-image" aria-hidden="true" />
                  {p.imagenes.length > 0 && ` ${p.imagenes.length}`}
                </button>

                {q > 0 ? (
                  <span className="contador">
                    <button
                      type="button"
                      aria-label="Uno menos"
                      onClick={() => onCambiarCantidad(p, -1)}
                    >
                      −
                    </button>
                    <b>{q}</b>
                    <button
                      type="button"
                      aria-label="Uno más"
                      onClick={() => onCambiarCantidad(p, 1)}
                    >
                      +
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn btn--borde btn--chico"
                    onClick={() => onCambiarCantidad(p, 1)}
                  >
                    Agregar
                  </button>
                )}
              </span>
            </div>
          )
        })}

        {visibles.length === 0 && !cargando && (
          <div className="aviso aviso--neutro">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <span>
              Ningún tractor coincide con lo que estás buscando.
              {cuantosFiltros > 0 && ' Probá sacando algún filtro.'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
