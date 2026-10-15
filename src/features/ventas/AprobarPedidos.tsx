/**
 * VENTA · Aprobar pedidos. Es de BERGER.
 *
 * Son dos preguntas distintas y las contesta gente distinta. La **comercial** es "¿el precio
 * cierra?" y la mira quien conoce el margen; la **financiera** es "¿este cliente puede pagar?" y la
 * mira quien conoce la línea de crédito. Un pedido queda aprobado sólo con las dos: con una sola
 * columna, aprobar el precio parecía aprobar la venta y la pregunta del crédito se contestaba sola.
 *
 * La financiera recién se habilita cuando la comercial está contestada. No es un capricho de orden:
 * si el precio no cierra, el pedido se vuelve a cargar con otro precio, y evaluar el crédito del
 * anterior es trabajo tirado.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { DesplegableMulti } from '@/components/ui/DesplegableMulti'
import { Plata } from '@/components/ui/Plata'
import { useSalidaProtegida } from '@/hooks/useSalidaProtegida'
import { normalizar } from '@/lib/format'
import { catalogoDeVenta, type ProductoDeCatalogo } from '@/services/monday/catalogoVenta'
import { APROBACION, ESTADO_PEDIDO } from '@/services/monday/columns'
import { cuentasDelCrm, type CuentaCrm } from '@/services/monday/crm'
import {
  creditoParaPedido,
  pedidosCargados,
  resolverAprobacion,
  unidadesDeVenta,
  type Aprobacion,
  type PedidoLeido,
  type UnidadLeida,
} from '@/services/monday/pedidosBerger'
import { SinAcceso } from '@/services/monday/sdk'
import { FichaCuenta, tonoDeCredito } from './FichaCuenta'
import { aQuienSeLeFactura, TarjetaPedido } from './TarjetaPedido'

const mensaje = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** Una respuesta ya dada en esta pantalla, para el resumen del final. */
interface Resuelto {
  id: string
  nombre: string
  texto: string
  tono: 'verde' | 'rojo' | 'ambar'
  monto: number
}

/** Lo que se está por rechazar, mientras se escribe la observación. */
interface Rechazando {
  pedidoId: string
  cual: Aprobacion
}

export function AprobarPedidos() {
  const [pedidos, setPedidos] = useState<PedidoLeido[]>([])
  const [unidades, setUnidades] = useState<UnidadLeida[]>([])
  const [cuentas, setCuentas] = useState<CuentaCrm[]>([])
  const [catalogo, setCatalogo] = useState<ProductoDeCatalogo[]>([])

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [rechazando, setRechazando] = useState<Rechazando | null>(null)
  const [observacion, setObservacion] = useState('')
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])
  const [resueltos, setResueltos] = useState<Resuelto[]>([])

  const [texto, setTexto] = useState('')
  const [concesionariosSel, setConcesionariosSel] = useState<string[]>([])
  const [modelosSel, setModelosSel] = useState<string[]>([])

  const recargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [ps, us, cs, cat] = await Promise.all([
        pedidosCargados(),
        unidadesDeVenta(),
        cuentasDelCrm(),
        catalogoDeVenta(),
      ])
      setPedidos(ps)
      setUnidades(us)
      setCuentas(cs)
      setCatalogo(cat)
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

  /** Los que esperan respuesta: alguna de las dos sin contestar, y ninguna que haya dicho que no. */
  const pendientes = useMemo(
    () =>
      pedidos
        .filter(
          (p) =>
            p.estado !== ESTADO_PEDIDO.RECHAZADO &&
            (p.aprobComercial === APROBACION.PENDIENTE ||
              p.aprobFinanciera === APROBACION.PENDIENTE),
        )
        .sort(
          (a, b) => a.fechaSolicitud.localeCompare(b.fechaSolicitud) || a.id.localeCompare(b.id),
        ),
    [pedidos],
  )

  /* Los concesionarios del desplegable, con el CUIT a la vista: es como los busca quien factura. */
  const concesionarios = useMemo(
    () =>
      cuentas
        .filter((c) => c.categoria.toLowerCase().includes('concesionario'))
        .map((c) => ({ valor: c.id, rotulo: c.nombre, detalle: c.cuit ? `CUIT ${c.cuit}` : '' }))
        .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'es')),
    [cuentas],
  )

  /** Sólo los modelos que aparecen en algún pedido pendiente: filtrar por uno que no está no sirve. */
  const modelos = useMemo(() => {
    const ids = new Set(pendientes.flatMap((p) => p.renglones.map((r) => r.catalogoId)))
    return catalogo
      .filter((p) => ids.has(p.id))
      .map((p) => ({ valor: p.id, rotulo: p.modelo || p.nombre, detalle: p.codigo }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'es'))
  }, [catalogo, pendientes])

  const visibles = useMemo(() => {
    const q = normalizar(texto)
    return pendientes.filter((p) => {
      /* Varios a la vez: aparece cualquier pedido de alguno de los concesionarios o modelos elegidos. */
      if (concesionariosSel.length > 0 && !concesionariosSel.includes(p.cuentaId)) return false
      if (modelosSel.length > 0 && !p.renglones.some((r) => modelosSel.includes(r.catalogoId))) {
        return false
      }
      if (!q) return true
      /* Se busca por lo que uno tiene a mano: el nombre, el CUIT, o el modelo que pidieron. */
      const cuenta = cuentas.find((c) => c.id === p.cuentaId)
      const donde = [
        p.nombre,
        p.cuentaNombre,
        p.terceroNombre,
        cuenta?.cuit,
        ...p.renglones.map((r) => r.nombre),
      ].join(' ')
      return normalizar(donde).includes(q)
    })
  }, [pendientes, texto, concesionariosSel, modelosSel, cuentas])

  const faltaComercial = visibles.filter((p) => p.aprobComercial === APROBACION.PENDIENTE).length
  const faltaFinanciera = visibles.filter(
    (p) => p.aprobComercial === APROBACION.APROBADO && p.aprobFinanciera === APROBACION.PENDIENTE,
  ).length
  const enJuego = visibles.reduce((a, p) => a + p.totalFacturaSinIva, 0)
  const hayFiltros = Boolean(texto.trim() || concesionariosSel.length || modelosSel.length)

  /* Contestar una aprobación escribe el pedido, sus renglones, cada unidad y el aviso al
     concesionario: salir en el medio puede dejar el pedido aprobado y las unidades no. */
  useSalidaProtegida(
    trabajando
      ? 'Se está guardando la aprobación en monday: el pedido, sus unidades y el aviso al concesionario. Si salís ahora puede quedar a medias.'
      : rechazando && observacion.trim()
        ? 'Tenés un rechazo a medio escribir que todavía no se guardó. Si salís, se pierde la observación.'
        : null,
  )

  const contestar = async (p: PedidoLeido, cual: Aprobacion, aprueba: boolean, obs: string) => {
    setTrabajando(p.id)
    setHecho(null)
    setAvisos([])
    try {
      const r = await resolverAprobacion(
        p,
        unidades.filter((u) => u.pedidoId === p.id),
        cual,
        aprueba,
        obs,
      )
      setHecho(
        r.estado === ESTADO_PEDIDO.APROBADO
          ? `${p.nombre} quedó aprobado con las dos. Ya se le puede asignar inventario.`
          : r.estado === ESTADO_PEDIDO.RECHAZADO
            ? `${p.nombre} quedó rechazado. El concesionario ve el motivo en sus novedades.`
            : `La aprobación ${cual} de ${p.nombre} quedó ${aprueba ? 'aprobada' : 'rechazada'}. Falta la otra.`,
      )
      setResueltos((v) => [
        {
          id: `${p.id}-${cual}-${Date.now()}`,
          nombre: p.nombre,
          texto:
            r.estado === ESTADO_PEDIDO.APROBADO
              ? 'Aprobado con las dos: listo para asignar'
              : r.estado === ESTADO_PEDIDO.RECHAZADO
                ? `Rechazado en la ${cual}`
                : `Aprobación ${cual} ${aprueba ? 'aprobada' : 'rechazada'} · falta la otra`,
          tono:
            r.estado === ESTADO_PEDIDO.RECHAZADO || !aprueba
              ? 'rojo'
              : r.estado === ESTADO_PEDIDO.APROBADO
                ? 'verde'
                : 'ambar',
          monto: p.totalFacturaSinIva,
        },
        ...v,
      ])
      setAvisos(r.advertencias)
      setRechazando(null)
      setObservacion('')
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
            <i className="fa-solid fa-stamp" aria-hidden="true" />
          </span>
          <span className="sec-txt">
            <span className="sec-tit">Aprobar pedidos</span>
            <span className="sec-det">
              Cada pedido necesita dos respuestas: si el precio cierra y si el cliente puede pagar.
            </span>
          </span>
        </div>

        {/* El buscador y los dos filtros. Con cincuenta pendientes, encontrar el de un
            concesionario escribiendo su nombre es más rápido que recorrer la lista. */}
        <div className="buscador-pedidos">
          <input
            className="input"
            placeholder="Buscar por concesionario, CUIT, cliente o modelo…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <DesplegableMulti
            valores={concesionariosSel}
            opciones={concesionarios}
            vacio="Todos los concesionarios"
            buscable
            onCambiar={setConcesionariosSel}
          />
          <DesplegableMulti
            valores={modelosSel}
            opciones={modelos}
            vacio="Todos los modelos"
            buscable={modelos.length > 8}
            onCambiar={setModelosSel}
          />
        </div>

        <div className="tableros">
          <div className="tablero tablero--ambar">
            <span className="tablero-num">{faltaComercial}</span>
            <span className="tablero-txt">
              esperando la <b>comercial</b>
              <small>¿El precio cierra?</small>
            </span>
          </div>
          <div className="tablero tablero--violeta">
            <span className="tablero-num">{faltaFinanciera}</span>
            <span className="tablero-txt">
              esperando la <b>financiera</b>
              <small>¿El cliente puede pagar?</small>
            </span>
          </div>
          <div className="tablero tablero--verde">
            <span className="tablero-num tablero-num--plata">
              <Plata valor={enJuego} grande />
            </span>
            <span className="tablero-txt">
              en juego
              <small>sin IVA, de lo que se ve acá</small>
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
            <span>Buscando los pedidos pendientes…</span>
          </div>
        )}

        {!cargando && visibles.length === 0 && !error && (
          <div className="aviso aviso--ok">
            <i className="fa-solid fa-circle-check" aria-hidden="true" />
            <span>
              {hayFiltros
                ? 'Ningún pedido pendiente coincide con lo que buscaste.'
                : 'No hay ningún pedido esperando respuesta.'}
            </span>
          </div>
        )}

        <div className="pedidos-lista">
          {visibles.map((p) => {
            const suyas = unidades.filter((u) => u.pedidoId === p.id)
            const cuenta = cuentas.find((c) => c.id === p.cuentaId) ?? null
            const { asignado, disponible, quedaria, insuficiente, enConcesion } =
              creditoParaPedido(cuenta, p)
            const usado =
              asignado > 0
                ? Math.min(100, Math.round(((asignado - disponible) / asignado) * 100))
                : 0
            const esperaComercial = p.aprobComercial === APROBACION.PENDIENTE

            return (
              <TarjetaPedido
                key={p.id}
                pedido={p}
                unidades={suyas}
                conAprobaciones
                abierto={abierto === p.id}
                onAbrir={() => setAbierto((v) => (v === p.id ? null : p.id))}
                costado={
                  <>
                    <div
                      className={`decidir decidir--comercial${esperaComercial ? '' : ' decidir--listo'}`}
                    >
                      <span className="decidir-tit">
                        <i className="fa-solid fa-tag" aria-hidden="true" /> Aprobación comercial
                      </span>
                      <span className="decidir-pregunta">¿El precio cierra?</span>

                      <div className="decidir-datos">
                        <span>
                          A facturar s/IVA <Plata valor={p.totalFacturaSinIva} />
                        </span>
                        <span>
                          Con IVA <Plata valor={p.totalFacturaConIva} apagado />
                        </span>
                        <span>
                          De lista s/IVA <Plata valor={p.totalListaSinIva} apagado />
                        </span>
                        {p.totalListaSinIva > p.totalFacturaSinIva && (
                          <span>
                            Descuento{' '}
                            <Plata valor={p.totalListaSinIva - p.totalFacturaSinIva} resta />
                          </span>
                        )}
                      </div>

                      {/* Sin línea que alcance, el pedido no se aprueba: se puede rechazar o esperar
                          a que el concesionario regularice, pero no aprobar. */}
                      {esperaComercial && insuficiente && (
                        <div className="aviso aviso--error">
                          <i className="fa-solid fa-ban" aria-hidden="true" />
                          <span>
                            <b>Línea de crédito insuficiente.</b> Este pedido no puede aprobarse
                            hasta que el concesionario tenga línea disponible: necesita{' '}
                            <Plata valor={p.totalFacturaConIva} /> con IVA y tiene{' '}
                            <Plata valor={Math.max(0, disponible)} />.
                          </span>
                        </div>
                      )}

                      {esperaComercial ? (
                        <div className="decidir-botones">
                          <button
                            type="button"
                            className="btn btn--primario btn--chico"
                            disabled={trabajando === p.id || insuficiente}
                            title={insuficiente ? 'Bloqueado: la línea de crédito no alcanza' : undefined}
                            onClick={() => void contestar(p, 'comercial', true, '')}
                          >
                            <i className="fa-solid fa-check" aria-hidden="true" /> Aprobar
                          </button>
                          <button
                            type="button"
                            className="btn btn--borde btn--chico"
                            disabled={trabajando === p.id}
                            onClick={() => {
                              setRechazando({ pedidoId: p.id, cual: 'comercial' })
                              setObservacion('')
                            }}
                          >
                            <i className="fa-solid fa-xmark" aria-hidden="true" /> Rechazar
                          </button>
                        </div>
                      ) : (
                        <span
                          className={`chip ${p.aprobComercial === APROBACION.APROBADO ? 'chip--verde' : 'chip--rojo'}`}
                        >
                          {p.aprobComercial}
                        </span>
                      )}
                    </div>

                    <div
                      className={`decidir decidir--financiera${esperaComercial ? ' decidir--esperando' : ''}`}
                    >
                      <span className="decidir-tit">
                        <i className="fa-solid fa-building-columns" aria-hidden="true" /> Aprobación
                        financiera
                      </span>
                      <span className="decidir-pregunta">¿El cliente puede pagar?</span>

                      <div className="decidir-datos">
                        <span>
                          Le factura a <b>{aQuienSeLeFactura(p)}</b>
                        </span>
                        <span>
                          Paga con <b>{p.pago || 'sin definir'}</b>
                        </span>
                        {p.banco && (
                          <span>
                            Banco <b>{p.banco}</b>
                          </span>
                        )}
                        {p.plazo && (
                          <span>
                            Plazo <b>{p.plazo}</b>
                          </span>
                        )}
                      </div>

                      {/* La línea, resumida: lo que importa acá es qué queda si se aprueba esto. */}
                      <div className={`linea-credito linea-credito--${tonoDeCredito(usado)}`}>
                        {enConcesion ? (
                          <span>
                            <i className="fa-solid fa-handshake" aria-hidden="true" /> En concesión:
                            no se factura, no usa línea
                          </span>
                        ) : asignado > 0 ? (
                          <>
                            <span>
                              Línea disponible <Plata valor={disponible} />
                            </span>
                            <span>
                              Si se aprueba, queda <Plata valor={quedaria} resta={quedaria < 0} />
                            </span>
                          </>
                        ) : (
                          <span>
                            <i className="fa-solid fa-circle-info" aria-hidden="true" /> Sin línea
                            de crédito asignada
                          </span>
                        )}
                      </div>

                      {insuficiente && (
                        <div className="aviso aviso--alerta">
                          <i className="fa-solid fa-scale-unbalanced" aria-hidden="true" />
                          <span>
                            Se pasa por <Plata valor={-quedaria} resta />
                          </span>
                        </div>
                      )}

                      {esperaComercial ? (
                        <span className="decidir-espera">
                          <i className="fa-solid fa-hourglass-half" aria-hidden="true" /> Primero la
                          comercial
                        </span>
                      ) : p.aprobFinanciera === APROBACION.PENDIENTE ? (
                        <div className="decidir-botones">
                          <button
                            type="button"
                            className="btn btn--primario btn--chico"
                            disabled={trabajando === p.id}
                            onClick={() => void contestar(p, 'financiera', true, '')}
                          >
                            <i className="fa-solid fa-check" aria-hidden="true" /> Aprobar
                          </button>
                          <button
                            type="button"
                            className="btn btn--borde btn--chico"
                            disabled={trabajando === p.id}
                            onClick={() => {
                              setRechazando({ pedidoId: p.id, cual: 'financiera' })
                              setObservacion('')
                            }}
                          >
                            <i className="fa-solid fa-xmark" aria-hidden="true" /> Rechazar
                          </button>
                        </div>
                      ) : (
                        <span
                          className={`chip ${p.aprobFinanciera === APROBACION.APROBADO ? 'chip--verde' : 'chip--rojo'}`}
                        >
                          {p.aprobFinanciera}
                        </span>
                      )}
                    </div>
                  </>
                }
              >
                {cuenta ? (
                  <div className="fichas">
                    <FichaCuenta cuenta={cuenta} rotulo="Quién pide" conCredito />
                  </div>
                ) : (
                  <div className="aviso aviso--neutro">
                    <i className="fa-solid fa-circle-info" aria-hidden="true" />
                    <span>No se encontró la cuenta del concesionario para mirar su crédito.</span>
                  </div>
                )}
              </TarjetaPedido>
            )
          })}
        </div>

        {/* Lo que se contestó desde que se abrió la pantalla: el aviso verde de arriba cuenta sólo
            lo último, y con varios pedidos seguidos conviene ver todo junto al terminar. */}
        {resueltos.length > 0 && (
          <div className="card resumen-sesion">
            <div className="resumen-sesion-tit">
              <i className="fa-solid fa-list-check" aria-hidden="true" /> Lo que resolviste
              <span className="chip chip--gris">{resueltos.length}</span>
            </div>
            <ul className="resumen-sesion-lista">
              {resueltos.map((r) => (
                <li key={r.id}>
                  <span className={`resumen-punto resumen-punto--${r.tono}`} aria-hidden="true" />
                  <span className="resumen-sesion-nom">
                    <b>{r.nombre}</b>
                    <small>{r.texto}</small>
                  </span>
                  <Plata valor={r.monto} nota="s/IVA" />
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* El rechazo pide la observación en una ventana: es la única parte de esta pantalla que
            exige escribir, y pedirla dentro de la tarjeta la dejaba perdida entre los números. */}
        {rechazando && (
          <>
            <button
              className="lateral-fondo"
              aria-label="Cerrar"
              onClick={() => setRechazando(null)}
            />
            <div className="ventanita" role="dialog" aria-modal="true">
              <div className="ventanita-head">
                <span>
                  Rechazar la aprobación{' '}
                  {rechazando.cual === 'comercial' ? 'comercial' : 'financiera'}
                </span>
                <button type="button" onClick={() => setRechazando(null)} aria-label="Cerrar">
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              </div>
              <div className="ventanita-cuerpo">
                <span className="campo-lbl">
                  Observación <span className="campo-req">· obligatoria</span>
                </span>
                <textarea
                  className="input textarea"
                  rows={4}
                  autoFocus
                  placeholder={
                    rechazando.cual === 'comercial'
                      ? 'Qué tiene que cambiar del precio para que cierre…'
                      : 'Por qué no se puede financiar así…'
                  }
                  value={observacion}
                  onChange={(e) => setObservacion(e.target.value)}
                />
                <span className="campo-ayuda">
                  Queda escrita en el pedido y le llega al concesionario como novedad. Es lo único
                  que va a leer del rechazo: conviene que diga qué cambiar.
                </span>
              </div>
              <div className="ventanita-pie">
                <button
                  type="button"
                  className="btn btn--texto btn--chico"
                  onClick={() => setRechazando(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn--peligro btn--chico"
                  disabled={observacion.trim().length < 5 || trabajando === rechazando.pedidoId}
                  onClick={() => {
                    const p = pedidos.find((x) => x.id === rechazando.pedidoId)
                    if (p) void contestar(p, rechazando.cual, false, observacion)
                  }}
                >
                  {trabajando === rechazando.pedidoId ? 'Rechazando…' : 'Rechazar el pedido'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
