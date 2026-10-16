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
import { DesplegableMulti } from '@/components/ui/DesplegableMulti'
import { useSalidaProtegida } from '@/hooks/useSalidaProtegida'
import { normalizar } from '@/lib/format'
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
import { chasisDe, porCercania, UnirUnidades, type UnidadNumerada } from './UnirUnidades'

const mensaje = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** Qué se eligió para cada unidad: el id de un tractor, o `''` para pedirla a fábrica. */
type Eleccion = Record<string, string>

/** Lo que quedó de una asignación, para el resumen que se muestra al terminar. */
interface Resultado {
  pedidoId: string
  nombre: string
  estado: string
  porcentaje: number
  pares: { numero: number; modelo: string; chasis: string }[]
  aFabrica: number
  entrega: boolean
  advertencias: string[]
}

type Vista = 'pedidos' | 'tractores'

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
  /* El resumen de lo que se acaba de asignar. Va en una ventana y no sólo en el aviso de arriba:
     así se lee qué tractor quedó con qué unidad, y se elige si seguir con otro o mirar ese mismo. */
  const [resultado, setResultado] = useState<Resultado | null>(null)

  const [vista, setVista] = useState<Vista>('pedidos')
  const [texto, setTexto] = useState('')
  const [concesionarios, setConcesionarios] = useState<string[]>([])
  const [modelos, setModelos] = useState<string[]>([])
  const [buscarTractor, setBuscarTractor] = useState('')
  const [modelosTractor, setModelosTractor] = useState<string[]>([])
  const [tractorAbierto, setTractorAbierto] = useState<string | null>(null)

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

  /* Los aprobados, y los que se asignaron en parte o se pidieron a fábrica y todavía tienen
     unidades sin tractor: un pedido se puede completar en varias veces, a medida que llega stock.
     Nunca uno sin aprobar: asignarle inventario sería comprometer tractores por una venta que puede
     no existir. */
  const aprobados = useMemo(
    () =>
      pedidos
        .filter(
          (p) =>
            p.estado === ESTADO_PEDIDO.APROBADO ||
            ((p.estado === ESTADO_PEDIDO.ASIGNADO_PARCIAL ||
              p.estado === ESTADO_PEDIDO.A_FABRICA ||
              p.estado === ESTADO_PEDIDO.FACTURADO_PARCIAL) &&
              unidades.some((u) => u.pedidoId === p.id && !u.inventarioId)),
        )
        .sort(
          (a, b) => a.fechaAprobacion.localeCompare(b.fechaAprobacion) || a.id.localeCompare(b.id),
        ),
    [pedidos, unidades],
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

  /* Los filtros salen de lo que hay esperando: ofrecer un concesionario o un modelo que no tiene
     nada para asignar sólo sirve para llegar a una lista vacía. */
  const opcionesConcesionario = useMemo(() => {
    const vistos = new Map<string, string>()
    for (const p of aprobados) if (p.cuentaId) vistos.set(p.cuentaId, p.cuentaNombre || p.nombre)
    return [...vistos].map(([valor, rotulo]) => ({ valor, rotulo })).sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'es'))
  }, [aprobados])

  const opcionesModelo = useMemo(() => {
    const vistos = new Map<string, string>()
    for (const u of unidades) {
      if (u.catalogoId && !u.inventarioId && aprobados.some((p) => p.id === u.pedidoId)) {
        vistos.set(u.catalogoId, u.catalogoNombre || u.catalogoId)
      }
    }
    return [...vistos].map(([valor, rotulo]) => ({ valor, rotulo })).sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'es'))
  }, [unidades, aprobados])

  /* Varios concesionarios o varios modelos a la vez: aparece cualquier pedido de alguno de ellos. */
  const visibles = useMemo(() => {
    const q = normalizar(texto)
    return aprobados.filter((p) => {
      if (concesionarios.length > 0 && !concesionarios.includes(p.cuentaId)) return false
      const suyas = unidades.filter((u) => u.pedidoId === p.id)
      if (modelos.length > 0 && !suyas.some((u) => modelos.includes(u.catalogoId))) return false
      if (!q) return true
      const donde = [p.nombre, p.cuentaNombre, p.terceroNombre, ...suyas.map((u) => u.catalogoNombre)].join(' ')
      return normalizar(donde).includes(q)
    })
  }, [aprobados, unidades, texto, concesionarios, modelos])
  const hayFiltros = Boolean(texto.trim() || concesionarios.length || modelos.length)

  /* Los tractores sin dueño, para la pestaña que se abre desde la cajita. */
  const opcionesModeloStock = useMemo(() => {
    const vistos = new Map<string, string>()
    for (const t of libres) if (t.catalogoId) vistos.set(t.catalogoId, t.modelo || t.catalogoId)
    return [...vistos].map(([valor, rotulo]) => ({ valor, rotulo })).sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'es'))
  }, [libres])
  const tractoresVisibles = useMemo(() => {
    const q = normalizar(buscarTractor)
    return porCercania(libres).filter((t) => {
      if (modelosTractor.length > 0 && !modelosTractor.includes(t.catalogoId)) return false
      return !q || normalizar([t.nombre, t.modelo, t.chasis, t.numInterno].join(' ')).includes(q)
    })
  }, [libres, buscarTractor, modelosTractor])
  /** Cuántas unidades esperando tractor hay de cada modelo: dice si un tractor ya tiene a quién ir. */
  const esperanPorModelo = useMemo(() => {
    const m = new Map<string, number>()
    for (const u of unidades) {
      if (u.catalogoId && !u.inventarioId && aprobados.some((p) => p.id === u.pedidoId)) {
        m.set(u.catalogoId, (m.get(u.catalogoId) ?? 0) + 1)
      }
    }
    return m
  }, [unidades, aprobados])

  const asignar = async (p: PedidoLeido) => {
    setTrabajando(p.id)
    setHecho(null)
    setAvisos([])
    try {
      const suyas = unidades.filter((u) => u.pedidoId === p.id)
      /* Los pares, antes de escribir: después de recargar, las unidades ya no están sin tractor. */
      const pendientes = suyas.filter((u) => !u.inventarioId)
      const pares = pendientes.flatMap((u, i) => {
        const t = porId.get(elegido[u.id] ?? '')
        return t ? [{ numero: i + 1, modelo: u.catalogoNombre, chasis: chasisDe(t) }] : []
      })
      const r = await asignarPedido(
        p,
        suyas,
        suyas.map((u) => ({ unidadId: u.id, tractorId: elegido[u.id] ?? '' })),
      )
      setHecho(
        `${p.nombre}: ${r.estado} (${r.porcentaje}% con tractor). ` +
          [
            r.asignadas > 0 && `${r.asignadas} unidad${r.asignadas === 1 ? '' : 'es'} con tractor`,
            r.aFabrica > 0 && `${r.aFabrica} pedida${r.aFabrica === 1 ? '' : 's'} a fábrica`,
            r.entregaId && 'y la entrega creada',
          ]
            .filter(Boolean)
            .join(', ') +
          '.',
      )
      setAvisos(r.advertencias)
      setResultado({
        pedidoId: p.id,
        nombre: p.nombre,
        estado: r.estado,
        porcentaje: r.porcentaje,
        pares,
        aFabrica: r.aFabrica,
        entrega: Boolean(r.entregaId),
        advertencias: r.advertencias,
      })
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

        {/* Dos números y no tres: los pedidos aprobados y sus unidades por asignar son el mismo
            trabajo contado de dos maneras, así que van juntos en una sola cajita. */}
        <div className="tableros">
          <div className="tablero tablero--verde">
            <span className="tablero-ic">
              <i className="fa-solid fa-circle-check" aria-hidden="true" />
            </span>
            <span className="tablero-num">{porAsignar}</span>
            <span className="tablero-txt">
              unidades por asignar
              <small>
                de {aprobados.length} pedido{aprobados.length === 1 ? '' : 's'} aprobado
                {aprobados.length === 1 ? '' : 's'}
              </small>
            </span>
          </div>
          {/* Ésta sí se toca: abre la pestaña con los tractores sin dueño. */}
          <button
            type="button"
            className={`tablero tablero--azul tablero--boton${vista === 'tractores' ? ' tablero--activo' : ''}`}
            disabled={cargando}
            onClick={() => setVista((v) => (v === 'tractores' ? 'pedidos' : 'tractores'))}
          >
            <span className="tablero-ic">
              <i className="fa-solid fa-warehouse" aria-hidden="true" />
            </span>
            <span className="tablero-num">{libres.length}</span>
            <span className="tablero-txt">
              tractores sin dueño
              <small>de {stock.length} en el inventario · tocá para verlos</small>
            </span>
          </button>
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

        <div className="solapas">
          <button
            type="button"
            className={`solapa${vista === 'pedidos' ? ' solapa--si' : ''}`}
            onClick={() => setVista('pedidos')}
          >
            <i className="fa-solid fa-link" aria-hidden="true" /> Pedidos por asignar
            <span className="solapa-num">{aprobados.length}</span>
          </button>
          <button
            type="button"
            className={`solapa${vista === 'tractores' ? ' solapa--si' : ''}`}
            onClick={() => setVista('tractores')}
          >
            <i className="fa-solid fa-warehouse" aria-hidden="true" /> Tractores sin dueño
            <span className="solapa-num">{libres.length}</span>
          </button>
        </div>

        {vista === 'pedidos' && (
          <>
            {/* Igual que en Aprobar: texto libre, y varios concesionarios o varios modelos a la vez. */}
            <div className="buscador-pedidos">
              <input
                className="input"
                placeholder="Buscar por concesionario, cliente o modelo…"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
              />
              <DesplegableMulti
                valores={concesionarios}
                opciones={opcionesConcesionario}
                vacio="Todos los concesionarios"
                buscable
                onCambiar={setConcesionarios}
              />
              <DesplegableMulti
                valores={modelos}
                opciones={opcionesModelo}
                vacio="Todos los modelos"
                buscable={opcionesModelo.length > 8}
                onCambiar={setModelos}
              />
            </div>

            {!cargando && visibles.length === 0 && !error && (
              <div className="aviso aviso--ok">
                <i className="fa-solid fa-circle-check" aria-hidden="true" />
                <span>
                  {hayFiltros
                    ? 'Ningún pedido por asignar coincide con lo que buscaste.'
                    : 'No hay ningún pedido aprobado esperando inventario.'}
                </span>
              </div>
            )}
          </>
        )}

        {/* Los tractores sin dueño, resumidos: el Name en negrita y lo demás al desplegar. */}
        {vista === 'tractores' && (
          <>
            <div className="buscador-pedidos">
              <input
                className="input"
                placeholder="Buscar por Name (con el número de draft), chasis o N° interno…"
                value={buscarTractor}
                onChange={(e) => setBuscarTractor(e.target.value)}
              />
              <DesplegableMulti
                valores={modelosTractor}
                opciones={opcionesModeloStock}
                vacio="Todos los modelos"
                buscable={opcionesModeloStock.length > 8}
                onCambiar={setModelosTractor}
              />
            </div>
            {!cargando && tractoresVisibles.length === 0 && (
              <div className="aviso aviso--neutro">
                <i className="fa-solid fa-circle-info" aria-hidden="true" />
                <span>
                  {libres.length === 0
                    ? 'No hay tractores sin dueño en el inventario.'
                    : 'Ningún tractor coincide con lo que buscaste.'}
                </span>
              </div>
            )}
            <div className="stock-lista">
              {tractoresVisibles.map((t) => {
                const esperan = esperanPorModelo.get(t.catalogoId) ?? 0
                const abiertoT = tractorAbierto === t.id
                return (
                  <div key={t.id} className={`stock-fila${abiertoT ? ' stock-fila--abierta' : ''}`}>
                    <button
                      type="button"
                      className="stock-fila-head"
                      aria-expanded={abiertoT}
                      onClick={() => setTractorAbierto(abiertoT ? null : t.id)}
                    >
                      <span className="stock-fila-nom">
                        <b>{t.nombre}</b>
                        <small>{t.modelo || 'Sin modelo'}</small>
                      </span>
                      <span className="stock-fila-chips">
                        {t.estadoImportacion && (
                          <span className="chip chip--azul">{t.estadoImportacion}</span>
                        )}
                        {esperan > 0 && (
                          <span className="chip chip--verde">
                            {esperan} unidad{esperan === 1 ? '' : 'es'} lo esperan
                          </span>
                        )}
                        <i
                          className={`fa-solid fa-chevron-${abiertoT ? 'up' : 'down'}`}
                          aria-hidden="true"
                        />
                      </span>
                    </button>
                    {abiertoT && (
                      <dl className="datos-pares stock-fila-cuerpo">
                        <div>
                          <dt>Chasis</dt>
                          <dd>{t.chasis || '—'}</dd>
                        </div>
                        <div>
                          <dt>N° interno</dt>
                          <dd>{t.numInterno || '—'}</dd>
                        </div>
                        <div>
                          <dt>Estado comercial</dt>
                          <dd>{t.estadoComercial || '—'}</dd>
                        </div>
                        <div>
                          <dt>Importación</dt>
                          <dd>{t.estadoImportacion || '—'}</dd>
                        </div>
                        <div>
                          <dt>Unidades que lo esperan</dt>
                          <dd>
                            {esperan > 0
                              ? `${esperan} aprobada${esperan === 1 ? '' : 's'} de este modelo`
                              : 'Ninguna por ahora'}
                          </dd>
                        </div>
                      </dl>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        <div className="pedidos-lista">
          {(vista === 'pedidos' ? visibles : []).map((p) => {
            const todas = unidades.filter((u) => u.pedidoId === p.id)
            /* Sólo las que todavía no tienen tractor se unen acá; las de una vez anterior ya están. */
            const suyas = todas.filter((u) => !u.inventarioId)
            const yaAsignadas = todas.length - suyas.length
            const conTractor = suyas.filter((u) => elegido[u.id]).length

            return (
              <TarjetaPedido
                key={p.id}
                pedido={p}
                unidades={todas}
                abierto={abierto === p.id}
                onAbrir={() => setAbierto((v) => (v === p.id ? null : p.id))}
              >
                <div className="unidades">
                  <span className="unidades-tit">Con qué tractor se cumple cada unidad</span>
                  {yaAsignadas > 0 && (
                    <div className="aviso aviso--neutro">
                      <i className="fa-solid fa-circle-check" aria-hidden="true" />
                      <span>
                        {yaAsignadas === 1
                          ? 'Una unidad ya tiene tractor de una asignación anterior.'
                          : `${yaAsignadas} unidades ya tienen tractor de una asignación anterior.`}{' '}
                        Acá quedan las {suyas.length} que faltan.
                      </span>
                    </div>
                  )}

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
          const suyas = unidades.filter((u) => u.pedidoId === p.id && !u.inventarioId)
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

        {/* Lo que quedó, en una ventana: se lee qué tractor fue a cada unidad y se sigue con otro
            pedido, o se vuelve a mirar éste si le quedan unidades. */}
        {resultado && (
          <>
            <button className="lateral-fondo" aria-label="Cerrar" onClick={() => setResultado(null)} />
            <div className="ventanita" role="dialog" aria-modal="true">
              <div className="ventanita-head">
                <span>
                  <i className="fa-solid fa-circle-check texto-verde" aria-hidden="true" /> Asignación
                  guardada
                </span>
                <button type="button" onClick={() => setResultado(null)} aria-label="Cerrar">
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              </div>
              <div className="ventanita-cuerpo">
                <span className="campo-lbl">{resultado.nombre}</span>
                <span className="resumen-chips">
                  <span
                    className={`chip ${resultado.porcentaje >= 100 ? 'chip--azul' : 'chip--teal'}`}
                  >
                    {resultado.estado}
                  </span>
                  <span className="chip chip--gris">{resultado.porcentaje}% con tractor</span>
                  {resultado.entrega && <span className="chip chip--verde">Entrega creada</span>}
                </span>
                {resultado.pares.length > 0 && (
                  <ul className="lista-compacta">
                    {resultado.pares.map((x) => (
                      <li key={x.numero}>
                        Unidad {x.numero} {x.modelo && `(${x.modelo})`} → <b>{x.chasis}</b>
                      </li>
                    ))}
                  </ul>
                )}
                {resultado.aFabrica > 0 && (
                  <span className="campo-ayuda">
                    <i className="fa-solid fa-industry" aria-hidden="true" />{' '}
                    {resultado.aFabrica === 1
                      ? 'Una unidad quedó pedida a fábrica.'
                      : `${resultado.aFabrica} unidades quedaron pedidas a fábrica.`}
                  </span>
                )}
                {resultado.advertencias.length > 0 && (
                  <div className="aviso aviso--alerta">
                    <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                    <span>Quedó algo a medias: {resultado.advertencias.join(' · ')}</span>
                  </div>
                )}
              </div>
              <div className="ventanita-pie">
                {aprobados.some((x) => x.id === resultado.pedidoId) && (
                  <button
                    type="button"
                    className="btn btn--borde btn--chico"
                    onClick={() => {
                      setVista('pedidos')
                      setAbierto(resultado.pedidoId)
                      setResultado(null)
                    }}
                  >
                    Ver este pedido
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn--primario btn--chico"
                  autoFocus
                  onClick={() => setResultado(null)}
                >
                  Seguir asignando
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
