/**
 * Mis pedidos: en qué anda cada tractor que el concesionario pidió.
 *
 * Es la contracara de cargar el pedido. Sin esto, enterarse de que BERGER aprobó —o rechazó, y por
 * qué— depende de que alguien avise, y la pregunta "¿salió lo mío?" termina siendo un llamado
 * telefónico por pedido.
 *
 * Se filtra por el concesionario de la sesión: el pedido de otro no es asunto de éste, aunque los
 * dos usen la misma app.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ESTADO_PEDIDO } from '@/services/monday/columns'
import { cuentasDelCrm } from '@/services/monday/crm'
import {
  pedidosCargados,
  unidadesDeVenta,
  type PedidoLeido,
  type UnidadLeida,
} from '@/services/monday/pedidosBerger'
import { SinAcceso } from '@/services/monday/sdk'
import { TarjetaPedido, tonoDeEstado } from './TarjetaPedido'

const mensaje = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** Los estados que ya no esperan nada de nadie. Se pueden esconder para ver sólo lo vivo. */
const CERRADOS: string[] = [ESTADO_PEDIDO.RECHAZADO, ESTADO_PEDIDO.ASIGNADO]

interface Props {
  /** El equipo del concesionario, de la sesión. */
  equipoId?: string
}

export function MisPedidos({ equipoId }: Props) {
  const [pedidos, setPedidos] = useState<PedidoLeido[]>([])
  const [unidades, setUnidades] = useState<UnidadLeida[]>([])
  const [misCuentas, setMisCuentas] = useState<string[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [verCerrados, setVerCerrados] = useState(false)
  const [abierto, setAbierto] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [ps, us, cuentas] = await Promise.all([
        pedidosCargados(),
        unidadesDeVenta(),
        cuentasDelCrm(),
      ])
      setPedidos(ps)
      setUnidades(us)
      setMisCuentas(
        cuentas.filter((c) => c.categoria.toLowerCase().includes('concesionario')).map((c) => c.id),
      )
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

  /* Con una sola cuenta de concesionario no hay nada que filtrar. Con varias, se muestran las que
     son de este equipo de monday, que es el que viaja en la sesión. */
  const mios = useMemo(() => {
    const porEquipo = equipoId
      ? pedidos.filter((p) => p.equipo || misCuentas.includes(p.cuentaId))
      : pedidos
    return porEquipo
      .filter((p) => misCuentas.length === 0 || misCuentas.includes(p.cuentaId))
      .filter((p) => verCerrados || !CERRADOS.includes(p.estado))
      .sort((a, b) => b.fechaSolicitud.localeCompare(a.fechaSolicitud) || b.id.localeCompare(a.id))
  }, [pedidos, misCuentas, equipoId, verCerrados])

  const porEstado = useMemo(() => {
    const cuenta = new Map<string, number>()
    for (const p of pedidos.filter(
      (x) => misCuentas.length === 0 || misCuentas.includes(x.cuentaId),
    )) {
      cuenta.set(p.estado, (cuenta.get(p.estado) ?? 0) + 1)
    }
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1])
  }, [pedidos, misCuentas])

  return (
    <>
      <div className="resumen-estados">
        {porEstado.map(([estado, cuantos]) => (
          <span key={estado} className={`chip ${tonoDeEstado(estado)}`}>
            {cuantos} {estado || 'sin estado'}
          </span>
        ))}
        <button
          type="button"
          className="btn btn--texto btn--chico"
          disabled={cargando}
          onClick={() => void recargar()}
        >
          <i className="fa-solid fa-rotate" aria-hidden="true" /> Actualizar
        </button>
        <label className="ver-cerrados">
          <input
            type="checkbox"
            checked={verCerrados}
            onChange={(e) => setVerCerrados(e.target.checked)}
          />
          Ver también los cerrados
        </label>
      </div>

      {error && (
        <div className="aviso aviso--error">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <span>No se pudieron leer los pedidos: {error}</span>
        </div>
      )}

      {cargando && (
        <div className="aviso aviso--neutro">
          <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
          <span>Buscando tus pedidos…</span>
        </div>
      )}

      {!cargando && !error && mios.length === 0 && (
        <div className="aviso aviso--neutro">
          <i className="fa-solid fa-inbox" aria-hidden="true" />
          <span>
            {verCerrados
              ? 'Todavía no cargaste ningún pedido.'
              : 'No tenés pedidos abiertos. Tildá «Ver también los cerrados» para ver los anteriores.'}
          </span>
        </div>
      )}

      <div className="pedidos-lista">
        {mios.map((p) => {
          const suyas = unidades.filter((u) => u.pedidoId === p.id)
          return (
            <TarjetaPedido
              key={p.id}
              pedido={p}
              unidades={suyas}
              abierto={abierto === p.id}
              onAbrir={() => setAbierto((v) => (v === p.id ? null : p.id))}
            >
              {/* Tractor por tractor: es lo que se vino a mirar. Uno aprobado y otro a fábrica
                  dentro del mismo pedido es lo normal, y el estado del pedido no lo cuenta. */}
              {suyas.length > 0 && (
                <div className="unidades">
                  <span className="unidades-tit">Cada unidad</span>
                  {suyas.map((u) => (
                    <div key={u.id} className="unidad">
                      <span className="unidad-nom">{u.catalogoNombre || u.nombre}</span>
                      <span className="unidad-chips">
                        {u.inventarioNombre && (
                          <span className="chip chip--interno">{u.inventarioNombre}</span>
                        )}
                        <span className="chip chip--gris">{u.estado || 'Sin estado'}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </TarjetaPedido>
          )
        })}
      </div>
    </>
  )
}
