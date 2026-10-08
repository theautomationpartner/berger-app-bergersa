/**
 * Unir las unidades de un modelo con tractores del inventario.
 *
 * Dos columnas enfrentadas —lo que se pidió a la izquierda, lo que hay a la derecha— y un botón
 * **Unir** en el medio que se habilita con uno elegido de cada lado. Cada par unido baja a la lista
 * de abajo con una flecha que dice qué unidad se cumple con qué chasis, y se puede deshacer.
 *
 * Es la misma mecánica de "Asignar inventario" de Ferrero, y no un desplegable por unidad, porque
 * acá la decisión es de a pares: con un desplegable, ver qué tractores quedan libres obligaba a
 * abrir cada uno, y la unidad que iba a fábrica no se distinguía de la que todavía nadie miró.
 */
import { useState } from 'react'
import type { TractorEnStock, UnidadLeida } from '@/services/monday/pedidosBerger'

export interface UnidadNumerada {
  unidad: UnidadLeida
  /** Su número dentro del pedido, para nombrarla: "unidad 2". */
  numero: number
}

interface Props {
  /** El modelo, tal como se lee. */
  modelo: string
  /** Las unidades de este modelo que todavía no tienen tractor. */
  sinUnir: UnidadNumerada[]
  /** Las que ya se unieron en esta pantalla, con su tractor. */
  unidas: { unidad: UnidadNumerada; tractor: TractorEnStock }[]
  /** Los tractores de este modelo que se pueden prometer y nadie eligió todavía. */
  libres: TractorEnStock[]
  onUnir: (unidadId: string, tractorId: string) => void
  onDesunir: (unidadId: string) => void
  bloqueado?: boolean
}

/** Lo que distingue a un tractor de otro del mismo modelo: el chasis, y si no hay, su nombre. */
export const chasisDe = (t: TractorEnStock): string => t.chasis || t.nombre

/** Qué conviene hacer con este modelo, en una frase. */
function accionRecomendada(sinUnir: number, libres: number): { texto: string; tono: string } {
  if (sinUnir === 0) return { texto: 'Listo', tono: 'chip--verde' }
  if (libres === 0) return { texto: `Pedir ${sinUnir} a fábrica`, tono: 'chip--rojo' }
  if (libres >= sinUnir) return { texto: `Unir ${sinUnir}`, tono: 'chip--azul' }
  return {
    texto: `Unir ${libres} · pedir ${sinUnir - libres} a fábrica`,
    tono: 'chip--ambar',
  }
}

export function UnirUnidades({
  modelo,
  sinUnir,
  unidas,
  libres,
  onUnir,
  onDesunir,
  bloqueado,
}: Props) {
  const [unidadElegida, setUnidadElegida] = useState<string | null>(null)
  const [tractorElegido, setTractorElegido] = useState<string | null>(null)

  /* Lo elegido puede dejar de estar: otro modelo u otro pedido se llevó el tractor, o la unidad se
     unió por "Unir en orden". Elegido y ya no está es lo mismo que no elegido. */
  const unidadOk = sinUnir.some((u) => u.unidad.id === unidadElegida) ? unidadElegida : null
  const tractorOk = libres.some((t) => t.id === tractorElegido) ? tractorElegido : null

  const unir = () => {
    if (!unidadOk || !tractorOk) return
    onUnir(unidadOk, tractorOk)
    setUnidadElegida(null)
    setTractorElegido(null)
  }

  /* De a uno, en el orden en que aparecen. Es lo que haría cualquiera con veinte unidades del
     mismo modelo y veinte tractores iguales: elegirlos de a pares sería un trámite. */
  const unirEnOrden = () => {
    const cuantos = Math.min(sinUnir.length, libres.length)
    for (let i = 0; i < cuantos; i += 1) onUnir(sinUnir[i].unidad.id, libres[i].id)
    setUnidadElegida(null)
    setTractorElegido(null)
  }

  const accion = accionRecomendada(sinUnir.length, libres.length)
  const total = sinUnir.length + unidas.length

  return (
    <div className="unir">
      <div className="unir-head">
        <span className="unir-modelo">{modelo}</span>
        <span className="unir-resumen">
          <span className="unir-dato">
            Pedidas <span className="chip chip--gris">{total}</span>
          </span>
          <span className="unir-dato">
            Unidas <span className="chip chip--verde">{unidas.length}</span>
          </span>
          <span className="unir-dato">
            Acción recomendada <span className={`chip ${accion.tono}`}>{accion.texto}</span>
          </span>
        </span>
      </div>

      {sinUnir.length > 0 && (
        <div className="unir-cuerpo">
          {/* ===== Lo pedido ===== */}
          <div className="unir-col">
            <div className="unir-col-head">
              <b>Del pedido, sin tractor</b>
              <span>
                {sinUnir.length} unidad{sinUnir.length === 1 ? '' : 'es'}
              </span>
            </div>
            <ul className="unir-lista" role="radiogroup" aria-label={`Unidades de ${modelo}`}>
              {sinUnir.map(({ unidad, numero }) => {
                const elegida = unidadOk === unidad.id
                return (
                  <li key={unidad.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={elegida}
                      className={`unir-item${elegida ? ' unir-item--elegido' : ''}`}
                      disabled={bloqueado}
                      onClick={() => setUnidadElegida(elegida ? null : unidad.id)}
                    >
                      <span className="unir-radio" aria-hidden="true" />
                      <span className="unir-item-txt">
                        <b>Unidad {numero}</b>
                        <small>{unidad.nombre}</small>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>

          {/* ===== El botón del medio ===== */}
          <div className="unir-medio">
            <button
              type="button"
              className="btn btn--primario unir-btn"
              disabled={bloqueado || !unidadOk || !tractorOk}
              onClick={unir}
            >
              <i className="fa-solid fa-link" aria-hidden="true" /> Unir
            </button>
            <span className="unir-ayuda">
              {libres.length === 0
                ? 'sin stock: van a fábrica'
                : !unidadOk && !tractorOk
                  ? 'elegí uno de cada lado'
                  : !unidadOk
                    ? 'falta la unidad'
                    : !tractorOk
                      ? 'falta el tractor'
                      : 'listo para unir'}
            </span>
            {libres.length > 0 && sinUnir.length > 1 && (
              <button
                type="button"
                className="btn btn--texto btn--chico"
                disabled={bloqueado}
                onClick={unirEnOrden}
              >
                <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" /> Unir en orden
              </button>
            )}
          </div>

          {/* ===== Lo que hay ===== */}
          <div className="unir-col">
            <div className="unir-col-head">
              <b>En inventario</b>
              <span>
                {libres.length} disponible{libres.length === 1 ? '' : 's'}
              </span>
            </div>
            {libres.length === 0 ? (
              /* Que no haya ninguno no es un error: es que ese modelo hay que pedirlo, y conviene
                 que se lea así y no como una lista vacía. */
              <p className="unir-vacio">No hay de este modelo sin dueño. Hay que pedirlo a fábrica.</p>
            ) : (
              <ul className="unir-lista" role="radiogroup" aria-label={`Inventario de ${modelo}`}>
                {libres.map((t) => {
                  const elegido = tractorOk === t.id
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={elegido}
                        className={`unir-item${elegido ? ' unir-item--elegido' : ''}`}
                        disabled={bloqueado}
                        onClick={() => setTractorElegido(elegido ? null : t.id)}
                      >
                        <span className="unir-radio" aria-hidden="true" />
                        <span className="unir-item-txt">
                          <b>{chasisDe(t)}</b>
                          <small>
                            {[t.numInterno && `N° interno ${t.numInterno}`, t.modelo]
                              .filter(Boolean)
                              .join(' · ') || 'Sin número interno'}
                          </small>
                        </span>
                        {t.estadoImportacion && (
                          <span className="chip chip--gris unir-item-chip">
                            {t.estadoImportacion}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ===== Lo que ya quedó unido ===== */}
      {unidas.length > 0 && (
        <ul className="unir-pares">
          {unidas.map(({ unidad, tractor }) => (
            <li key={unidad.unidad.id} className="unir-par">
              <span className="unir-par-lado">
                <b>Unidad {unidad.numero}</b>
                <small>{unidad.unidad.nombre}</small>
              </span>
              <i className="fa-solid fa-arrow-right-long unir-par-flecha" aria-hidden="true" />
              <span className="unir-par-lado">
                <b>{chasisDe(tractor)}</b>
                <small>
                  {[tractor.numInterno && `N° interno ${tractor.numInterno}`, tractor.estadoImportacion]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              </span>
              <button
                type="button"
                className="unir-par-quitar"
                disabled={bloqueado}
                aria-label={`Desunir la unidad ${unidad.numero}`}
                title="Desunir"
                onClick={() => onDesunir(unidad.unidad.id)}
              >
                <i className="fa-solid fa-link-slash" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
