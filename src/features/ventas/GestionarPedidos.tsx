/**
 * VENTA · Gestionar pedidos, del lado del concesionario.
 *
 * Dos trabajos: cargar un pedido nuevo y seguir los que ya mandó. Arriba, quién es y a qué
 * concesionario pertenece —dato que no se elige, sale de su fila de la Lista Blanca y de la cuenta
 * del CRM—, porque un comercial que carga un pedido para el concesionario equivocado es un
 * problema que después hay que deshacer a mano en tres tableros.
 *
 * El pedido se arma en cuatro pasos y no en una pantalla larga: lo que se pregunta en cada uno
 * depende de lo anterior. Si es compra de stock no hay cliente final; si no es contado no hay
 * descuentos; si la condición no menciona un banco, no se pregunta cuál.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Desplegable } from '@/components/ui/Desplegable'
import { SelectorBuscableMulti } from '@/components/ui/SelectorBuscable'
import { importe as aMoneda } from '@/lib/format'
import { descuentoTotalEnPorcentaje, type DescuentoConfigurado } from '@/lib/precios'
import {
  catalogoDeVenta,
  descuentosDeContado,
  type ProductoDeCatalogo,
} from '@/services/monday/catalogoVenta'
import { esContado, TIPO_PEDIDO, TIPO_VENTA } from '@/services/monday/columns'
import { cuentasDelCrm, type CuentaCrm } from '@/services/monday/crm'
import {
  calcularRenglones,
  crearPedido,
  faltaParaElPedido,
  pagoDelPedido,
  type AltaPedido,
} from '@/services/monday/pedidos'
import { SinAcceso } from '@/services/monday/sdk'
import { totalesDePedido } from '@/lib/precios'

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
  tipoPedido: '',
  tipoVenta: '',
  clienteIds: [],
  condicionVenta: '',
  banco: '',
  plazo: '',
  conceptoPago: '',
  renglones: [],
}

export function GestionarPedidos() {
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

  const [datos, setDatos] = useState<AltaPedido>(VACIO)
  const [busqueda, setBusqueda] = useState('')
  const [viendoFotos, setViendoFotos] = useState<ProductoDeCatalogo | null>(null)

  const recargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [c, cat, ds] = await Promise.all([
        cuentasDelCrm(),
        catalogoDeVenta(),
        descuentosDeContado(),
      ])
      setCuentas(c)
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

  /* El concesionario sale de las cuentas con categoría Concesionario. Mientras haya una sola, se
     elige sola: preguntarle a alguien algo que tiene una única respuesta es hacerlo trabajar. */
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
  const pago = pagoDelPedido(datos)
  const contado = esContado(pago)
  /* "BANCO" aparece suelto y dentro de combinaciones: alcanza con que la condición lo mencione. */
  const pideBanco = esTerceros && datos.condicionVenta.toUpperCase().includes('BANCO')

  const renglones = useMemo(
    () => calcularRenglones(datos, descuentos, contado),
    [datos, descuentos, contado],
  )
  const totales = useMemo(() => totalesDePedido(renglones), [renglones])
  const faltan = faltaParaElPedido(datos)

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return catalogo
    return catalogo.filter((p) =>
      `${p.nombre} ${p.modelo} ${p.codigo} ${p.marca} ${p.linea} ${p.gama}`
        .toLowerCase()
        .includes(q),
    )
  }, [catalogo, busqueda])

  const cantidadDe = (id: string) => datos.renglones.find((r) => r.productoId === id)?.cantidad ?? 0

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
      const r = await crearPedido(datos, descuentos)
      setHecho(
        `${r.nombre} quedó cargado con ${r.unidades} unidad${r.unidades === 1 ? '' : 'es'}, por ${aMoneda(r.totales.facturaSinIva)} + IVA.`,
      )
      setAvisos(r.advertencias)
      setDatos({ ...VACIO, cuentaId: datos.cuentaId, cuentaNombre: datos.cuentaNombre })
      setPaso(1)
    } catch (e) {
      setErrorEnvio(mensaje(e))
    } finally {
      setEnviando(false)
    }
  }

  const PASOS = ['El pedido', 'Los tractores', 'El pago', 'Revisar y mandar']

  /* ---------------- pantalla ---------------- */

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

        {/* Quién es y de dónde: no se elige, sale de la cuenta del CRM. */}
        {miConcesionario && (
          <div className="ficha-concesionario">
            <span className="ficha-concesionario-ic">
              <i className="fa-solid fa-store" aria-hidden="true" />
            </span>
            <span className="ficha-concesionario-txt">
              <span className="ficha-concesionario-nom">{miConcesionario.nombre}</span>
              <span className="ficha-concesionario-det">
                {[miConcesionario.direccion, miConcesionario.ciudad, miConcesionario.provincia]
                  .filter(Boolean)
                  .join(', ') || 'Sin dirección cargada'}
              </span>
            </span>
          </div>
        )}

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
          <div className="aviso aviso--error" style={{ marginTop: 14 }}>
            <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
            <span>No se pudo leer el catálogo: {error}</span>
          </div>
        )}

        {hecho && (
          <div className="aviso aviso--ok" style={{ marginTop: 14 }}>
            <i className="fa-solid fa-circle-check" aria-hidden="true" />
            <span>{hecho}</span>
          </div>
        )}

        {avisos.length > 0 && (
          <div className="aviso aviso--alerta" style={{ marginTop: 14 }}>
            <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
            <span>
              Quedó algo sin hacer:
              <ul className="lista-compacta">
                {avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </span>
          </div>
        )}

        {errorEnvio && (
          <div className="aviso aviso--error" style={{ marginTop: 14 }}>
            <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
            <span>No se pudo cargar el pedido: {errorEnvio}</span>
          </div>
        )}

        {trabajo === 'nuevo' && (
          <>
            {/* Los pasos, para saber cuánto falta. */}
            <ol className="pasos">
              {PASOS.map((p, i) => (
                <li
                  key={p}
                  className={`paso${i + 1 === paso ? ' paso--actual' : i + 1 < paso ? ' paso--hecho' : ''}`}
                >
                  <span className="paso-num">{i + 1 < paso ? '✓' : i + 1}</span>
                  <span className="paso-txt">{p}</span>
                </li>
              ))}
            </ol>

            <div className="card card--flush op-editor">
              <div className="op-editor-cuerpo form-moderno">
                {/* ---------- 1. El pedido ---------- */}
                {paso === 1 && (
                  <>
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
                            }))}
                            vacio="Elegir…"
                            bloqueado={cargando}
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
                              /* Pasar de terceros a stock deja datos que ya no corresponden. */
                              tipoVenta: '',
                              clienteIds: [],
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
                            onCambiar={(v) => setDatos({ ...datos, tipoVenta: v })}
                          />
                          {/* Es la diferencia que decide a quién le factura BERGER. */}
                          <span className="campo-ayuda">
                            {datos.tipoVenta === TIPO_VENTA.DIRECTA
                              ? 'BERGER le factura al cliente final.'
                              : datos.tipoVenta === TIPO_VENTA.INDIRECTA
                                ? 'BERGER les factura a ustedes, como en compra de stock.'
                                : 'Directa: BERGER factura al cliente. Indirecta: les factura a ustedes.'}
                          </span>
                        </div>
                      )}
                    </div>

                    {esTerceros && (
                      <div className="sub-bloque">
                        <span className="sub-bloque-tit">
                          <i className="fa-solid fa-users" aria-hidden="true" /> El cliente final
                        </span>
                        <SelectorBuscableMulti
                          valores={datos.clienteIds}
                          opciones={cuentas
                            .filter((c) => c.id !== datos.cuentaId)
                            .map((c) => ({
                              valor: c.id,
                              rotulo: c.nombre,
                              detalle: [c.cuit && `CUIT ${c.cuit}`, c.ciudad]
                                .filter(Boolean)
                                .join(' · '),
                            }))}
                          vacio="Escribí el nombre o el CUIT"
                          queSon="cuentas"
                          fichasGrandes
                          bloqueado={cargando}
                          onCambiar={(ids) => setDatos({ ...datos, clienteIds: ids })}
                        />
                        <span className="campo-ayuda">
                          Puede ser más de uno. Si todavía no está cargado, se da de alta en
                          «Cuentas y contactos» y vuelve acá.
                        </span>
                      </div>
                    )}
                  </>
                )}

                {/* ---------- 2. Los tractores ---------- */}
                {paso === 2 && (
                  <>
                    <div className="campo campo--busqueda">
                      <input
                        className="input"
                        placeholder="Buscar por modelo, código, línea o gama…"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                      />
                    </div>

                    <div className="catalogo">
                      {visibles.map((p) => {
                        const q = cantidadDe(p.id)
                        return (
                          <div
                            key={p.id}
                            className={`producto${q > 0 ? ' producto--elegido' : ''}`}
                          >
                            <div className="producto-head">
                              <span className="producto-nom">{p.modelo || p.nombre}</span>
                              {p.imagenes.length > 0 && (
                                <button
                                  type="button"
                                  className="btn btn--texto btn--chico"
                                  onClick={() => setViendoFotos(p)}
                                >
                                  <i className="fa-solid fa-image" aria-hidden="true" />{' '}
                                  {p.imagenes.length}
                                </button>
                              )}
                            </div>
                            <div className="producto-datos">
                              {p.marca && <span className="chip chip--gris">{p.marca}</span>}
                              {p.linea && <span className="chip chip--gris">{p.linea}</span>}
                              {p.gama && <span className="chip chip--gris">{p.gama}</span>}
                              {p.traccion && (
                                <span className="chip chip--gris">Tracción {p.traccion}</span>
                              )}
                              {p.potenciaKw != null && (
                                <span className="chip chip--gris">{p.potenciaKw} kW</span>
                              )}
                              {p.cilindrada != null && (
                                <span className="chip chip--gris">{p.cilindrada} cm³</span>
                              )}
                            </div>
                            {p.rodado && <div className="producto-rodado">Rodado: {p.rodado}</div>}
                            <div className="producto-pie">
                              <span className="producto-precio">
                                {aMoneda(p.precio)}
                                <small> + IVA {p.iva}%</small>
                              </span>
                              {q > 0 ? (
                                <span className="contador">
                                  <button type="button" onClick={() => cambiarCantidad(p, -1)}>
                                    −
                                  </button>
                                  <b>{q}</b>
                                  <button type="button" onClick={() => cambiarCantidad(p, 1)}>
                                    +
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn--borde btn--chico"
                                  onClick={() => cambiarCantidad(p, 1)}
                                >
                                  Agregar
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                      {visibles.length === 0 && (
                        <div className="aviso aviso--neutro">
                          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                          <span>No hay ningún tractor que coincida con «{busqueda}».</span>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* ---------- 3. El pago ---------- */}
                {paso === 3 && (
                  <>
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
                        </div>
                      )}

                      {/* El banco sólo si la condición lo menciona. */}
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

                      {(datos.conceptoPago === 'Crédito Bancario' || pideBanco || esTerceros) && (
                        <div className="campo">
                          <span className="campo-lbl">Plazo propuesto</span>
                          <Desplegable
                            valor={datos.plazo}
                            opciones={PLAZOS}
                            vacio="Elegir…"
                            onCambiar={(v) => setDatos({ ...datos, plazo: v })}
                          />
                        </div>
                      )}
                    </div>

                    {/* Los descuentos, sólo con contado y antes de ver un solo número. */}
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
                  </>
                )}

                {/* ---------- 4. Revisar ---------- */}
                {paso === 4 && (
                  <>
                    <div className="resumen-pedido">
                      <div className="dl-row">
                        <span>Concesionario</span>
                        <b>{datos.cuentaNombre || '—'}</b>
                      </div>
                      <div className="dl-row">
                        <span>Tipo de pedido</span>
                        <b>
                          {datos.tipoPedido}
                          {esTerceros && datos.tipoVenta ? ` · ${datos.tipoVenta}` : ''}
                        </b>
                      </div>
                      {esTerceros && (
                        <div className="dl-row">
                          <span>Cliente final</span>
                          <b>
                            {datos.clienteIds
                              .map((id) => cuentas.find((c) => c.id === id)?.nombre ?? id)
                              .join(', ') || '—'}
                          </b>
                        </div>
                      )}
                      <div className="dl-row">
                        <span>Pago</span>
                        <b>
                          {pago || '—'}
                          {datos.banco ? ` · ${datos.banco}` : ''}
                          {datos.plazo ? ` · ${datos.plazo}` : ''}
                        </b>
                      </div>
                    </div>

                    <table className="prod-table" style={{ marginTop: 14 }}>
                      <thead>
                        <tr>
                          <th>Tractor</th>
                          <th style={{ textAlign: 'center' }}>Cant.</th>
                          <th style={{ textAlign: 'right' }}>Lista s/IVA</th>
                          {contado && <th style={{ textAlign: 'right' }}>Con descuento</th>}
                          <th style={{ textAlign: 'right' }}>Subtotal s/IVA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {renglones.map((r) => (
                          <tr key={r.productoId}>
                            <td>
                              <b>{r.modelo || r.nombre}</b>
                            </td>
                            <td style={{ textAlign: 'center' }}>{r.cantidad}</td>
                            <td style={{ textAlign: 'right' }}>{aMoneda(r.precio.listaSinIva)}</td>
                            {contado && (
                              <td style={{ textAlign: 'right' }}>
                                {aMoneda(r.precio.contadoSinIva)}
                              </td>
                            )}
                            <td style={{ textAlign: 'right' }}>
                              <b>{aMoneda(r.precio.facturaSinIva * r.cantidad)}</b>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="totales">
                      <div className="res-line">
                        <span>Total de lista s/IVA</span>
                        <b>{aMoneda(totales.listaSinIva)}</b>
                      </div>
                      {contado && (
                        <div className="res-line neg">
                          <span>Descuento por contado</span>
                          <b>- {aMoneda(totales.listaSinIva - totales.contadoSinIva)}</b>
                        </div>
                      )}
                      <div className="res-line">
                        <span>IVA</span>
                        <b>{aMoneda(totales.facturaConIva - totales.facturaSinIva)}</b>
                      </div>
                      {/* Lo que se factura es el de SIN IVA: es el número del que se habla. */}
                      <div className="res-line tot">
                        <span>A facturar s/IVA</span>
                        <span>{aMoneda(totales.facturaSinIva)}</span>
                      </div>
                      <div className="res-line">
                        <span>Con IVA</span>
                        <b>{aMoneda(totales.facturaConIva)}</b>
                      </div>
                      <div className="res-line">
                        <span>Unidades</span>
                        <b>{totales.unidades}</b>
                      </div>
                    </div>

                    <div className="aviso aviso--neutro" style={{ marginTop: 12 }}>
                      <i className="fa-solid fa-circle-info" aria-hidden="true" />
                      <span>
                        Al mandarlo se crea el pedido y <b>{totales.unidades}</b> unidad
                        {totales.unidades === 1 ? '' : 'es'} —una por tractor— para que BERGER las
                        apruebe y les asigne inventario de a una.
                      </span>
                    </div>
                  </>
                )}

                {faltan.length > 0 && paso === 4 && (
                  <span className="campo-ayuda campo-ayuda--falta" style={{ marginTop: 8 }}>
                    <i className="fa-solid fa-lock" aria-hidden="true" /> Falta {faltan.join(', ')}.
                  </span>
                )}

                <div className="op-editor-acciones">
                  {paso > 1 && (
                    <button
                      type="button"
                      className="btn btn--texto btn--chico"
                      disabled={enviando}
                      onClick={() => setPaso(paso - 1)}
                    >
                      ← Volver
                    </button>
                  )}
                  <span className="totales-mini">
                    {totales.unidades > 0 && (
                      <>
                        {totales.unidades} unidad{totales.unidades === 1 ? '' : 'es'} ·{' '}
                        <b>{aMoneda(totales.facturaSinIva)}</b> + IVA
                      </>
                    )}
                  </span>
                  {paso < 4 ? (
                    <button
                      type="button"
                      className="btn btn--primario"
                      disabled={cargando || (paso === 2 && datos.renglones.length === 0)}
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
              </div>
            </div>
          </>
        )}

        {trabajo === 'mios' && (
          <div className="aviso aviso--neutro" style={{ marginTop: 14 }}>
            <i className="fa-solid fa-hammer" aria-hidden="true" />
            <span>El seguimiento de los pedidos cargados está en camino.</span>
          </div>
        )}

        {/* Las fotos del tractor, para mirarlas antes de pedirlo. */}
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
