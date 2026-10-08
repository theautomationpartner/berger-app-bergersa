/**
 * Unir las unidades de un modelo con tractores del inventario.
 *
 * Es la "pantalla partida" de Asignar Inventario de Ferrero (`AsignarView`, `Partida`): una caja por
 * modelo, con la posición arriba; a la izquierda lo vendido que espera tractor, a la derecha lo que
 * hay en el inventario, y en el medio el botón **Unir**, que se habilita con uno elegido de cada
 * lado. Cada par unido queda en su lugar, en verde, con un hilo que va de la unidad a su chasis; lo
 * que se está eligiendo se dibuja con un hilo punteado azul.
 *
 * Lo que cambia respecto de Ferrero es cuándo se escribe. Allá cada Unir va a monday en el momento;
 * acá se une todo el pedido y se guarda junto con "Asignar y crear la entrega", porque el estado del
 * pedido y la entrega salen de cómo quedaron TODAS sus unidades. Por eso, mientras no se guarde, un
 * par se puede deshacer.
 */
import { useLayoutEffect, useRef, useState } from 'react'
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

/**
 * Qué tractor conviene prometer primero: el que está más cerca de poder entregarse.
 *
 * Ferrero ordena por días en stock; acá el dato que distingue un tractor de otro del mismo modelo es
 * dónde está en el circuito de importación, y uno en el galpón se entrega mañana, uno en tránsito en
 * semanas. Es una sugerencia de orden, no una decisión: se puede elegir cualquiera.
 */
const CERCANIA = [
  'stock',
  'nacionalizado',
  'arribado',
  'próximo a arribar',
  'proximo a arribar',
  'en transito',
  'en tránsito',
  'en despachante',
  'confirmación producción',
  'orden de pedido emitida',
]
const cercania = (t: TractorEnStock): number => {
  const i = CERCANIA.indexOf(t.estadoImportacion.trim().toLowerCase())
  return i < 0 ? CERCANIA.length : i
}
export const porCercania = (ts: TractorEnStock[]): TractorEnStock[] =>
  [...ts].sort((a, b) => cercania(a) - cercania(b) || chasisDe(a).localeCompare(chasisDe(b)))

/**
 * La posición del modelo y, aparte, qué hacer (como en Ferrero: "te lo mezcla con la acción").
 * Rojo lo que falta, verde lo que alcanza; el color siempre con su palabra al lado.
 */
function posicion(sinUnir: number, libres: number) {
  const diferencia = libres - sinUnir
  if (sinUnir === 0) return { posicion: 'Cubierto', tonoP: 'chip--verde', accion: null, tonoA: '' }
  if (diferencia < 0) {
    return {
      posicion: 'Vendido',
      tonoP: 'chip--rojo',
      accion: `Pedir ${-diferencia} a fábrica`,
      tonoA: 'chip--rojo',
    }
  }
  return {
    posicion: diferencia > 0 ? 'Con stock' : 'A la par',
    tonoP: 'chip--verde',
    accion: `Unir ${sinUnir}`,
    tonoA: 'chip--azul',
  }
}

type Hilo = { d: string; a: [number, number]; b: [number, number]; sel: boolean }

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

  /* Lo elegido puede dejar de estar: otro pedido se llevó el tractor, o la unidad se unió por "Unir
     en orden". Elegido y ya no está es lo mismo que no elegido. */
  const selIzq = sinUnir.some((u) => u.unidad.id === unidadElegida) ? unidadElegida : null
  const selDer = libres.some((t) => t.id === tractorElegido) ? tractorElegido : null
  const derecha = porCercania(libres)

  const unir = () => {
    if (!selIzq || !selDer) return
    onUnir(selIzq, selDer)
    setUnidadElegida(null)
    setTractorElegido(null)
  }

  /* De a uno, la primera unidad con el tractor más cercano. Con veinte unidades iguales y veinte
     tractores iguales, elegirlos de a pares sería un trámite. */
  const unirEnOrden = () => {
    const cuantos = Math.min(sinUnir.length, derecha.length)
    for (let i = 0; i < cuantos; i += 1) onUnir(sinUnir[i].unidad.id, derecha[i].id)
    setUnidadElegida(null)
    setTractorElegido(null)
  }

  /* ── Los hilos ──
     Se calculan del DOM y no con números fijos, igual que en Ferrero: así siguen a las filas cuando
     la lista cambia o cambia el ancho. En celular las columnas van una abajo de la otra y no se
     dibujan; ahí lo unido se lee por el chasis en verde. */
  const cuerpo = useRef<HTMLDivElement>(null)
  const [hilos, setHilos] = useState<Hilo[]>([])
  const [dim, setDim] = useState({ w: 0, h: 0 })
  /* Qué hay dibujado, en una cadena: si las listas fueran la dependencia del efecto, medir →
     guardar los hilos → volver a dibujar → medir sería un bucle. */
  const disposicion = [
    selIzq,
    selDer,
    unidas.map((u) => `${u.unidad.unidad.id}>${u.tractor.id}`).join(','),
    sinUnir.map((u) => u.unidad.id).join(','),
    derecha.map((t) => t.id).join(','),
  ].join('|')

  useLayoutEffect(() => {
    const el = cuerpo.current
    if (!el) return
    const medir = () => {
      const t = el.getBoundingClientRect()
      const izq = el.querySelector('.unir-col--izq')?.getBoundingClientRect()
      const der = el.querySelector('.unir-col--der')?.getBoundingClientRect()
      if (!izq || !der || der.left < izq.right) {
        setHilos([])
        return
      }
      const y = (e: Element | null) => {
        if (!e) return null
        const r = e.getBoundingClientRect()
        return r.top - t.top + r.height / 2
      }
      const xa = izq.right - t.left
      const xb = der.left - t.left
      const tender = (a: number, b: number, sel: boolean): Hilo => ({
        d: `M ${xa} ${a} C ${xa + 40} ${a}, ${xb - 40} ${b}, ${xb} ${b}`,
        a: [xa, a],
        b: [xb, b],
        sel,
      })
      const nuevos: Hilo[] = []
      for (const u of unidas) {
        const id = u.unidad.unidad.id
        const a = y(el.querySelector(`[data-par="${id}"][data-lado="izq"]`))
        const b = y(el.querySelector(`[data-par="${id}"][data-lado="der"]`))
        if (a !== null && b !== null) nuevos.push(tender(a, b, false))
      }
      const a = y(el.querySelector('.unir-fila--sel[data-lado="izq"]'))
      const b = y(el.querySelector('.unir-fila--sel[data-lado="der"]'))
      if (a !== null && b !== null) nuevos.push(tender(a, b, true))
      setDim({ w: t.width, h: t.height })
      setHilos(nuevos)
    }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disposicion])

  const p = posicion(sinUnir.length, libres.length)
  const listo = Boolean(selIzq && selDer) && !bloqueado
  const ayuda = listo
    ? 'tocá Unir'
    : sinUnir.length === 0
      ? 'todo unido'
      : libres.length === 0
        ? 'sin stock: va a fábrica'
        : selIzq
          ? 'ahora elegí el tractor'
          : selDer
            ? 'ahora elegí la unidad'
            : 'elegí uno de cada lado'

  return (
    <section className="unir" aria-label={modelo}>
      <header className="unir-head">
        <h4 className="unir-modelo">{modelo}</h4>
        <span className="unir-resumen">
          <span className="unir-dato">
            Posición <span className={`chip ${p.tonoP}`}>{p.posicion}</span>
          </span>
          {p.accion && (
            <span className="unir-dato">
              Acción recomendada <span className={`chip ${p.tonoA}`}>{p.accion}</span>
            </span>
          )}
        </span>
      </header>

      <div className="unir-partida" ref={cuerpo}>
        <svg className="unir-hilos" width={dim.w} height={dim.h} aria-hidden="true">
          {hilos.map((h, i) => (
            <g key={i} className={h.sel ? 'unir-hilo unir-hilo--sel' : 'unir-hilo'}>
              <path d={h.d} />
              <circle cx={h.a[0]} cy={h.a[1]} r={4.5} />
              <circle cx={h.b[0]} cy={h.b[1]} r={4.5} />
            </g>
          ))}
        </svg>

        {/* ===== Lo vendido ===== */}
        <div className="unir-col unir-col--izq">
          <div className="unir-col-head">
            <strong>Vendido, pendiente de entrega</strong>
            <span>
              {sinUnir.length + unidas.length} unidad{sinUnir.length + unidas.length === 1 ? '' : 'es'}
            </span>
          </div>
          {unidas.map(({ unidad, tractor }) => (
            <div
              key={unidad.unidad.id}
              className="unir-fila unir-fila--ok"
              data-lado="izq"
              data-par={unidad.unidad.id}
            >
              <span className="unir-marca" aria-hidden="true">
                <i className="fa-solid fa-check" />
              </span>
              <span className="unir-cuerpo">
                <strong>Unidad {unidad.numero}</strong>
                <small>{unidad.unidad.nombre}</small>
                <span className="unir-tags">
                  <span className="chip chip--verde">→ {chasisDe(tractor)}</span>
                </span>
              </span>
              {/* Todavía no se guardó: un par mal unido se suelta acá, sin ir a monday. */}
              <button
                type="button"
                className="unir-quitar"
                disabled={bloqueado}
                aria-label={`Desunir la unidad ${unidad.numero}`}
                title="Desunir"
                onClick={() => onDesunir(unidad.unidad.id)}
              >
                <i className="fa-solid fa-link-slash" aria-hidden="true" />
              </button>
            </div>
          ))}
          {sinUnir.map(({ unidad, numero }) => {
            const sel = selIzq === unidad.id
            return (
              <button
                key={unidad.id}
                type="button"
                className={`unir-fila${sel ? ' unir-fila--sel' : ''}`}
                data-lado="izq"
                aria-pressed={sel}
                disabled={bloqueado}
                onClick={() => setUnidadElegida(sel ? null : unidad.id)}
              >
                <span className="unir-marca" aria-hidden="true">
                  {sel && <i className="fa-solid fa-circle" />}
                </span>
                <span className="unir-cuerpo">
                  <strong>Unidad {numero}</strong>
                  <small>{unidad.nombre}</small>
                </span>
              </button>
            )
          })}
        </div>

        {/* ===== El botón del medio ===== */}
        <div className="unir-medio">
          <button type="button" className="btn btn--primario unir-btn" disabled={!listo} onClick={unir}>
            <i className="fa-solid fa-link" aria-hidden="true" /> Unir
          </button>
          <small aria-live="polite">{ayuda}</small>
          {derecha.length > 0 && sinUnir.length > 1 && (
            <button
              type="button"
              className="btn btn--texto btn--chico"
              disabled={bloqueado}
              onClick={unirEnOrden}
            >
              Unir en orden
            </button>
          )}
        </div>

        {/* ===== El inventario ===== */}
        <div className="unir-col unir-col--der">
          <div className="unir-col-head">
            <strong>En inventario</strong>
            <span>
              {derecha.length} disponible{derecha.length === 1 ? '' : 's'}
            </span>
          </div>
          {unidas.map(({ unidad, tractor }) => (
            <div
              key={unidad.unidad.id}
              className="unir-fila unir-fila--ok"
              data-lado="der"
              data-par={unidad.unidad.id}
            >
              <span className="unir-marca" aria-hidden="true">
                <i className="fa-solid fa-check" />
              </span>
              <span className="unir-cuerpo">
                <strong>{chasisDe(tractor)}</strong>
                <span className="unir-tags">
                  {tractor.numInterno && (
                    <span className="chip chip--gris">N° interno {tractor.numInterno}</span>
                  )}
                  <span className="chip chip--verde">unido · sin guardar</span>
                </span>
              </span>
            </div>
          ))}
          {derecha.map((t) => {
            const sel = selDer === t.id
            return (
              <button
                key={t.id}
                type="button"
                className={`unir-fila${sel ? ' unir-fila--sel' : ''}`}
                data-lado="der"
                aria-pressed={sel}
                disabled={bloqueado}
                onClick={() => setTractorElegido(sel ? null : t.id)}
              >
                <span className="unir-marca" aria-hidden="true">
                  {sel && <i className="fa-solid fa-circle" />}
                </span>
                <span className="unir-cuerpo">
                  <strong>{chasisDe(t)}</strong>
                  <span className="unir-tags">
                    {t.numInterno && <span className="chip chip--gris">N° interno {t.numInterno}</span>}
                    {t.estadoImportacion && (
                      <span className="chip chip--azul">{t.estadoImportacion}</span>
                    )}
                  </span>
                </span>
              </button>
            )
          })}
          {derecha.length === 0 && unidas.length === 0 && (
            /* Que no haya ninguno no es un error: es que ese modelo hay que pedirlo, y conviene que
               se lea así y no como una lista vacía. */
            <p className="unir-vacio">No hay de este modelo sin dueño. Hay que pedirlo a fábrica.</p>
          )}
        </div>
      </div>
    </section>
  )
}
