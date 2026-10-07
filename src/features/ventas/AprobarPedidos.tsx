/**
 * VENTA · Aprobar pedidos. Es de BERGER.
 *
 * La decisión es sí o no, y lo que la condiciona es el crédito: un pedido de nueve millones contra
 * una línea con setecientos mil libres no se aprueba, por bueno que sea el cliente. Por eso la
 * ficha de la cuenta con su línea está al lado del pedido y no a un clic: tener que ir a buscarla
 * es tener que acordarse de que existe.
 *
 * Lo que entra acá es sólo lo que está esperando respuesta. Un pedido ya aprobado no se vuelve a
 * aprobar, y mostrarlo entre los pendientes convertiría la lista en un archivo.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { importe as aMoneda } from '@/lib/format'
import { ESTADO_PEDIDO } from '@/services/monday/columns'
import { cuentasDelCrm, type CuentaCrm } from '@/services/monday/crm'
import {
  aprobarPedido,
  pedidosCargados,
  rechazarPedido,
  unidadesDeVenta,
  type PedidoLeido,
  type UnidadLeida,
} from '@/services/monday/pedidosBerger'
import { SinAcceso } from '@/services/monday/sdk'
import { FichaCuenta } from './FichaCuenta'
import { TarjetaPedido } from './TarjetaPedido'

const mensaje = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export function AprobarPedidos() {
  const [pedidos, setPedidos] = useState<PedidoLeido[]>([])
  const [unidades, setUnidades] = useState<UnidadLeida[]>([])
  const [cuentas, setCuentas] = useState<CuentaCrm[]>([])

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [rechazando, setRechazando] = useState<string | null>(null)
  const [porQue, setPorQue] = useState('')
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])

  const recargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [ps, us, cs] = await Promise.all([
        pedidosCargados(),
        unidadesDeVenta(),
        cuentasDelCrm(),
      ])
      setPedidos(ps)
      setUnidades(us)
      setCuentas(cs)
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

  const pendientes = useMemo(
    () =>
      pedidos
        .filter((p) => p.estado === ESTADO_PEDIDO.CARGADA)
        .sort(
          (a, b) => a.fechaSolicitud.localeCompare(b.fechaSolicitud) || a.id.localeCompare(b.id),
        ),
    [pedidos],
  )

  const total = pendientes.reduce((a, p) => a + p.totalFacturaSinIva, 0)

  const resolver = async (p: PedidoLeido, aprobar: boolean) => {
    setTrabajando(p.id)
    setHecho(null)
    setAvisos([])
    try {
      const suyas = unidades.filter((u) => u.pedidoId === p.id)
      const r = aprobar ? await aprobarPedido(p, suyas) : await rechazarPedido(p, suyas, porQue)
      setHecho(
        aprobar
          ? `${p.nombre} quedó aprobado. Ya se le puede asignar inventario.`
          : `${p.nombre} quedó rechazado. El concesionario ve el motivo en su pantalla.`,
      )
      setAvisos(r.advertencias)
      setRechazando(null)
      setPorQue('')
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
              Los pedidos que están esperando respuesta, con la línea de crédito de cada
              concesionario.
            </span>
          </span>
        </div>

        <div className="resumen-estados">
          <span className="chip chip--ambar">{pendientes.length} esperando respuesta</span>
          {pendientes.length > 0 && (
            <span className="chip chip--gris">{aMoneda(total)} + IVA en juego</span>
          )}
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

        {!cargando && pendientes.length === 0 && !error && (
          <div className="aviso aviso--ok">
            <i className="fa-solid fa-circle-check" aria-hidden="true" />
            <span>No hay ningún pedido esperando respuesta.</span>
          </div>
        )}

        <div className="pedidos-lista">
          {pendientes.map((p) => {
            const suyas = unidades.filter((u) => u.pedidoId === p.id)
            const cuenta = cuentas.find((c) => c.id === p.cuentaId) ?? null
            const disponible = (cuenta?.creditoAsignado ?? 0) - (cuenta?.creditoUtilizado ?? 0)
            /* El aviso no bloquea: puede haber un acuerdo que la app no conoce. Lo que no puede
               pasar es que la decisión se tome sin saberlo. */
            const seExcede = Boolean(cuenta?.creditoAsignado) && p.totalFacturaSinIva > disponible

            return (
              <TarjetaPedido
                key={p.id}
                pedido={p}
                unidades={suyas}
                abierto={abierto === p.id}
                onAbrir={() => setAbierto((v) => (v === p.id ? null : p.id))}
              >
                {cuenta && (
                  <div className="fichas">
                    <FichaCuenta cuenta={cuenta} rotulo="Quién pide" conCredito />
                  </div>
                )}

                {seExcede && (
                  <div className="aviso aviso--alerta">
                    <i className="fa-solid fa-scale-unbalanced" aria-hidden="true" />
                    <span>
                      Este pedido es de <b>{aMoneda(p.totalFacturaSinIva)}</b> y en la línea quedan{' '}
                      <b>{aMoneda(disponible)}</b>: se pasa por{' '}
                      <b>{aMoneda(p.totalFacturaSinIva - disponible)}</b>.
                    </span>
                  </div>
                )}
                {!cuenta && (
                  <div className="aviso aviso--neutro">
                    <i className="fa-solid fa-circle-info" aria-hidden="true" />
                    <span>No se encontró la cuenta del concesionario para mirar su crédito.</span>
                  </div>
                )}

                {rechazando === p.id ? (
                  <div className="alta-rapida">
                    <span className="alta-rapida-tit">
                      <i className="fa-solid fa-comment-dots" aria-hidden="true" /> Por qué se
                      rechaza
                    </span>
                    <textarea
                      className="input textarea"
                      rows={3}
                      autoFocus
                      placeholder="Lo que el concesionario necesita saber para volver a cargarlo…"
                      value={porQue}
                      onChange={(e) => setPorQue(e.target.value)}
                    />
                    {/* Sin motivo, el rechazo es un "no" sin nada que hacer con él. */}
                    <span className="campo-ayuda">
                      Esto es lo único que va a leer del rechazo: conviene que diga qué cambiar.
                    </span>
                    <div className="alta-rapida-pie">
                      <button
                        type="button"
                        className="btn btn--texto btn--chico"
                        disabled={trabajando === p.id}
                        onClick={() => {
                          setRechazando(null)
                          setPorQue('')
                        }}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="btn btn--peligro btn--chico"
                        disabled={trabajando === p.id || porQue.trim().length < 5}
                        onClick={() => void resolver(p, false)}
                      >
                        {trabajando === p.id ? 'Rechazando…' : 'Rechazar el pedido'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="pedido-acciones">
                    <button
                      type="button"
                      className="btn btn--borde btn--chico"
                      disabled={trabajando === p.id}
                      onClick={() => {
                        setRechazando(p.id)
                        setPorQue('')
                      }}
                    >
                      <i className="fa-solid fa-xmark" aria-hidden="true" /> Rechazar
                    </button>
                    <button
                      type="button"
                      className="btn btn--primario"
                      disabled={trabajando === p.id}
                      onClick={() => void resolver(p, true)}
                    >
                      <i className="fa-solid fa-check" aria-hidden="true" />{' '}
                      {trabajando === p.id ? 'Aprobando…' : 'Aprobar'}
                    </button>
                  </div>
                )}
              </TarjetaPedido>
            )
          })}
        </div>
      </div>
    </div>
  )
}
