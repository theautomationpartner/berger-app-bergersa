/**
 * VENTA · Cargar factura. Es de BERGER.
 *
 * Se elige tractor por tractor —las unidades de 🛍️Pedidos x UNIDAD, una por chasis—, no el renglón
 * con su cantidad: de un pedido de cinco tractores del mismo modelo se pueden facturar dos hoy y
 * tres la semana que viene. Una factura junta tractores de varios pedidos, pero de UN solo
 * concesionario: el primer tractor elegido fija a quién se le factura, y los de los demás quedan
 * bloqueados hasta que se vacíe la selección.
 *
 * La pantalla está partida en dos para no tener que bajar a buscar el botón: a la izquierda los
 * pedidos —plegados, con sus etiquetas, y se despliegan para elegir—, y a la derecha la factura,
 * siempre a la vista, con lo elegido, los montos y el PDF.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { DesplegableMulti } from '@/components/ui/DesplegableMulti'
import { Plata } from '@/components/ui/Plata'
import { ZonaArchivo } from '@/components/ui/ZonaArchivo'
import { useSalidaProtegida } from '@/hooks/useSalidaProtegida'
import { normalizar } from '@/lib/format'
import { ESTADO_UNIDAD } from '@/services/monday/columns'
import {
  cargarFactura,
  montosSugeridos,
  nombreDelTractor,
  pedidoFacturable,
  porQueNoSeFactura,
  problemaDeFactura,
  unidadesParaFacturar,
  urlDeFactura,
  type ResultadoFactura,
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

/** Lo que se escribe a mano. Los montos, vacíos, toman lo que suman los tractores. */
interface Datos {
  numero: string
  fechaEmision: string
  fechaVencimiento: string
  neto: string
  iva: string
  notas: string
}

const DATOS_VACIOS = (): Datos => ({
  numero: '',
  fechaEmision: hoy(),
  fechaVencimiento: '',
  neto: '',
  iva: '',
  notas: '',
})

/** Un número escrito a mano, con coma o con punto. Vacío o inválido es `null`. */
function aNumero(v: string): number | null {
  const limpio = v.trim().replace(/\s/g, '')
  if (!limpio) return null
  /* "1.234,56" y "1234.56" valen igual: si hay coma, la coma es la de los decimales. */
  const n = Number(limpio.includes(',') ? limpio.replace(/\./g, '').replace(',', '.') : limpio)
  return Number.isFinite(n) ? n : null
}

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

  /** Los tractores elegidos, por id de unidad. */
  const [elegidas, setElegidas] = useState<string[]>([])
  const [datos, setDatos] = useState<Datos>(DATOS_VACIOS)
  const [archivo, setArchivo] = useState<File | null>(null)

  const [confirmando, setConfirmando] = useState(false)
  const [trabajando, setTrabajando] = useState(false)
  const [resultado, setResultado] = useState<
    (ResultadoFactura & { numero: string; tractores: string[]; concesionario: string }) | null
  >(null)

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
  /** A quién se le factura: lo fija el primer tractor elegido. */
  const cuentaFijada = seleccion.length > 0 ? (porPedido.get(seleccion[0].pedidoId)?.cuentaId ?? '') : ''
  const concesionarioFijado =
    seleccion.length > 0 ? (porPedido.get(seleccion[0].pedidoId)?.cuentaNombre ?? '') : ''

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

  const sugeridos = useMemo(() => montosSugeridos(seleccion), [seleccion])
  const neto = aNumero(datos.neto) ?? sugeridos.neto
  const iva = aNumero(datos.iva) ?? sugeridos.iva

  /* Qué falta, dicho en el orden en que se completa. */
  const falta = useMemo(() => {
    const regla = problemaDeFactura(seleccion, pedidos)
    if (regla) return regla
    if (!datos.numero.trim()) return 'Falta el número de la factura.'
    if (!datos.fechaEmision) return 'Falta la fecha de emisión.'
    if (!archivo) return 'Falta adjuntar el PDF de la factura.'
    if (neto <= 0) return 'El monto neto tiene que ser mayor a cero.'
    return null
  }, [seleccion, pedidos, datos, archivo, neto])

  useSalidaProtegida(
    trabajando
      ? 'Se está cargando la factura en monday: la factura, sus tractores y los estados. Si salís ahora puede quedar a medias.'
      : seleccion.length > 0 || archivo
        ? 'Tenés una factura a medio cargar. Si salís, se pierde lo elegido.'
        : null,
  )

  const alternar = (u: UnidadFacturable) =>
    setElegidas((e) => (e.includes(u.id) ? e.filter((x) => x !== u.id) : [...e, u.id]))

  /** Por qué este tractor no se puede tildar AHORA: el de siempre, o que es de otro concesionario. */
  const bloqueo = (u: UnidadFacturable, p: PedidoLeido): string | null =>
    porQueNoSeFactura(u) ?? (cuentaFijada && p.cuentaId !== cuentaFijada ? 'Otro concesionario' : null)

  const empezarOtra = () => {
    setElegidas([])
    setDatos(DATOS_VACIOS())
    setArchivo(null)
    setResultado(null)
  }

  const guardar = async () => {
    if (!archivo || falta) return
    setTrabajando(true)
    setError(null)
    try {
      const r = await cargarFactura(
        {
          numero: datos.numero,
          fechaEmision: datos.fechaEmision,
          fechaVencimiento: datos.fechaVencimiento,
          neto,
          iva,
          notas: datos.notas,
          archivo,
        },
        seleccion,
        pedidos,
        unidades,
      )
      setResultado({
        ...r,
        numero: datos.numero.trim(),
        tractores: seleccion.map(nombreDelTractor),
        concesionario: concesionarioFijado,
      })
      setElegidas([])
      setDatos(DATOS_VACIOS())
      setArchivo(null)
      await recargar()
    } catch (e) {
      setError(mensaje(e))
    } finally {
      setTrabajando(false)
    }
  }

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
              Elegí los tractores asignados de un concesionario —de uno o de varios pedidos— y
              subí la factura en PDF.
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
              en esta factura
              <small>{concesionarioFijado || 'Todavía sin concesionario'}</small>
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
                const disponibles = suyas.filter((u) => !bloqueo(u, p))
                const elegidasAca = suyas.filter((u) => elegidas.includes(u.id)).length
                const deOtro = Boolean(cuentaFijada) && p.cuentaId !== cuentaFijada
                const paraFacturar = suyas.filter((u) => !porQueNoSeFactura(u)).length
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
                          <i className="fa-solid fa-store" aria-hidden="true" /> {p.cuentaNombre || 'Sin concesionario'}
                        </span>
                        <span className={`chip ${deOtro ? 'chip--gris' : 'chip--verde'}`}>
                          {paraFacturar} para facturar
                        </span>
                        {elegidasAca > 0 && (
                          <span className="chip chip--azul">
                            <i className="fa-solid fa-check" aria-hidden="true" /> {elegidasAca} en la factura
                          </span>
                        )}
                      </>
                    }
                    costado={
                      <div className="fact-tractores">
                        <div className="fact-tractores-head">
                          <span className="unidades-tit">Tractores del pedido</span>
                          {disponibles.length > 0 && (
                            <button
                              type="button"
                              className="btn btn--texto btn--chico"
                              disabled={trabajando}
                              onClick={() =>
                                setElegidas((e) => [
                                  ...new Set([
                                    ...e,
                                    ...disponibles.map((u) => u.id),
                                  ]),
                                ])
                              }
                            >
                              <i className="fa-solid fa-check-double" aria-hidden="true" /> Elegir los{' '}
                              {disponibles.length}
                            </button>
                          )}
                        </div>
                        {deOtro && (
                          <div className="aviso aviso--alerta">
                            <i className="fa-solid fa-lock" aria-hidden="true" />
                            <span>
                              La factura que estás armando es de <b>{concesionarioFijado}</b>. Para
                              facturar este pedido, vaciá la selección.
                            </span>
                          </div>
                        )}
                        {suyas.map((u) => {
                          const por = bloqueo(u, p)
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
                                  {u.chasis ? `Chasis ${u.chasis}` : u.inventarioNombre || 'Sin tractor del inventario'}
                                  {u.chasis && u.inventarioNombre ? ` · ${u.inventarioNombre}` : ''}
                                </small>
                              </span>
                              <span className="fact-tractor-der">
                                <span className={`chip ${tonoDeUnidad(u.estado)}`}>{u.estado || 'Sin estado'}</span>
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

          {/* La factura, siempre a la vista. */}
          <aside className="facturar-panel">
            <div className="facturar-panel-tit">
              <i className="fa-solid fa-file-invoice-dollar" aria-hidden="true" /> La factura
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

            <dl className="datos-pares facturar-a">
              <div>
                <dt>Concesionario</dt>
                <dd>{concesionarioFijado || '— lo fija el primer tractor que elijas'}</dd>
              </div>
            </dl>

            {seleccion.length === 0 ? (
              <span className="campo-ayuda">
                Desplegá un pedido y tildá los tractores que entran en esta factura.
              </span>
            ) : (
              <ul className="fact-elegidos">
                {seleccion.map((u) => (
                  <li key={u.id}>
                    <span>
                      <b>{nombreDelTractor(u)}</b>
                      <small>{porPedido.get(u.pedidoId)?.nombre}</small>
                    </span>
                    <Plata valor={u.precios.facturaSinIva ?? 0} />
                    <button
                      type="button"
                      className="unir-quitar"
                      aria-label="Quitar"
                      disabled={trabajando}
                      onClick={() => alternar(u)}
                    >
                      <i className="fa-solid fa-xmark" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="facturar-campos">
              <label className="campo facturar-campos-ancho">
                <span className="campo-lbl">
                  N° de factura <span className="campo-req">· obligatorio</span>
                </span>
                <input
                  className="input"
                  placeholder="Ej.: A-0001-00001234"
                  value={datos.numero}
                  onChange={(e) => setDatos({ ...datos, numero: e.target.value })}
                />
              </label>
              <label className="campo">
                <span className="campo-lbl">
                  Emisión <span className="campo-req">· obligatorio</span>
                </span>
                <input
                  className="input"
                  type="date"
                  value={datos.fechaEmision}
                  onChange={(e) => setDatos({ ...datos, fechaEmision: e.target.value })}
                />
              </label>
              <label className="campo">
                <span className="campo-lbl">Vencimiento</span>
                <input
                  className="input"
                  type="date"
                  value={datos.fechaVencimiento}
                  onChange={(e) => setDatos({ ...datos, fechaVencimiento: e.target.value })}
                />
              </label>
              <label className="campo">
                <span className="campo-lbl">Neto (USD)</span>
                <input
                  className="input input--num"
                  inputMode="decimal"
                  placeholder={sugeridos.neto.toLocaleString('es-AR')}
                  value={datos.neto}
                  onChange={(e) => setDatos({ ...datos, neto: e.target.value })}
                />
              </label>
              <label className="campo">
                <span className="campo-lbl">IVA (USD)</span>
                <input
                  className="input input--num"
                  inputMode="decimal"
                  placeholder={sugeridos.iva.toLocaleString('es-AR')}
                  value={datos.iva}
                  onChange={(e) => setDatos({ ...datos, iva: e.target.value })}
                />
              </label>
              <span className="campo-ayuda facturar-campos-ancho">
                Vacíos, toman lo que suman los tractores (factura s/IVA y c/IVA de cada unidad).
              </span>
            </div>

            <div className="totales-pedido totales-pedido--dos">
              <div className="total-cuadro">
                <small>Neto + IVA</small>
                <Plata valor={neto} apagado />
              </div>
              <div className="total-cuadro total-cuadro--fuerte">
                <small>Total de la factura</small>
                <Plata valor={neto + iva} grande />
              </div>
            </div>

            <div className="campo">
              <span className="campo-lbl">
                Factura en PDF <span className="campo-req">· obligatorio</span>
              </span>
              <ZonaArchivo
                archivo={archivo}
                onElegir={setArchivo}
                acepta=".pdf"
                titulo="Arrastrá el PDF de la factura o hacé clic"
              />
            </div>

            <label className="campo">
              <span className="campo-lbl">Notas</span>
              <textarea
                className="input textarea"
                rows={2}
                value={datos.notas}
                onChange={(e) => setDatos({ ...datos, notas: e.target.value })}
              />
            </label>

            {falta && seleccion.length > 0 && (
              <span className="campo-ayuda campo-ayuda--aviso">{falta}</span>
            )}
            <button
              type="button"
              className="btn btn--primario facturar-boton"
              disabled={Boolean(falta) || trabajando}
              onClick={() => setConfirmando(true)}
            >
              <i className={`fa-solid ${trabajando ? 'fa-spinner fa-spin' : 'fa-file-arrow-up'}`} aria-hidden="true" />{' '}
              {trabajando
                ? 'Cargando la factura…'
                : `Cargar factura${seleccion.length > 0 ? ` (${seleccion.length} tractor${seleccion.length === 1 ? '' : 'es'})` : ''}`}
            </button>
          </aside>
        </div>

        {confirmando && (
          <>
            <button className="lateral-fondo" aria-label="Cancelar" onClick={() => setConfirmando(false)} />
            <div className="ventanita" role="dialog" aria-modal="true">
              <div className="ventanita-head">
                <span>¿Cargar la factura {datos.numero.trim()}?</span>
                <button type="button" onClick={() => setConfirmando(false)} aria-label="Cerrar">
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              </div>
              <div className="ventanita-cuerpo">
                <span className="campo-lbl">
                  {concesionarioFijado} · <Plata valor={neto + iva} /> con IVA
                </span>
                <ul className="lista-compacta">
                  {seleccion.map((u) => (
                    <li key={u.id}>
                      <b>{nombreDelTractor(u)}</b> — {porPedido.get(u.pedidoId)?.nombre}
                    </li>
                  ))}
                </ul>
                <span className="campo-ayuda">
                  Se crea la factura con su PDF y un subelemento por tractor. Cada tractor pasa a
                  Facturado en Pedidos x UNIDAD y en el Inventario, y su renglón y su pedido a
                  Facturado (o Facturado Parcialmente si les queda alguno). Desde la app no se
                  deshace.
                </span>
              </div>
              <div className="ventanita-pie">
                <button type="button" className="btn btn--borde btn--chico" autoFocus onClick={() => setConfirmando(false)}>
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
                  <i className="fa-solid fa-circle-check texto-verde" aria-hidden="true" /> Factura cargada
                </span>
                <button type="button" onClick={() => setResultado(null)} aria-label="Cerrar">
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              </div>
              <div className="ventanita-cuerpo">
                <span className="exito-titulo">
                  La factura {resultado.numero} de {resultado.concesionario} fue cargada con{' '}
                  {resultado.tractores.length} tractor{resultado.tractores.length === 1 ? '' : 'es'}.
                </span>
                <ul className="exito-lista">
                  {resultado.tractores.map((t) => (
                    <li key={t}>
                      <i className="fa-solid fa-tractor" aria-hidden="true" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
                <span className="resumen-chips">
                  {resultado.pedidos.map((p) => (
                    <span key={p.id} className={`chip ${tonoDeEstado(p.estado)}`}>
                      {p.nombre}: {p.estado}
                    </span>
                  ))}
                </span>
                {resultado.advertencias.length > 0 && (
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
                <a
                  className="btn btn--borde btn--chico"
                  href={urlDeFactura(resultado.facturaId)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /> Ver en monday
                </a>
                <button type="button" className="btn btn--primario btn--chico" autoFocus onClick={empezarOtra}>
                  <i className="fa-solid fa-plus" aria-hidden="true" /> Cargar otra factura
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
