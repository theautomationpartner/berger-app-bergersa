/**
 * VENTA · Cargar factura. Es de BERGER.
 *
 * Primero se eligen los pedidos y, de cada uno, los tractores —las unidades de 🛍️Pedidos x UNIDAD,
 * una por chasis—, no el renglón con su cantidad: de un pedido de cinco tractores del mismo modelo
 * se pueden facturar dos hoy y tres la semana que viene. Después, POR CADA TRACTOR elegido, se sube
 * su factura en PDF: cada tractor es una factura, un item en 📄Facturas de Pedidos con su único
 * subitem. Como cada factura es de un solo tractor, en una tanda pueden ir tractores de pedidos y
 * de concesionarios distintos.
 *
 * La pantalla está partida en dos para no tener que bajar a buscar el botón: a la izquierda los
 * pedidos —plegados, con sus etiquetas, y se despliegan para elegir—, y a la derecha las facturas
 * a cargar, siempre a la vista, una fila por tractor con su PDF y su número.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { DesplegableMulti } from '@/components/ui/DesplegableMulti'
import { FilaArchivo } from '@/components/ui/FilaArchivo'
import { Plata } from '@/components/ui/Plata'
import { useSalidaProtegida } from '@/hooks/useSalidaProtegida'
import { normalizar } from '@/lib/format'
import { ESTADO_UNIDAD } from '@/services/monday/columns'
import {
  cargarFacturas,
  nombreDelTractor,
  numeroDelArchivo,
  pedidoFacturable,
  porQueNoSeFactura,
  problemaDeFacturas,
  unidadesParaFacturar,
  urlDeFactura,
  type FacturaDeTractor,
  type ResultadoFacturas,
  type UnidadFacturable,
} from '@/services/monday/facturas'
import { hoy, pedidosCargados, type PedidoLeido } from '@/services/monday/pedidosBerger'
import { SinAcceso } from '@/services/monday/sdk'
import { TarjetaPedido, tonoDeEstado } from './TarjetaPedido'

const mensaje = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** El color del estado de una unidad, para leerlo sin leerlo. */
function tonoDeUnidad(estado: string): string {
  switch (estado) {
    case ESTADO_UNIDAD.FACTURADA:
      return 'chip--azul'
    case ESTADO_UNIDAD.ASIGNADA:
      return 'chip--verde'
    case ESTADO_UNIDAD.A_FABRICA:
      return 'chip--violeta'
    case ESTADO_UNIDAD.RECHAZADA:
      return 'chip--rojo'
    case ESTADO_UNIDAD.PENDIENTE:
    case ESTADO_UNIDAD.APROBADA:
    case ESTADO_UNIDAD.OBSERVACION:
      return 'chip--ambar'
    default:
      return 'chip--teal'
  }
}

/** Lo que comparten todas las facturas de la tanda. */
interface Comunes {
  fechaEmision: string
  fechaVencimiento: string
  notas: string
}

const COMUNES_VACIOS = (): Comunes => ({ fechaEmision: hoy(), fechaVencimiento: '', notas: '' })

/** El PDF y el número de la factura de UN tractor. */
interface Carga {
  archivo: File | null
  numero: string
}

const SIN_CARGA: Carga = { archivo: null, numero: '' }

interface Props {
  onInicio?: () => void
}

export function CargarFactura({ onInicio }: Props) {
  const [pedidos, setPedidos] = useState<PedidoLeido[]>([])
  const [unidades, setUnidades] = useState<UnidadFacturable[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [texto, setTexto] = useState('')
  const [concesionarios, setConcesionarios] = useState<string[]>([])
  const [modelos, setModelos] = useState<string[]>([])
  const [abierto, setAbierto] = useState<string | null>(null)

  /** Los tractores elegidos, por id de unidad, en el orden en que se eligieron. */
  const [elegidas, setElegidas] = useState<string[]>([])
  /** El PDF y el número de cada tractor elegido. */
  const [cargas, setCargas] = useState<Record<string, Carga>>({})
  const [comunes, setComunes] = useState<Comunes>(COMUNES_VACIOS)

  const [confirmando, setConfirmando] = useState(false)
  const [trabajando, setTrabajando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoFacturas | null>(null)

  const recargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [ps, us] = await Promise.all([pedidosCargados(), unidadesParaFacturar()])
      setPedidos(ps)
      setUnidades(us)
      /* Lo elegido que ya no se puede facturar —lo facturó otro mientras tanto— se suelta. */
      setElegidas((e) => e.filter((id) => us.some((u) => u.id === id && !porQueNoSeFactura(u))))
    } catch (e) {
      setError(
        e instanceof SinAcceso
          ? 'la app tiene que abrirse desde monday para leer los pedidos.'
          : mensaje(e),
      )
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void recargar()
  }, [recargar])

  const unidadesDe = useMemo(() => {
    const m = new Map<string, UnidadFacturable[]>()
    for (const u of unidades) m.set(u.pedidoId, [...(m.get(u.pedidoId) ?? []), u])
    return m
  }, [unidades])

  /* Los pedidos que tienen algo para facturar, del más viejo al más nuevo. */
  const facturables = useMemo(
    () =>
      pedidos
        .filter((p) => pedidoFacturable(p, unidadesDe.get(p.id) ?? []))
        .sort((a, b) => a.fechaSolicitud.localeCompare(b.fechaSolicitud) || a.id.localeCompare(b.id)),
    [pedidos, unidadesDe],
  )
  const porPedido = useMemo(() => new Map(pedidos.map((p) => [p.id, p])), [pedidos])

  const libres = useMemo(
    () =>
      facturables.flatMap((p) => (unidadesDe.get(p.id) ?? []).filter((u) => !porQueNoSeFactura(u))),
    [facturables, unidadesDe],
  )

  const seleccion = useMemo(
    () => elegidas.flatMap((id) => unidades.filter((u) => u.id === id)),
    [elegidas, unidades],
  )

  const opcionesConcesionario = useMemo(() => {
    const vistos = new Map<string, string>()
    for (const p of facturables) if (p.cuentaId) vistos.set(p.cuentaId, p.cuentaNombre || p.nombre)
    return [...vistos]
      .map(([valor, rotulo]) => ({ valor, rotulo }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'es'))
  }, [facturables])

  const opcionesModelo = useMemo(() => {
    const vistos = new Map<string, string>()
    for (const u of libres) if (u.catalogoId) vistos.set(u.catalogoId, u.catalogoNombre || u.catalogoId)
    return [...vistos]
      .map(([valor, rotulo]) => ({ valor, rotulo }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'es'))
  }, [libres])

  const visibles = useMemo(() => {
    const q = normalizar(texto)
    return facturables.filter((p) => {
      if (concesionarios.length > 0 && !concesionarios.includes(p.cuentaId)) return false
      const suyas = unidadesDe.get(p.id) ?? []
      if (modelos.length > 0 && !suyas.some((u) => modelos.includes(u.catalogoId) && !porQueNoSeFactura(u))) {
        return false
      }
      if (!q) return true
      const donde = [
        p.nombre,
        p.cuentaNombre,
        p.terceroNombre,
        ...suyas.flatMap((u) => [u.catalogoNombre, u.chasis, u.inventarioNombre]),
      ].join(' ')
      return normalizar(donde).includes(q)
    })
  }, [facturables, unidadesDe, texto, concesionarios, modelos])
  const hayFiltros = Boolean(texto.trim() || concesionarios.length || modelos.length)

  /** Lo que viaja: cada tractor con su PDF y su número. */
  const aCargar: FacturaDeTractor[] = useMemo(
    () =>
      seleccion.map((u) => {
        const c = cargas[u.id] ?? SIN_CARGA
        return { unidad: u, numero: c.numero, archivo: c.archivo as File }
      }),
    [seleccion, cargas],
  )
  const conPdf = seleccion.filter((u) => cargas[u.id]?.archivo).length
  const total = seleccion.reduce((s, u) => s + (u.precios.facturaConIva ?? u.precios.facturaSinIva ?? 0), 0)
  const concesionariosElegidos = new Set(seleccion.map((u) => porPedido.get(u.pedidoId)?.cuentaId)).size

  /* Qué falta, dicho en el orden en que se completa. */
  const falta = useMemo(() => {
    if (seleccion.length === 0) return 'Elegí al menos un tractor.'
    if (conPdf < seleccion.length) {
      const n = seleccion.length - conPdf
      return n === 1 ? 'Falta el PDF de un tractor.' : `Faltan los PDF de ${n} tractores.`
    }
    if (!comunes.fechaEmision) return 'Falta la fecha de emisión.'
    return problemaDeFacturas(aCargar, pedidos)
  }, [seleccion, conPdf, comunes, aCargar, pedidos])

  useSalidaProtegida(
    trabajando
      ? 'Se están cargando las facturas en monday: cada factura, su tractor y los estados. Si salís ahora puede quedar a medias.'
      : seleccion.length > 0
        ? 'Tenés facturas a medio cargar. Si salís, se pierde lo elegido y los PDF adjuntados.'
        : null,
  )

  const alternar = (u: UnidadFacturable) =>
    setElegidas((e) => (e.includes(u.id) ? e.filter((x) => x !== u.id) : [...e, u.id]))

  const ponerArchivo = (id: string, archivo: File | null) =>
    setCargas((c) => {
      const antes = c[id] ?? SIN_CARGA
      /* El número sale del nombre del PDF mientras nadie lo haya escrito a mano. */
      const numeroAuto = !antes.numero || (antes.archivo && antes.numero === numeroDelArchivo(antes.archivo))
      return {
        ...c,
        [id]: { archivo, numero: numeroAuto ? (archivo ? numeroDelArchivo(archivo) : '') : antes.numero },
      }
    })

  const empezarOtra = () => {
    setElegidas([])
    setCargas({})
    setComunes(COMUNES_VACIOS())
    setResultado(null)
  }

  const guardar = async () => {
    if (falta) return
    setTrabajando(true)
    setError(null)
    try {
      const r = await cargarFacturas(aCargar, comunes, pedidos, unidades)
      setResultado(r)
      /* Lo que no se pudo crear queda elegido, con su PDF, para volver a intentarlo. */
      const fallidas = r.facturas.filter((f) => !f.facturaId).map((f) => f.unidadId)
      setElegidas(fallidas)
      setCargas((c) => Object.fromEntries(fallidas.map((id) => [id, c[id] ?? SIN_CARGA])))
      if (fallidas.length === 0) setComunes(COMUNES_VACIOS())
      await recargar()
    } catch (e) {
      setError(mensaje(e))
    } finally {
      setTrabajando(false)
    }
  }

  const creadas = resultado?.facturas.filter((f) => f.facturaId) ?? []
  const noCreadas = resultado?.facturas.filter((f) => !f.facturaId) ?? []

  return (
    <div className="scroll">
      <div className="view">
        <div className="sec-head">
          <span className="sec-num">
            <i className="fa-solid fa-file-invoice-dollar" aria-hidden="true" />
          </span>
          <span className="sec-txt">
            <span className="sec-tit">Cargar factura</span>
            <span className="sec-det">
              Elegí los pedidos y sus tractores, y subí la factura en PDF de cada tractor: cada uno
              es una factura.
            </span>
          </span>
        </div>

        <div className="tableros">
          <div className="tablero tablero--verde">
            <span className="tablero-ic">
              <i className="fa-solid fa-tractor" aria-hidden="true" />
            </span>
            <span className="tablero-num">{libres.length}</span>
            <span className="tablero-txt">
              tractores para facturar
              <small>
                de {facturables.length} pedido{facturables.length === 1 ? '' : 's'}
              </small>
            </span>
          </div>
          <div className={`tablero ${seleccion.length > 0 ? 'tablero--azul' : 'tablero--vacio'}`}>
            <span className="tablero-ic">
              <i className="fa-solid fa-file-invoice" aria-hidden="true" />
            </span>
            <span className="tablero-num">{seleccion.length}</span>
            <span className="tablero-txt">
              factura{seleccion.length === 1 ? '' : 's'} a cargar
              <small>
                {seleccion.length === 0
                  ? 'Todavía ningún tractor'
                  : `${conPdf} de ${seleccion.length} con su PDF`}
              </small>
            </span>
          </div>
          <button
            type="button"
            className="btn btn--texto btn--chico"
            disabled={cargando || trabajando}
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

        <div className="facturar">
          <div className="facturar-pedidos">
            <div className="buscador-pedidos">
              <input
                className="input"
                placeholder="Buscar por pedido, concesionario, cliente, modelo o chasis…"
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

            {cargando && (
              <div className="aviso aviso--neutro">
                <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
                <span>Buscando los pedidos con tractores asignados…</span>
              </div>
            )}

            {!cargando && visibles.length === 0 && !error && (
              <div className="aviso aviso--neutro">
                <i className="fa-solid fa-circle-info" aria-hidden="true" />
                <span>
                  {hayFiltros
                    ? 'Ningún pedido para facturar coincide con lo que buscaste.'
                    : 'No hay pedidos con tractores asignados para facturar.'}
                </span>
              </div>
            )}

            <div className="pedidos-lista">
              {visibles.map((p) => {
                const suyas = unidadesDe.get(p.id) ?? []
                const disponibles = suyas.filter((u) => !porQueNoSeFactura(u))
                const elegidasAca = suyas.filter((u) => elegidas.includes(u.id)).length
                return (
                  <TarjetaPedido
                    key={p.id}
                    pedido={p}
                    unidades={suyas.map((u) => ({ ...u, facturaSinIva: u.precios.facturaSinIva ?? 0 }))}
                    abierto={abierto === p.id}
                    onAbrir={() => setAbierto((v) => (v === p.id ? null : p.id))}
                    chips={
                      <>
                        <span className="chip chip--gris" title="Concesionario">
                          <i className="fa-solid fa-store" aria-hidden="true" />{' '}
                          {p.cuentaNombre || 'Sin concesionario'}
                        </span>
                        <span className="chip chip--verde">{disponibles.length} para facturar</span>
                        {elegidasAca > 0 && (
                          <span className="chip chip--azul">
                            <i className="fa-solid fa-check" aria-hidden="true" /> {elegidasAca} elegido
                            {elegidasAca === 1 ? '' : 's'}
                          </span>
                        )}
                      </>
                    }
                    costado={
                      <div className="fact-tractores">
                        <div className="fact-tractores-head">
                          <span className="unidades-tit">Tractores del pedido</span>
                          {disponibles.length > 1 && (
                            <button
                              type="button"
                              className="btn btn--texto btn--chico"
                              disabled={trabajando}
                              onClick={() =>
                                setElegidas((e) => [...new Set([...e, ...disponibles.map((u) => u.id)])])
                              }
                            >
                              <i className="fa-solid fa-check-double" aria-hidden="true" /> Elegir los{' '}
                              {disponibles.length}
                            </button>
                          )}
                        </div>
                        {suyas.map((u) => {
                          const por = porQueNoSeFactura(u)
                          const si = elegidas.includes(u.id)
                          return (
                            <label
                              key={u.id}
                              className={`fact-tractor${si ? ' fact-tractor--si' : ''}${por ? ' fact-tractor--no' : ''}`}
                            >
                              <input
                                type="checkbox"
                                checked={si}
                                disabled={Boolean(por) || trabajando}
                                onChange={() => alternar(u)}
                              />
                              <span className="fact-tractor-nom">
                                <b>{u.catalogoNombre || u.nombre}</b>
                                <small>
                                  {u.chasis
                                    ? `Chasis ${u.chasis}`
                                    : u.inventarioNombre || 'Sin tractor del inventario'}
                                  {u.chasis && u.inventarioNombre ? ` · ${u.inventarioNombre}` : ''}
                                </small>
                              </span>
                              <span className="fact-tractor-der">
                                <span className={`chip ${tonoDeUnidad(u.estado)}`}>
                                  {u.estado || 'Sin estado'}
                                </span>
                                {por && por !== u.estado && <span className="chip chip--gris">{por}</span>}
                                {u.precios.facturaSinIva !== null && (
                                  <Plata valor={u.precios.facturaSinIva} nota="s/IVA" />
                                )}
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    }
                  />
                )
              })}
            </div>
          </div>

          {/* Las facturas a cargar, siempre a la vista: una por tractor elegido. */}
          <aside className="facturar-panel">
            <div className="facturar-panel-tit">
              <i className="fa-solid fa-file-invoice-dollar" aria-hidden="true" /> Facturas a cargar
              {seleccion.length > 0 && <span className="solapa-num">{seleccion.length}</span>}
              {seleccion.length > 0 && (
                <button
                  type="button"
                  className="btn btn--texto btn--chico"
                  disabled={trabajando}
                  onClick={() => setElegidas([])}
                >
                  Vaciar
                </button>
              )}
            </div>

            {seleccion.length === 0 ? (
              <span className="campo-ayuda">
                Desplegá un pedido y tildá sus tractores. Por cada tractor elegido aparece acá una
                factura, y a cada una le subís su PDF.
              </span>
            ) : (
              <ul className="fact-cargas">
                {seleccion.map((u) => {
                  const p = porPedido.get(u.pedidoId)
                  const c = cargas[u.id] ?? SIN_CARGA
                  return (
                    <li key={u.id} className={`fact-carga${c.archivo ? ' fact-carga--lista' : ''}`}>
                      <div className="fact-carga-head">
                        <span>
                          <b>{nombreDelTractor(u)}</b>
                          <small>
                            {p?.nombre}
                          </small>
                        </span>
                        <Plata valor={u.precios.facturaConIva ?? u.precios.facturaSinIva ?? 0} nota="c/IVA" />
                        <button
                          type="button"
                          className="unir-quitar"
                          aria-label="Quitar"
                          disabled={trabajando}
                          onClick={() => alternar(u)}
                        >
                          <i className="fa-solid fa-xmark" aria-hidden="true" />
                        </button>
                      </div>
                      <FilaArchivo
                        rotulo="PDF"
                        yaSubidos={[]}
                        pendientes={c.archivo ? [c.archivo] : []}
                        onCambiar={(fs) => ponerArchivo(u.id, fs[0] ?? null)}
                        trabado={trabajando ? 'Cargando…' : undefined}
                      />
                      <input
                        className="input input--chico"
                        placeholder="N° de factura (sale del nombre del PDF)"
                        aria-label={`N° de factura de ${nombreDelTractor(u)}`}
                        value={c.numero}
                        disabled={trabajando}
                        onChange={(e) =>
                          setCargas((x) => ({ ...x, [u.id]: { ...(x[u.id] ?? SIN_CARGA), numero: e.target.value } }))
                        }
                      />
                    </li>
                  )
                })}
              </ul>
            )}

            <div className="facturar-campos">
              <label className="campo">
                <span className="campo-lbl">
                  Emisión <span className="campo-req">· obligatorio</span>
                </span>
                <input
                  className="input"
                  type="date"
                  value={comunes.fechaEmision}
                  onChange={(e) => setComunes({ ...comunes, fechaEmision: e.target.value })}
                />
              </label>
              <label className="campo">
                <span className="campo-lbl">Vencimiento</span>
                <input
                  className="input"
                  type="date"
                  value={comunes.fechaVencimiento}
                  onChange={(e) => setComunes({ ...comunes, fechaVencimiento: e.target.value })}
                />
              </label>
              <label className="campo facturar-campos-ancho">
                <span className="campo-lbl">Notas</span>
                <textarea
                  className="input textarea"
                  rows={2}
                  value={comunes.notas}
                  onChange={(e) => setComunes({ ...comunes, notas: e.target.value })}
                />
              </label>
              <span className="campo-ayuda facturar-campos-ancho">
                Las fechas y las notas van en todas las facturas. Los montos de cada una salen de su
                tractor (factura s/IVA y c/IVA de la unidad).
              </span>
            </div>

            <div className="totales-pedido totales-pedido--dos">
              <div className="total-cuadro">
                <small>Concesionarios</small>
                <b>{concesionariosElegidos}</b>
              </div>
              <div className="total-cuadro total-cuadro--fuerte">
                <small>Total con IVA</small>
                <Plata valor={total} grande />
              </div>
            </div>

            {falta && seleccion.length > 0 && (
              <span className="campo-ayuda campo-ayuda--aviso">{falta}</span>
            )}
            <button
              type="button"
              className="btn btn--primario facturar-boton"
              disabled={Boolean(falta) || trabajando}
              onClick={() => setConfirmando(true)}
            >
              <i
                className={`fa-solid ${trabajando ? 'fa-spinner fa-spin' : 'fa-file-arrow-up'}`}
                aria-hidden="true"
              />{' '}
              {trabajando
                ? 'Cargando las facturas…'
                : seleccion.length > 1
                  ? `Cargar ${seleccion.length} facturas`
                  : 'Cargar la factura'}
            </button>
          </aside>
        </div>

        {confirmando && (
          <>
            <button className="lateral-fondo" aria-label="Cancelar" onClick={() => setConfirmando(false)} />
            <div className="ventanita" role="dialog" aria-modal="true">
              <div className="ventanita-head">
                <span>
                  ¿Cargar {seleccion.length === 1 ? 'la factura' : `${seleccion.length} facturas`}?
                </span>
                <button type="button" onClick={() => setConfirmando(false)} aria-label="Cerrar">
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              </div>
              <div className="ventanita-cuerpo ventanita-cuerpo--scroll">
                <ul className="lista-compacta">
                  {aCargar.map(({ unidad: u, numero }) => (
                    <li key={u.id}>
                      <b>{numero}</b> — {nombreDelTractor(u)} · {porPedido.get(u.pedidoId)?.cuentaNombre}
                    </li>
                  ))}
                </ul>
                <span className="campo-ayuda">
                  Se crea una factura por tractor, con su PDF y su tractor como subelemento. Cada
                  tractor pasa a Facturado en Pedidos x UNIDAD y en el Inventario, y su renglón y su
                  pedido a Facturado (o Facturado Parcialmente si les queda alguno). Desde la app no
                  se deshace.
                </span>
              </div>
              <div className="ventanita-pie">
                <button
                  type="button"
                  className="btn btn--borde btn--chico"
                  autoFocus
                  onClick={() => setConfirmando(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn--primario btn--chico"
                  onClick={() => {
                    setConfirmando(false)
                    void guardar()
                  }}
                >
                  Sí, cargar
                </button>
              </div>
            </div>
          </>
        )}

        {resultado && (
          <>
            <button className="lateral-fondo" aria-label="Cerrar" onClick={() => setResultado(null)} />
            <div className="ventanita" role="dialog" aria-modal="true">
              <div className="ventanita-head">
                <span>
                  <i
                    className={`fa-solid ${noCreadas.length ? 'fa-triangle-exclamation texto-rojo' : 'fa-circle-check texto-verde'}`}
                    aria-hidden="true"
                  />{' '}
                  {creadas.length === 1 ? 'Factura cargada' : `${creadas.length} facturas cargadas`}
                </span>
                <button type="button" onClick={() => setResultado(null)} aria-label="Cerrar">
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              </div>
              <div className="ventanita-cuerpo ventanita-cuerpo--scroll">
                {creadas.length > 0 && (
                  <span className="exito-titulo">
                    {creadas.length === 1
                      ? 'La factura fue cargada de manera exitosa.'
                      : `Las ${creadas.length} facturas fueron cargadas de manera exitosa.`}
                  </span>
                )}
                <ul className="exito-lista">
                  {creadas.map((f) => (
                    <li key={f.unidadId}>
                      <i className="fa-solid fa-file-invoice" aria-hidden="true" />
                      <span>
                        <a href={urlDeFactura(f.facturaId)} target="_blank" rel="noreferrer">
                          <b>{f.numero}</b>
                        </a>
                        <small>
                          {f.tractor} · {f.concesionario}
                        </small>
                      </span>
                    </li>
                  ))}
                </ul>
                {noCreadas.length > 0 && (
                  <div className="aviso aviso--error">
                    <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                    <span>
                      {noCreadas.length === 1
                        ? 'Una factura no se pudo crear; su tractor quedó elegido para reintentar:'
                        : `${noCreadas.length} facturas no se pudieron crear; sus tractores quedaron elegidos para reintentar:`}
                      <ul className="lista-compacta">
                        {noCreadas.map((f) => (
                          <li key={f.unidadId}>
                            {f.numero} — {f.tractor}: {f.error}
                          </li>
                        ))}
                      </ul>
                    </span>
                  </div>
                )}
                <span className="resumen-chips">
                  {resultado.pedidos.map((p) => (
                    <span key={p.id} className={`chip ${tonoDeEstado(p.estado)}`}>
                      {p.nombre}: {p.estado}
                    </span>
                  ))}
                </span>
                {resultado.advertencias.length > noCreadas.length && (
                  <div className="aviso aviso--alerta">
                    <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                    <span>
                      Quedó algo a medias:
                      <ul className="lista-compacta">
                        {resultado.advertencias.map((a) => (
                          <li key={a}>{a}</li>
                        ))}
                      </ul>
                    </span>
                  </div>
                )}
              </div>
              <div className="ventanita-pie ventanita-pie--opciones">
                {onInicio && (
                  <button type="button" className="btn btn--borde btn--chico" onClick={onInicio}>
                    <i className="fa-solid fa-house" aria-hidden="true" /> Volver al inicio
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn--primario btn--chico"
                  autoFocus
                  onClick={noCreadas.length ? () => setResultado(null) : empezarOtra}
                >
                  <i className="fa-solid fa-plus" aria-hidden="true" />{' '}
                  {noCreadas.length ? 'Reintentar las que faltan' : 'Cargar más facturas'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
