/**
 * VENTA · Asignar pedidos. Es de BERGER.
 *
 * El pedido ya está aprobado; lo que falta es con qué tractor se cumple cada unidad. Se resuelve de
 * a una y no de a pedido porque la realidad es de a una: dos unidades del mismo modelo, una que
 * sale del galpón y otra que hay que pedirle a fábrica, es el caso normal.
 *
 * Lo que se ofrece para cada unidad son los tractores del mismo modelo que todavía no tienen dueño,
 * descontando los que se eligieron recién acá arriba: sin eso, un pedido de dos se llevaría dos
 * veces el mismo chasis y el error aparecería el día de la entrega.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Desplegable } from '@/components/ui/Desplegable'
import { ESTADO_PEDIDO } from '@/services/monday/columns'
import {
  asignarPedido,
  candidatosPara,
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

const mensaje = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** Qué se eligió para cada unidad: el id de un tractor, o `''` para pedirla a fábrica. */
type Eleccion = Record<string, string>

/** Cómo se lee un tractor en la lista: lo que lo distingue de otro del mismo modelo. */
const rotuloDe = (t: TractorEnStock): string =>
  [t.chasis || t.nombre, t.numInterno && `N° ${t.numInterno}`].filter(Boolean).join(' · ')

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
      setElegido({})
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

        <div className="resumen-estados">
          <span className="chip chip--verde">{aprobados.length} pedidos aprobados</span>
          <span className="chip chip--gris">{libres.length} tractores sin dueño</span>
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
            /* Lo elegido en ESTE pedido, para no ofrecer dos veces el mismo chasis. */
            const tomados = suyas.map((u) => elegido[u.id]).filter(Boolean)
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

                  {suyas.map((u, i) => {
                    const candidatos = candidatosPara(
                      u,
                      stock,
                      tomados.filter((t) => t !== elegido[u.id]),
                    )
                    return (
                      <div key={u.id} className="unidad unidad--asignar">
                        <span className="unidad-nom">
                          {u.catalogoNombre || u.nombre}
                          <small>unidad {i + 1}</small>
                        </span>

                        <div className="unidad-elegir">
                          <Desplegable
                            valor={elegido[u.id] ?? ''}
                            opciones={[
                              { valor: '', rotulo: 'Pedir a fábrica' },
                              ...candidatos.map((t) => ({
                                valor: t.id,
                                rotulo: rotuloDe(t),
                                detalle: t.estadoImportacion,
                              })),
                            ]}
                            vacio="Pedir a fábrica"
                            buscable={candidatos.length > 8}
                            bloqueado={trabajando === p.id}
                            onCambiar={(v) => setElegido((e) => ({ ...e, [u.id]: v }))}
                          />
                          {/* Que no haya ninguno no es un error: significa que ese modelo hay que
                              pedirlo, y conviene que se lea así y no como una lista vacía. */}
                          <span className="campo-ayuda">
                            {candidatos.length === 0
                              ? 'No hay ninguno de este modelo sin dueño: va a fábrica.'
                              : `${candidatos.length} disponible${candidatos.length === 1 ? '' : 's'} de este modelo`}
                          </span>
                        </div>
                      </div>
                    )
                  })}
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
                    onClick={() => void asignar(p)}
                  >
                    <i className="fa-solid fa-truck-ramp-box" aria-hidden="true" />{' '}
                    {trabajando === p.id ? 'Asignando…' : 'Asignar y crear la entrega'}
                  </button>
                </div>
              </TarjetaPedido>
            )
          })}
        </div>
      </div>
    </div>
  )
}
