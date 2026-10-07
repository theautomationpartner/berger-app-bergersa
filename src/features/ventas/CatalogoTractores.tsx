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
import { useMemo, useState } from 'react'
import { importe as aMoneda } from '@/lib/format'
import { normalizar } from '@/lib/format'
import type { ProductoDeCatalogo } from '@/services/monday/catalogoVenta'

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
  const [abiertos, setAbiertos] = useState(false)

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
        <button
          type="button"
          className={`btn btn--borde btn--chico${abiertos || cuantosFiltros > 0 ? ' btn--activo' : ''}`}
          aria-expanded={abiertos}
          onClick={() => setAbiertos((v) => !v)}
        >
          <i className="fa-solid fa-sliders" aria-hidden="true" /> Filtros
          {cuantosFiltros > 0 && <span className="btn-contador">{cuantosFiltros}</span>}
        </button>
      </div>

      {(abiertos || cuantosFiltros > 0) && (
        <div className="facetas">
          {FACETAS.map(({ clave, rotulo }) => {
            const valores = valoresDe(productos, clave)
            if (valores.length < 2) return null
            return (
              <div key={clave} className="faceta">
                <span className="faceta-rotulo">{rotulo}</span>
                <div className="faceta-valores">
                  {valores.map((v) => {
                    const marcado = elegidos[clave].includes(v)
                    const cuantos = cuantosCon(clave, v)
                    return (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={marcado}
                        className={`faceta-op${marcado ? ' faceta-op--si' : ''}${
                          !marcado && cuantos === 0 ? ' faceta-op--vacia' : ''
                        }`}
                        onClick={() => alternar(clave, v)}
                      >
                        {v}
                        <small>{cuantos}</small>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {cuantosFiltros > 0 && (
            <button
              type="button"
              className="btn btn--texto btn--chico"
              onClick={() => setElegidos(SIN_FILTROS)}
            >
              Limpiar los filtros
            </button>
          )}
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
