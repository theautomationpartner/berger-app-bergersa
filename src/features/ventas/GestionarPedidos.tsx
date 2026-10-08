/**
 * VENTA · Gestionar pedidos, del lado del concesionario.
 *
 * Dos trabajos: cargar un pedido nuevo y seguir los que ya mandó.
 *
 * El pedido se arma en cuatro pasos y no en una pantalla larga: lo que se pregunta en cada uno
 * depende de lo anterior. Si es compra de stock no hay cliente final; si no es contado no hay
 * descuentos; si la condición no menciona un banco, no se pregunta cuál.
 *
 * Desde que hay un tractor adentro, el pedido queda a la vista con el total de cada renglón y el
 * del pedido entero. Acá lo que se decide es un número: esconderlo hasta el resumen obliga a
 * llegar al final para descubrir que no cerraba.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Desplegable } from '@/components/ui/Desplegable'
import { useSalidaProtegida } from '@/hooks/useSalidaProtegida'
import { importe as aMoneda } from '@/lib/format'
import {
  descuentoTotalEnPorcentaje,
  totalesDePedido,
  type DescuentoConfigurado,
} from '@/lib/precios'
import {
  catalogoDeVenta,
  descuentosDeContado,
  type ProductoDeCatalogo,
} from '@/services/monday/catalogoVenta'
import { esContado, TIPO_PEDIDO, TIPO_VENTA } from '@/services/monday/columns'
import { cuentasDelCrm, etiquetasDelCrm, type CuentaCrm } from '@/services/monday/crm'
import {
  calcularRenglones,
  crearPedido,
  faltaParaElPedido,
  pagoDelPedido,
  type AltaPedido,
} from '@/services/monday/pedidos'
import { SinAcceso } from '@/services/monday/sdk'
import { CatalogoTractores } from './CatalogoTractores'
import { ClienteFinal } from './ClienteFinal'
import { FichaCuenta } from './FichaCuenta'
import { MisPedidos } from './MisPedidos'

const mensaje = (e: unknown): string => (e instanceof Error ? e.message : String(e))

type Trabajo = 'nuevo' | 'mios'

/** Las condiciones de venta y los conceptos de pago, tal como están en el tablero. */
const CONDICIONES = [
  'CONTADO',
  'BANCO',
  'BANCO - CANJE CEREAL',
  'BANCO - FINANCIACIÓN DEALER',
  'CANJE CEREAL',
  'CANJE CEREAL - BANCO',
  'CANJE CEREAL - FINANCIACIÓN CLIENTE',
  'CANJE CEREAL - FINANCIACIÓN DEALER',
  'FINANCIACIÓN CLIENTE',
  'FINANCIACIÓN DEALER - FINANCIACIÓN CLIENTE',
  'LEASING',
  'PLAN CHEQUE',
  'PLAN CHEQUE - BANCO',
  'PLAN CHEQUE - CANJE',
  'PLAN CHEQUE - CONTADO',
  'PLAN CHEQUE - DEALER',
  'PLAN CHEQUE - FINANCIACIÓN CLIENTE',
  'WHOLESALES',
]

const CONCEPTOS = [
  'Contado',
  'Transferencia Seña',
  'Plan Cheque',
  'Crédito Bancario',
  'Mutuo USD',
  'Crédito Retail',
  'Canje de Cereal',
  'Leasing',
  'Factura de Comisión',
]

const BANCOS = [
  'Banco BICE',
  'Banco Credicoop',
  'Banco de La Pampa',
  'Banco Galicia',
  'Banco Patagonia',
  'Banco Santander Rio',
  'BBVA Banco Francés',
  'GST',
]

const PLAZOS = ['30 días', '60 días', '90 días', '120 días', '12 Cuotas', '24 Cuotas', 'A Convenir']

const VACIO: AltaPedido = {
  cuentaId: '',
  cuentaNombre: '',
  equipoId: '',
  tipoPedido: '',
  tipoVenta: '',
  clientes: [],
  condicionVenta: '',
  banco: '',
  plazo: '',
  conceptoPago: '',
  renglones: [],
}

const PASOS = ['El pedido', 'Los tractores', 'El pago', 'Revisar y mandar']

interface Props {
  /** El equipo de monday del concesionario. Sale de la sesión, no de la pantalla. */
  equipoId?: string
  /** El usuario de monday que está cargando. Queda como comercial del pedido y recibe los avisos. */
  comercialId?: string
}

export function GestionarPedidos({ equipoId = '', comercialId = '' }: Props) {
  const [trabajo, setTrabajo] = useState<Trabajo>('nuevo')
  const [paso, setPaso] = useState(1)

  const [cuentas, setCuentas] = useState<CuentaCrm[]>([])
  const [catalogo, setCatalogo] = useState<ProductoDeCatalogo[]>([])
  const [descuentos, setDescuentos] = useState<DescuentoConfigurado[]>([])

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])

  const [datos, setDatos] = useState<AltaPedido>({ ...VACIO, equipoId })
  const [condicionesFiscales, setCondicionesFiscales] = useState<string[]>([])
  const [viendoFotos, setViendoFotos] = useState<ProductoDeCatalogo | null>(null)

  const recargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [c, cat, ds, et] = await Promise.all([
        cuentasDelCrm(),
        catalogoDeVenta(),
        descuentosDeContado(),
        etiquetasDelCrm(),
      ])
      setCuentas(c)
      setCondicionesFiscales(et.condicionFiscal)
      setCatalogo(cat.filter((p) => p.vigente))
      setDescuentos(ds)
    } catch (e) {
      setError(
        e instanceof SinAcceso
          ? 'la app tiene que abrirse desde monday para leer el catálogo.'
          : mensaje(e),
      )
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void recargar()
  }, [recargar])

  /* El concesionario sale de las cuentas con categoría Concesionario. Si hay una sola, se elige
     sola: preguntar algo que tiene una única respuesta es hacer trabajar al otro de gusto. */
  const concesionarios = useMemo(
    () => cuentas.filter((c) => c.categoria.toLowerCase().includes('concesionario')),
    [cuentas],
  )

  useEffect(() => {
    if (!datos.cuentaId && concesionarios.length === 1) {
      setDatos((d) => ({
        ...d,
        cuentaId: concesionarios[0].id,
        cuentaNombre: concesionarios[0].nombre,
      }))
    }
  }, [concesionarios, datos.cuentaId])

  const miConcesionario = cuentas.find((c) => c.id === datos.cuentaId) ?? null
  const esTerceros = datos.tipoPedido === TIPO_PEDIDO.TERCEROS
  const esDirecta = esTerceros && datos.tipoVenta === TIPO_VENTA.DIRECTA
  const pago = pagoDelPedido(datos)
  const contado = esContado(pago)
  /* "BANCO" aparece suelto y dentro de combinaciones: alcanza con que la condición lo mencione. */
  const pideBanco = esTerceros && datos.condicionVenta.toUpperCase().includes('BANCO')

  const renglones = useMemo(
    () => calcularRenglones(datos, descuentos, contado),
    [datos, descuentos, contado],
  )
  const totales = useMemo(() => totalesDePedido(renglones), [renglones])
  const faltan = faltaParaElPedido({ ...datos, equipoId })
  const terceros = cuentas.filter((c) => datos.clientes.some((x) => x.id === c.id))

  /* Salir a mitad de camino pregunta antes. Mientras se escribe en monday, porque el pedido son tres
     tableros y cortarlo deja uno cargado y los otros no; y con un pedido armado sin mandar, porque
     todo lo elegido vive sólo en esta pantalla. */
  const armado = Boolean(datos.tipoPedido) || datos.renglones.length > 0
  useSalidaProtegida(
    enviando
      ? 'Se está cargando el pedido en monday: el pedido, sus renglones y una unidad por tractor. Si salís ahora puede quedar cargado a medias, y no vas a ver qué faltó.'
      : armado
        ? 'Tenés un pedido a medio armar que todavía no mandaste. Si salís, se pierde todo lo que cargaste.'
        : null,
  )

  const cantidadDe = (id: string) => datos.renglones.find((r) => r.productoId === id)?.cantidad ?? 0
  const productoDe = (id: string) => catalogo.find((p) => p.id === id)

  const cambiarCantidad = (p: ProductoDeCatalogo, delta: number) => {
    setDatos((d) => {
      const actual = d.renglones.find((r) => r.productoId === p.id)
      const nueva = (actual?.cantidad ?? 0) + delta
      if (nueva <= 0) return { ...d, renglones: d.renglones.filter((r) => r.productoId !== p.id) }
      if (actual) {
        return {
          ...d,
          renglones: d.renglones.map((r) =>
            r.productoId === p.id ? { ...r, cantidad: nueva } : r,
          ),
        }
      }
      return {
        ...d,
        renglones: [
          ...d.renglones,
          {
            productoId: p.id,
            nombre: p.nombre,
            modelo: p.modelo,
            cantidad: nueva,
            precioLista: p.precio,
            iva: p.iva,
          },
        ],
      }
    })
  }

  const mandar = async () => {
    setEnviando(true)
    setErrorEnvio(null)
    setHecho(null)
    setAvisos([])
    try {
      const r = await crearPedido({ ...datos, equipoId, comercialId }, descuentos)
      setHecho(
        `${r.nombre} quedó cargado con ${r.unidades} unidad${r.unidades === 1 ? '' : 'es'}, por ${aMoneda(r.totales.facturaSinIva)} + IVA.`,
      )
      setAvisos(r.advertencias)
      setDatos({ ...VACIO, equipoId, cuentaId: datos.cuentaId, cuentaNombre: datos.cuentaNombre })
      setPaso(1)
    } catch (e) {
      setErrorEnvio(mensaje(e))
    } finally {
      setEnviando(false)
    }
  }

  /**
   * El pedido armado hasta acá.
   *
   * Cada renglón muestra el precio de una unidad y el subtotal por la cantidad, sin IVA y con IVA,
   * en columnas propias. Es la única forma de que alguien pueda controlar la cuenta: un renglón que
   * mezcla los cuatro números en una línea no se lee, se adivina.
   */
  const tablaDelPedido = (editable: boolean) => (
    <div className="pedido-tabla">
      <div className="pedido-tabla-caja">
        <table>
          <thead>
            <tr>
              <th>Tractor</th>
              <th className="n">Cant.</th>
              <th className="n">Lista s/IVA</th>
              {contado && <th className="n">Con desc. s/IVA</th>}
              <th className="n">Subtotal s/IVA</th>
              <th className="n">Subtotal c/IVA</th>
              {editable && <th aria-label="Cantidad" />}
            </tr>
          </thead>
          <tbody>
            {renglones.map((r) => {
              const p = productoDe(r.productoId)
              return (
                <tr key={r.productoId}>
                  <td className="pedido-tractor">
                    <b>{r.modelo || r.nombre}</b>
                    <small>
                      {[p?.marca, p?.linea].filter(Boolean).join(' · ') || 'Catálogo'} · IVA{' '}
                      {p?.iva ?? 0}%
                    </small>
                  </td>
                  <td className="n">{r.cantidad}</td>
                  <td className="n apagado">{aMoneda(r.precio.listaSinIva)}</td>
                  {contado && <td className="n verde">{aMoneda(r.precio.contadoSinIva)}</td>}
                  <td className="n fuerte">{aMoneda(r.precio.facturaSinIva * r.cantidad)}</td>
                  <td className="n apagado">{aMoneda(r.precio.facturaConIva * r.cantidad)}</td>
                  {editable && (
                    <td className="n">
                      <span className="contador">
                        <button
                          type="button"
                          aria-label="Uno menos"
                          onClick={() => p && cambiarCantidad(p, -1)}
                        >
                          −
                        </button>
                        <b>{r.cantidad}</b>
                        <button
                          type="button"
                          aria-label="Uno más"
                          onClick={() => p && cambiarCantidad(p, 1)}
                        >
                          +
                        </button>
                      </span>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="pedido-totales">
        <div className="pedido-linea">
          <span>Total de lista s/IVA</span>
          <b>{aMoneda(totales.listaSinIva)}</b>
        </div>
        {contado && (
          <div className="pedido-linea pedido-linea--resta">
            <span>Descuento por contado ({descuentoTotalEnPorcentaje(descuentos)}%)</span>
            <b>− {aMoneda(totales.listaSinIva - totales.contadoSinIva)}</b>
          </div>
        )}
        <div className="pedido-linea">
          <span>IVA</span>
          <b>{aMoneda(totales.facturaConIva - totales.facturaSinIva)}</b>
        </div>
        {/* El número del que se habla es el de sin IVA: es el que se factura. */}
        <div className="pedido-linea pedido-linea--total">
          <span>A facturar s/IVA</span>
          <span>{aMoneda(totales.facturaSinIva)}</span>
        </div>
        <div className="pedido-linea pedido-linea--suave">
          <span>Con IVA</span>
          <b>{aMoneda(totales.facturaConIva)}</b>
        </div>
      </div>
    </div>
  )

  return (
    <div className="scroll">
      <div className="view">
        <div className="sec-head">
          <span className="sec-num">
            <i className="fa-solid fa-cart-shopping" aria-hidden="true" />
          </span>
          <span className="sec-txt">
            <span className="sec-tit">Gestionar pedidos</span>
            <span className="sec-det">
              Cargá un pedido nuevo o seguí el estado de cada tractor de los que ya mandaste.
            </span>
          </span>
        </div>

        <div className="decision decision--grande decision--elige">
          <button
            type="button"
            aria-pressed={trabajo === 'nuevo'}
            className={`opcion opcion--confirmar${trabajo === 'nuevo' ? ' opcion--elegida' : ''}`}
            onClick={() => setTrabajo('nuevo')}
          >
            <span className="opcion-ic">
              <i className="fa-solid fa-cart-plus" aria-hidden="true" />
            </span>
            <span className="opcion-txt">
              <span className="opcion-tit">Un pedido nuevo</span>
              <span className="opcion-det">Elegir los tractores y mandar la solicitud.</span>
            </span>
          </button>
          <button
            type="button"
            aria-pressed={trabajo === 'mios'}
            className={`opcion opcion--proponer${trabajo === 'mios' ? ' opcion--elegida' : ''}`}
            onClick={() => setTrabajo('mios')}
          >
            <span className="opcion-ic">
              <i className="fa-solid fa-list-check" aria-hidden="true" />
            </span>
            <span className="opcion-txt">
              <span className="opcion-tit">Mis pedidos</span>
              <span className="opcion-det">En qué anda cada tractor que pediste.</span>
            </span>
          </button>
        </div>

        {error && (
          <div className="aviso aviso--error">
            <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
            <span>No se pudo leer el catálogo: {error}</span>
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
              El pedido quedó cargado, pero algo no se pudo hacer:
              <ul className="lista-compacta">
                {avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </span>
          </div>
        )}
        {errorEnvio && (
          <div className="aviso aviso--error">
            <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
            <span>No se pudo cargar el pedido: {errorEnvio}</span>
          </div>
        )}

        {trabajo === 'nuevo' && (
          <>
            <ol className="pasos">
              {PASOS.map((p, i) => (
                <li
                  key={p}
                  className={`paso${
                    i + 1 === paso ? ' paso--actual' : i + 1 < paso ? ' paso--hecho' : ''
                  }`}
                >
                  <span className="paso-num">{i + 1 < paso ? '✓' : i + 1}</span>
                  <span className="paso-txt">{p}</span>
                </li>
              ))}
            </ol>

            {/* ============ 1. Qué clase de pedido es y para quién ============ */}
            {paso === 1 && (
              <>
                <div className="card card--flush op-editor">
                  <div className="ctitle op-editor-head">
                    <span className="op-editor-nom">
                      <i className="fa-solid fa-file-invoice" aria-hidden="true" /> Qué clase de
                      pedido es
                    </span>
                  </div>
                  <div className="op-editor-cuerpo form-moderno">
                    <div className="datos datos--form">
                      {concesionarios.length > 1 && (
                        <div className="campo">
                          <span className="campo-lbl">
                            Concesionario <span className="campo-req">· obligatorio</span>
                          </span>
                          <Desplegable
                            valor={datos.cuentaId}
                            opciones={concesionarios.map((c) => ({
                              valor: c.id,
                              rotulo: c.nombre,
                              detalle: c.cuit ? `CUIT ${c.cuit}` : '',
                            }))}
                            vacio="Elegir…"
                            bloqueado={cargando}
                            buscable
                            onCambiar={(v) =>
                              setDatos({
                                ...datos,
                                cuentaId: v,
                                cuentaNombre: cuentas.find((c) => c.id === v)?.nombre ?? '',
                              })
                            }
                          />
                        </div>
                      )}

                      <div className="campo">
                        <span className="campo-lbl">
                          Tipo de pedido <span className="campo-req">· obligatorio</span>
                        </span>
                        <Desplegable
                          valor={datos.tipoPedido}
                          opciones={[TIPO_PEDIDO.STOCK, TIPO_PEDIDO.TERCEROS]}
                          vacio="Elegir…"
                          onCambiar={(v) =>
                            setDatos({
                              ...datos,
                              tipoPedido: v,
                              tipoVenta: '',
                              clientes: [],
                              condicionVenta: '',
                              banco: '',
                              conceptoPago: '',
                            })
                          }
                        />
                        <span className="campo-ayuda">
                          Stock es para ustedes; terceros, para venderle a un cliente final.
                        </span>
                      </div>

                      {esTerceros && (
                        <div className="campo">
                          <span className="campo-lbl">
                            Tipo de venta <span className="campo-req">· obligatorio</span>
                          </span>
                          <Desplegable
                            valor={datos.tipoVenta}
                            opciones={[TIPO_VENTA.DIRECTA, TIPO_VENTA.INDIRECTA]}
                            vacio="Elegir…"
                            /* Pasar a indirecta borra el cliente final: deja de preguntarse, y
                               dejarlo cargado escribiría en el pedido un tercero que la pantalla
                               ya no muestra. */
                            onCambiar={(v) =>
                              setDatos({
                                ...datos,
                                tipoVenta: v,
                                clientes: v === TIPO_VENTA.DIRECTA ? datos.clientes : [],
                              })
                            }
                          />
                          {/* Es lo que decide a quién le factura BERGER. */}
                          <span className="campo-ayuda">
                            {datos.tipoVenta === TIPO_VENTA.DIRECTA
                              ? 'BERGER le factura directo al cliente final.'
                              : datos.tipoVenta === TIPO_VENTA.INDIRECTA
                                ? 'BERGER les factura a ustedes, y ustedes al cliente.'
                                : 'Directa: BERGER factura al cliente. Indirecta: les factura a ustedes.'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quién pide: siempre, y con su línea de crédito, que es lo que condiciona todo. */}
                {miConcesionario && (
                  <div className="fichas">
                    <FichaCuenta
                      cuenta={miConcesionario}
                      rotulo="Concesionario que pide"
                      conCredito
                    />

                    {/* A quién se le vende, sólo en venta DIRECTA: ahí BERGER le factura al cliente
                        final y necesita saber quién es. En la indirecta y en la compra de stock la
                        factura va al concesionario, que ya está acá arriba, y preguntar por un
                        cliente que no interviene sólo haría dudar de si hay que completarlo. */}
                    {esDirecta && (
                      <ClienteFinal
                        cuentas={cuentas}
                        condicionesFiscales={condicionesFiscales}
                        elegidos={datos.clientes}
                        /* Con la función y no con `datos`: el alta de un cliente nuevo espera a
                           monday, y para cuando vuelve `datos` puede ser el de un render anterior. */
                        onCambiar={(clientes) => setDatos((d) => ({ ...d, clientes }))}
                        excluirId={datos.cuentaId}
                        cargando={cargando}
                        onCuentaNueva={(c) => setCuentas((v) => [...v, c])}
                      />
                    )}
                  </div>
                )}
              </>
            )}

            {/* ============ 2. Los tractores ============ */}
            {paso === 2 && (
              <>
                <div className="card card--flush op-editor">
                  <div className="ctitle op-editor-head">
                    <span className="op-editor-nom">
                      <i className="fa-solid fa-tractor" aria-hidden="true" /> Elegí los tractores
                    </span>
                    <span className="op-editor-chips">
                      <span className="chip chip--indigo">{catalogo.length} modelos</span>
                    </span>
                  </div>
                  <div className="op-editor-cuerpo">
                    <CatalogoTractores
                      productos={catalogo}
                      cantidadDe={cantidadDe}
                      onCambiarCantidad={cambiarCantidad}
                      onVerFotos={setViendoFotos}
                      cargando={cargando}
                    />
                  </div>
                </div>

                {/* El pedido, abajo y siempre visible mientras se elige. */}
                {renglones.length > 0 && (
                  <div className="card card--flush op-editor">
                    <div className="ctitle op-editor-head">
                      <span className="op-editor-nom">
                        <i className="fa-solid fa-receipt" aria-hidden="true" /> El pedido
                      </span>
                      <span className="op-editor-chips">
                        <span className="chip chip--verde">
                          {totales.unidades} unidad{totales.unidades === 1 ? '' : 'es'}
                        </span>
                      </span>
                    </div>
                    <div className="op-editor-cuerpo">{tablaDelPedido(true)}</div>
                  </div>
                )}
              </>
            )}

            {/* ============ 3. El pago ============ */}
            {paso === 3 && (
              <>
                <div className="card card--flush op-editor">
                  <div className="ctitle op-editor-head">
                    <span className="op-editor-nom">
                      <i className="fa-solid fa-money-bill-wave" aria-hidden="true" /> Cómo se paga
                    </span>
                  </div>
                  <div className="op-editor-cuerpo form-moderno">
                    <div className="datos datos--form">
                      {esTerceros ? (
                        <div className="campo">
                          <span className="campo-lbl">
                            Condición de venta <span className="campo-req">· obligatorio</span>
                          </span>
                          <Desplegable
                            valor={datos.condicionVenta}
                            opciones={CONDICIONES}
                            vacio="Elegir…"
                            buscable
                            onCambiar={(v) =>
                              setDatos({
                                ...datos,
                                condicionVenta: v,
                                banco: v.toUpperCase().includes('BANCO') ? datos.banco : '',
                              })
                            }
                          />
                          <span className="campo-ayuda">Cómo paga el cliente final.</span>
                        </div>
                      ) : (
                        <div className="campo">
                          <span className="campo-lbl">
                            Concepto de pago <span className="campo-req">· obligatorio</span>
                          </span>
                          <Desplegable
                            valor={datos.conceptoPago}
                            opciones={CONCEPTOS}
                            vacio="Elegir…"
                            onCambiar={(v) => setDatos({ ...datos, conceptoPago: v })}
                          />
                          <span className="campo-ayuda">
                            Cómo pagan ustedes la compra de stock.
                          </span>
                        </div>
                      )}

                      {pideBanco && (
                        <div className="campo">
                          <span className="campo-lbl">Banco</span>
                          <Desplegable
                            valor={datos.banco}
                            opciones={BANCOS}
                            vacio="Elegir…"
                            buscable
                            onCambiar={(v) => setDatos({ ...datos, banco: v })}
                          />
                        </div>
                      )}

                      <div className="campo">
                        <span className="campo-lbl">Plazo propuesto</span>
                        <Desplegable
                          valor={datos.plazo}
                          opciones={PLAZOS}
                          vacio="Elegir…"
                          onCambiar={(v) => setDatos({ ...datos, plazo: v })}
                        />
                        <span className="campo-ayuda">
                          Es una propuesta: BERGER lo confirma al aprobar el pedido.
                        </span>
                      </div>
                    </div>

                    {contado && descuentos.length > 0 && (
                      <div className="descuentos">
                        <span className="descuentos-tit">
                          <i className="fa-solid fa-tags" aria-hidden="true" /> Descuentos por
                          contado
                        </span>
                        <div className="descuentos-lista">
                          {descuentos.map((d) => (
                            <span key={d.orden} className="descuento">
                              <b>{d.porcentaje}%</b>
                              <small>Descuento {d.orden}</small>
                            </span>
                          ))}
                          <span className="descuento descuento--total">
                            <b>{descuentoTotalEnPorcentaje(descuentos)}%</b>
                            <small>en total</small>
                          </span>
                        </div>
                        {/* Es la cuenta que nadie hace bien de cabeza. */}
                        <span className="campo-ayuda">
                          Se aplican uno sobre otro, en ese orden: el segundo sobre lo que quedó del
                          primero. Por eso el total no es la suma.
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Elegir la forma de pago cambia los números: se ven acá mismo, sin ir al resumen. */}
                {renglones.length > 0 && (
                  <div className="card card--flush op-editor">
                    <div className="ctitle op-editor-head">
                      <span className="op-editor-nom">
                        <i className="fa-solid fa-receipt" aria-hidden="true" /> Cómo queda el
                        pedido
                      </span>
                      {contado && (
                        <span className="op-editor-chips">
                          <span className="chip chip--verde">con descuento por contado</span>
                        </span>
                      )}
                    </div>
                    <div className="op-editor-cuerpo">{tablaDelPedido(false)}</div>
                  </div>
                )}
              </>
            )}

            {/* ============ 4. Revisar y mandar ============ */}
            {paso === 4 && (
              <>
                <div className="fichas">
                  {miConcesionario && (
                    <FichaCuenta
                      cuenta={miConcesionario}
                      rotulo="Concesionario que pide"
                      conCredito
                    />
                  )}
                  {terceros.map((c) => (
                    <FichaCuenta key={c.id} cuenta={c} rotulo="Cliente final" />
                  ))}
                </div>

                <div className="card card--flush op-editor">
                  <div className="ctitle op-editor-head">
                    <span className="op-editor-nom">
                      <i className="fa-solid fa-clipboard-check" aria-hidden="true" /> El pedido que
                      se va a mandar
                    </span>
                    <span className="op-editor-chips">
                      {datos.tipoPedido && (
                        <span className="chip chip--indigo">{datos.tipoPedido}</span>
                      )}
                      {datos.tipoVenta && (
                        <span className="chip chip--azul">{datos.tipoVenta}</span>
                      )}
                      {pago && <span className="chip chip--verde">{pago}</span>}
                    </span>
                  </div>
                  <div className="op-editor-cuerpo">
                    <dl className="datos-pares">
                      <div>
                        <dt>Forma de pago</dt>
                        <dd>{pago || '—'}</dd>
                      </div>
                      {datos.banco && (
                        <div>
                          <dt>Banco</dt>
                          <dd>{datos.banco}</dd>
                        </div>
                      )}
                      {datos.plazo && (
                        <div>
                          <dt>Plazo propuesto</dt>
                          <dd>{datos.plazo}</dd>
                        </div>
                      )}
                      <div>
                        <dt>Modelos distintos</dt>
                        <dd>{renglones.length}</dd>
                      </div>
                      <div>
                        <dt>Unidades</dt>
                        <dd>{totales.unidades}</dd>
                      </div>
                    </dl>

                    {tablaDelPedido(false)}

                    <div className="aviso aviso--neutro">
                      <i className="fa-solid fa-circle-info" aria-hidden="true" />
                      <span>
                        Al mandarlo se crea el pedido y <b>{totales.unidades}</b> unidad
                        {totales.unidades === 1 ? '' : 'es'} —una por tractor— para que BERGER las
                        apruebe y les asigne inventario de a una.
                      </span>
                    </div>

                    {faltan.length > 0 && (
                      <span className="campo-ayuda campo-ayuda--falta">
                        <i className="fa-solid fa-lock" aria-hidden="true" /> Falta{' '}
                        {faltan.join(', ')}.
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* La barra de abajo: dónde estoy, cuánto va y qué sigue. */}
            <div className="barra-pasos">
              {paso > 1 ? (
                <button
                  type="button"
                  className="btn btn--texto btn--chico"
                  disabled={enviando}
                  onClick={() => setPaso(paso - 1)}
                >
                  ← Volver
                </button>
              ) : (
                <span />
              )}

              <span className="barra-pasos-total">
                {totales.unidades > 0 ? (
                  <>
                    {totales.unidades} unidad{totales.unidades === 1 ? '' : 'es'} ·{' '}
                    <b>{aMoneda(totales.facturaSinIva)}</b> + IVA
                  </>
                ) : (
                  'Todavía no agregaste ningún tractor'
                )}
              </span>

              {paso < 4 ? (
                <button
                  type="button"
                  className="btn btn--primario"
                  disabled={
                    cargando ||
                    (paso === 1 &&
                      (!datos.cuentaId ||
                        !datos.tipoPedido ||
                        (esTerceros && !datos.tipoVenta) ||
                        (esDirecta && terceros.length === 0))) ||
                    (paso === 2 && datos.renglones.length === 0) ||
                    (paso === 3 && !pago)
                  }
                  onClick={() => setPaso(paso + 1)}
                >
                  Seguir →
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--primario"
                  disabled={enviando || faltan.length > 0}
                  onClick={() => void mandar()}
                >
                  <i className="fa-solid fa-paper-plane" aria-hidden="true" />{' '}
                  {enviando ? 'Mandando…' : 'Mandar el pedido'}
                </button>
              )}
            </div>
          </>
        )}

        {trabajo === 'mios' && <MisPedidos equipoId={equipoId} usuarioId={comercialId} />}

        {viendoFotos && (
          <>
            <button
              className="lateral-fondo"
              aria-label="Cerrar"
              onClick={() => setViendoFotos(null)}
            />
            <div className="galeria">
              <div className="galeria-head">
                <span>{viendoFotos.modelo || viendoFotos.nombre}</span>
                <button type="button" onClick={() => setViendoFotos(null)} aria-label="Cerrar">
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              </div>
              <div className="galeria-fotos">
                {viendoFotos.imagenes.map((u) => (
                  <img key={u} src={u} alt={viendoFotos.modelo} />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
