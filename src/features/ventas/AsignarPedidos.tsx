/**
 * VENTA · Asignar pedidos. Es de BERGER.
 *
 * El pedido ya está aprobado; lo que falta es con qué tractor se cumple cada unidad. Se resuelve de
 * a una y no de a pedido porque la realidad es de a una: dos unidades del mismo modelo, una que
 * sale del galpón y otra que hay que pedirle a fábrica, es el caso normal.
 *
 * Se unen de a pares, modelo por modelo: las unidades pedidas de un lado, los tractores del
 * inventario del otro, y un botón Unir en el medio (ver UnirUnidades). Lo que se ofrece son los
 * tractores del mismo modelo que todavía no tienen dueño, descontando los que ya se unieron en esta
 * pantalla —en este pedido o en otro—: sin eso, dos unidades se llevarían el mismo chasis y el error
 * aparecería el día de la entrega.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSalidaProtegida } from '@/hooks/useSalidaProtegida'
import { ESTADO_PEDIDO } from '@/services/monday/columns'
import {
  asignarPedido,
  pedidosCargados,
  sePuedePrometer,
  tractoresEnStock,
  unidadesDeVenta,
  type PedidoLeido,
  type TractorEnStock,
  type UnidadLeida,
} from '@/services/monday/pedidosBerger'
import { SinAcceso } from '@/services/monday/sdk'
import { TarjetaPedido } from './TarjetaPedido'
import { UnirUnidades, type UnidadNumerada } from './UnirUnidades'

const mensaje = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** Qué se eligió para cada unidad: el id de un tractor, o `''` para pedirla a fábrica. */
type Eleccion = Record<string, string>

/** Las unidades de un pedido agrupadas por modelo, en el orden en que aparecen. */
function porModelo(unidades: UnidadLeida[]): { catalogoId: string; modelo: string; unidades: UnidadNumerada[] }[] {
  const grupos = new Map<string, { catalogoId: string; modelo: string; unidades: UnidadNumerada[] }>()
  unidades.forEach((unidad, i) => {
    /* Sin conexión al catálogo no hay con qué compararla: va sola, para que se vea y vaya a fábrica. */
    const clave = unidad.catalogoId || `sin-modelo-${unidad.id}`
    const g = grupos.get(clave) ?? {
      catalogoId: unidad.catalogoId,
      modelo: unidad.catalogoNombre || 'Sin modelo del catálogo',
      unidades: [],
    }
    g.unidades.push({ unidad, numero: i + 1 })
    grupos.set(clave, g)
  })
  return [...grupos.values()]
}

export function AsignarPedidos() {
  const [pedidos, setPedidos] = useState<PedidoLeido[]>([])
  const [unidades, setUnidades] = useState<UnidadLeida[]>([])
  const [stock, setStock] = useState<TractorEnStock[]>([])

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [elegido, setElegido] = useState<Eleccion>({})
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])
  /* Guardar pide el sí antes de escribir, como el "¿Asignar esta máquina?" de Ferrero: desde la
     app no se desasigna, y lo que quede sin tractor se pide a fábrica. */
  const [confirmando, setConfirmando] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [ps, us, ts] = await Promise.all([
        pedidosCargados(),
        unidadesDeVenta(),
        tractoresEnStock(),
      ])
      setPedidos(ps)
      setUnidades(us)
      setStock(ts)
    } catch (e) {
      setError(
        e instanceof SinAcceso
          ? 'la app tiene que abrirse desde monday para leer el inventario.'
          : mensaje(e),
      )
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void recargar()
  }, [recargar])

  /* Sólo los aprobados: asignarle inventario a un pedido que todavía no se aprobó sería
     comprometer tractores por una venta que puede no existir. */
  const aprobados = useMemo(
    () =>
      pedidos
        .filter((p) => p.estado === ESTADO_PEDIDO.APROBADO)
        .sort(
          (a, b) => a.fechaAprobacion.localeCompare(b.fechaAprobacion) || a.id.localeCompare(b.id),
        ),
    [pedidos],
  )

  const libres = useMemo(() => stock.filter(sePuedePrometer), [stock])
  const porId = useMemo(() => new Map(stock.map((t) => [t.id, t])), [stock])

  /* Los tractores que ya se unieron acá, en cualquier pedido: no se ofrecen de nuevo. */
  const tomados = useMemo(() => new Set(Object.values(elegido).filter(Boolean)), [elegido])
  const hayUnidas = tomados.size > 0

  /* Salir con pares unidos y sin guardar los pierde; salir mientras se escribe deja unidades
     asignadas sin su tractor marcado, o sin la entrega. Las dos cosas se preguntan antes. */
  useSalidaProtegida(
    trabajando
      ? 'Se está asignando en monday: cada unidad, su tractor en el inventario y la entrega. Si salís ahora puede quedar a medias.'
      : hayUnidas
        ? 'Tenés tractores unidos que todavía no se guardaron. Si salís, se pierden y hay que volver a unirlos.'
        : null,
  )

  /* Las unidades que todavía no tienen tractor: es el trabajo que queda, y no se ve sumando
     pedidos porque un pedido puede tener una asignada y otra no. */
  const porAsignar = useMemo(
    () =>
      unidades.filter((u) => aprobados.some((p) => p.id === u.pedidoId) && !u.inventarioId).length,
    [unidades, aprobados],
  )

  const asignar = async (p: PedidoLeido) => {
    setTrabajando(p.id)
    setHecho(null)
    setAvisos([])
    try {
      const suyas = unidades.filter((u) => u.pedidoId === p.id)
      const r = await asignarPedido(
        p,
        suyas,
        suyas.map((u) => ({ unidadId: u.id, tractorId: elegido[u.id] ?? '' })),
      )
      setHecho(
        [
          r.asignadas > 0 && `${r.asignadas} unidad${r.asignadas === 1 ? '' : 'es'} con tractor`,
          r.aFabrica > 0 && `${r.aFabrica} pedida${r.aFabrica === 1 ? '' : 's'} a fábrica`,
          r.entregaId && 'y la entrega creada',
        ]
          .filter(Boolean)
          .join(', ') + '.',
      )
      setAvisos(r.advertencias)
      /* Sólo lo de este pedido: lo unido en los otros sigue esperando su propio botón. */
      setElegido((e) => {
        const quedan = { ...e }
        for (const u of suyas) delete quedan[u.id]
        return quedan
      })
      await recargar()
    } catch (e) {
      setError(mensaje(e))
    } finally {
      setTrabajando(null)
    }
  }

  return (
    <div className="scroll">
      <div className="view">
        <div className="sec-head">
          <span className="sec-num">
            <i className="fa-solid fa-warehouse" aria-hidden="true" />
          </span>
          <span className="sec-txt">
            <span className="sec-tit">Asignar pedidos</span>
            <span className="sec-det">
              Unir cada unidad aprobada con un tractor del inventario, o pedirla a fábrica.
            </span>
          </span>
        </div>

        <div className="tableros">
          <div className="tablero tablero--verde">
            <span className="tablero-ic">
              <i className="fa-solid fa-circle-check" aria-hidden="true" />
            </span>
            <span className="tablero-num">{aprobados.length}</span>
            <span className="tablero-txt">
              aprobados
              <small>esperando inventario</small>
            </span>
          </div>
          <div className="tablero tablero--azul">
            <span className="tablero-ic">
              <i className="fa-solid fa-warehouse" aria-hidden="true" />
            </span>
            <span className="tablero-num">{libres.length}</span>
            <span className="tablero-txt">
              tractores sin dueño
              <small>de {stock.length} en el inventario</small>
            </span>
          </div>
          <div className="tablero tablero--violeta">
            <span className="tablero-ic">
              <i className="fa-solid fa-boxes-stacked" aria-hidden="true" />
            </span>
            <span className="tablero-num">{porAsignar}</span>
            <span className="tablero-txt">
              unidades por asignar
              <small>de todos los pedidos aprobados</small>
            </span>
          </div>
          <button
            type="button"
            className="btn btn--texto btn--chico"
            disabled={cargando}
            onClick={() => void recargar()}
          >
            <i className="fa-solid fa-rotate" aria-hidden="true" /> Actualizar
          </button>
        </div>

        {error && (
          <div className="aviso aviso--error">
            <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
        {hecho && (
          <div className="aviso aviso--ok">
            <i className="fa-solid fa-circle-check" aria-hidden="true" />
            <span>{hecho}</span>
          </div>
        )}
        {avisos.length > 0 && (
          <div className="aviso aviso--alerta">
            <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
            <span>
              Quedó algo a medias:
              <ul className="lista-compacta">
                {avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </span>
          </div>
        )}

        {cargando && (
          <div className="aviso aviso--neutro">
            <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
            <span>Buscando los pedidos aprobados y el inventario…</span>
          </div>
        )}

        {!cargando && aprobados.length === 0 && !error && (
          <div className="aviso aviso--ok">
            <i className="fa-solid fa-circle-check" aria-hidden="true" />
            <span>No hay ningún pedido aprobado esperando inventario.</span>
          </div>
        )}

        <div className="pedidos-lista">
          {aprobados.map((p) => {
            const suyas = unidades.filter((u) => u.pedidoId === p.id)
            const conTractor = suyas.filter((u) => elegido[u.id]).length

            return (
              <TarjetaPedido
                key={p.id}
                pedido={p}
                unidades={suyas}
                abierto={abierto === p.id}
                onAbrir={() => setAbierto((v) => (v === p.id ? null : p.id))}
              >
                <div className="unidades">
                  <span className="unidades-tit">Con qué tractor se cumple cada unidad</span>

                  {porModelo(suyas).map((g) => (
                    <UnirUnidades
                      key={g.catalogoId || g.unidades[0].unidad.id}
                      modelo={g.modelo}
                      sinUnir={g.unidades.filter((x) => !elegido[x.unidad.id])}
                      unidas={g.unidades.flatMap((x) => {
                        const t = porId.get(elegido[x.unidad.id] ?? '')
                        return t ? [{ unidad: x, tractor: t }] : []
                      })}
                      /* Mismo modelo por la conexión al catálogo —no por el texto, que se escribe
                         distinto—, sin dueño, y que nadie haya unido todavía en esta pantalla. */
                      libres={
                        g.catalogoId
                          ? libres.filter((t) => t.catalogoId === g.catalogoId && !tomados.has(t.id))
                          : []
                      }
                      bloqueado={trabajando === p.id}
                      onUnir={(unidadId, tractorId) =>
                        setElegido((e) => ({ ...e, [unidadId]: tractorId }))
                      }
                      onDesunir={(unidadId) =>
                        setElegido((e) => {
                          const sin = { ...e }
                          delete sin[unidadId]
                          return sin
                        })
                      }
                    />
                  ))}
                </div>

                <div className="pedido-acciones">
                  <span className="pedido-acciones-nota">
                    {conTractor} de {suyas.length} con tractor
                    {conTractor < suyas.length && ` · ${suyas.length - conTractor} a fábrica`}
                  </span>
                  <button
                    type="button"
                    className="btn btn--primario"
                    disabled={trabajando === p.id || suyas.length === 0}
                    onClick={() => setConfirmando(p.id)}
                  >
                    <i className="fa-solid fa-truck-ramp-box" aria-hidden="true" />{' '}
                    {trabajando === p.id ? 'Asignando…' : 'Asignar y crear la entrega'}
                  </button>
                </div>
              </TarjetaPedido>
            )
          })}
        </div>

        {(() => {
          const p = aprobados.find((x) => x.id === confirmando)
          if (!p) return null
          const suyas = unidades.filter((u) => u.pedidoId === p.id)
          const pares = suyas.flatMap((u, i) => {
            const t = stock.find((x) => x.id === elegido[u.id])
            return t ? [{ numero: i + 1, modelo: u.catalogoNombre, chasis: t.chasis || t.nombre }] : []
          })
          const aFabrica = suyas.length - pares.length
          return (
            <>
              <button
                className="lateral-fondo"
                aria-label="Cancelar"
                onClick={() => setConfirmando(null)}
              />
              <div className="ventanita" role="dialog" aria-modal="true">
                <div className="ventanita-head">
                  <span>¿Asignar el pedido?</span>
                  <button type="button" onClick={() => setConfirmando(null)} aria-label="Cerrar">
                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                  </button>
                </div>
                <div className="ventanita-cuerpo">
                  <span className="campo-lbl">{p.nombre}</span>
                  {pares.length > 0 && (
                    <ul className="lista-compacta">
                      {pares.map((x) => (
                        <li key={x.numero}>
                          Unidad {x.numero} {x.modelo && `(${x.modelo})`} → <b>{x.chasis}</b>
                        </li>
                      ))}
                    </ul>
                  )}
                  {aFabrica > 0 && (
                    <div className="aviso aviso--alerta">
                      <i className="fa-solid fa-industry" aria-hidden="true" />
                      <span>
                        {aFabrica === 1
                          ? 'Una unidad queda sin tractor y se pide a fábrica.'
                          : `${aFabrica} unidades quedan sin tractor y se piden a fábrica.`}
                      </span>
                    </div>
                  )}
                  <span className="campo-ayuda">
                    Los tractores salen del stock, se crea la entrega y queda guardado en monday.
                    Desde la app no se deshace.
                  </span>
                </div>
                <div className="ventanita-pie">
                  <button
                    type="button"
                    className="btn btn--borde btn--chico"
                    autoFocus
                    onClick={() => setConfirmando(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn--primario btn--chico"
                    onClick={() => {
                      setConfirmando(null)
                      void asignar(p)
                    }}
                  >
                    Sí, asignar
                  </button>
                </div>
              </div>
            </>
          )
        })()}
      </div>
    </div>
  )
}
