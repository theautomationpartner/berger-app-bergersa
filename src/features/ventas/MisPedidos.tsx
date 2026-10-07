/**
 * Mis pedidos: en qué anda cada tractor que el concesionario pidió.
 *
 * Es la contracara de cargar el pedido. Sin esto, enterarse de que BERGER aprobó —o rechazó, y por
 * qué— depende de que alguien avise, y la pregunta "¿salió lo mío?" termina siendo un llamado
 * telefónico por pedido.
 *
 * Tres cosas, en ese orden: el tablero con cuántos hay en cada estado, las novedades, y la lista.
 * Primero el número, después el detalle: quien entra viene a saber cómo viene, no a leer veinte
 * tarjetas.
 *
 * Se filtra por el concesionario de la sesión: el pedido de otro no es asunto de éste, aunque los
 * dos usen la misma app.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ESTADO_PEDIDO } from '@/services/monday/columns'
import { cuentasDelCrm } from '@/services/monday/crm'
import {
  novedadesDePedidos,
  pedidosCargados,
  unidadesDeVenta,
  type Novedad,
  type PedidoLeido,
  type UnidadLeida,
} from '@/services/monday/pedidosBerger'
import { SinAcceso } from '@/services/monday/sdk'
import { Novedades } from './Novedades'
import { PanelDePedidos } from './PanelDePedidos'
import { TarjetaPedido, tonoDeEstado } from './TarjetaPedido'

const mensaje = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** Los estados que ya no esperan nada de nadie. Se pueden esconder para ver sólo lo vivo. */
const CERRADOS: string[] = [ESTADO_PEDIDO.RECHAZADO, ESTADO_PEDIDO.ASIGNADO]

type Vista = 'lista' | 'novedades'

interface Props {
  /** El equipo del concesionario, de la sesión. */
  equipoId?: string
  /** Su usuario de monday: las novedades que lo mencionan son las suyas. */
  usuarioId?: string
}

export function MisPedidos({ usuarioId = '' }: Props) {
  const [pedidos, setPedidos] = useState<PedidoLeido[]>([])
  const [unidades, setUnidades] = useState<UnidadLeida[]>([])
  const [novedades, setNovedades] = useState<Novedad[]>([])
  const [misCuentas, setMisCuentas] = useState<string[]>([])

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [verCerrados, setVerCerrados] = useState(false)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [vista, setVista] = useState<Vista>('lista')
  const [sinLeer, setSinLeer] = useState(0)
  const [mirando, setMirando] = useState<{ titulo: string; pedidos: PedidoLeido[] } | null>(null)

  const recargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [ps, us, cuentas] = await Promise.all([
        pedidosCargados(),
        unidadesDeVenta(),
        cuentasDelCrm(),
      ])
      const mias = cuentas
        .filter((c) => c.categoria.toLowerCase().includes('concesionario'))
        .map((c) => c.id)
      setPedidos(ps)
      setUnidades(us)
      setMisCuentas(mias)
      /* Las novedades salen de los updates de los mismos pedidos: una consulta más, no otra app. */
      setNovedades(await novedadesDePedidos(mias, usuarioId))
    } catch (e) {
      setError(
        e instanceof SinAcceso
          ? 'la app tiene que abrirse desde monday para leer los pedidos.'
          : mensaje(e),
      )
    } finally {
      setCargando(false)
    }
  }, [usuarioId])

  useEffect(() => {
    void recargar()
  }, [recargar])

  const mios = useMemo(
    () => pedidos.filter((p) => misCuentas.length === 0 || misCuentas.includes(p.cuentaId)),
    [pedidos, misCuentas],
  )

  const enLista = useMemo(
    () =>
      mios
        .filter((p) => verCerrados || !CERRADOS.includes(p.estado))
        .sort(
          (a, b) => b.fechaSolicitud.localeCompare(a.fechaSolicitud) || b.id.localeCompare(a.id),
        ),
    [mios, verCerrados],
  )

  const tarjeta = (p: PedidoLeido, plegable = true) => {
    const suyas = unidades.filter((u) => u.pedidoId === p.id)
    return (
      <TarjetaPedido
        key={p.id}
        pedido={p}
        unidades={suyas}
        abierto={plegable ? abierto === p.id : true}
        onAbrir={plegable ? () => setAbierto((v) => (v === p.id ? null : p.id)) : undefined}
      >
        {/* Tractor por tractor: es lo que se vino a mirar. Uno aprobado y otro a fábrica dentro
            del mismo pedido es lo normal, y el estado del pedido no lo cuenta. */}
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
  }

  return (
    <>
      {error && (
        <div className="aviso aviso--error">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <span>No se pudieron leer los pedidos: {error}</span>
        </div>
      )}

      {cargando && pedidos.length === 0 && (
        <div className="aviso aviso--neutro">
          <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
          <span>Buscando tus pedidos…</span>
        </div>
      )}

      <PanelDePedidos
        pedidos={mios}
        unidades={unidades.filter((u) => mios.some((p) => p.id === u.pedidoId))}
        onVer={(titulo, cuales) => setMirando({ titulo, pedidos: cuales })}
      />

      <div className="solapas">
        <button
          type="button"
          className={`solapa${vista === 'lista' ? ' solapa--si' : ''}`}
          onClick={() => setVista('lista')}
        >
          <i className="fa-solid fa-list-check" aria-hidden="true" /> Mis pedidos
        </button>
        <button
          type="button"
          className={`solapa${vista === 'novedades' ? ' solapa--si' : ''}`}
          onClick={() => setVista('novedades')}
        >
          <i className="fa-solid fa-bell" aria-hidden="true" /> Novedades
          {sinLeer > 0 && <span className="btn-contador">{sinLeer}</span>}
        </button>

        <span className="solapas-der">
          <button
            type="button"
            className="btn btn--texto btn--chico"
            disabled={cargando}
            onClick={() => void recargar()}
          >
            <i className="fa-solid fa-rotate" aria-hidden="true" /> Actualizar
          </button>
          {vista === 'lista' && (
            <label className="ver-cerrados">
              <input
                type="checkbox"
                checked={verCerrados}
                onChange={(e) => setVerCerrados(e.target.checked)}
              />
              Ver también los cerrados
            </label>
          )}
        </span>
      </div>

      {vista === 'novedades' ? (
        <Novedades novedades={novedades} cargando={cargando} onCambiarNoLeidas={setSinLeer} />
      ) : (
        <>
          {!cargando && !error && enLista.length === 0 && (
            <div className="aviso aviso--neutro">
              <i className="fa-solid fa-inbox" aria-hidden="true" />
              <span>
                {verCerrados
                  ? 'Todavía no cargaste ningún pedido.'
                  : 'No tenés pedidos abiertos. Tildá «Ver también los cerrados» para ver los anteriores.'}
              </span>
            </div>
          )}
          <div className="pedidos-lista">{enLista.map((p) => tarjeta(p))}</div>
        </>
      )}

      {/* Lo que abre una cajita del tablero: los pedidos de ese estado, sin perder la pantalla. */}
      {mirando && (
        <>
          <button className="lateral-fondo" aria-label="Cerrar" onClick={() => setMirando(null)} />
          <div className="ventanita ventanita--ancha" role="dialog" aria-modal="true">
            <div className="ventanita-head">
              <span>
                <span className={`chip ${tonoDeEstado(mirando.pedidos[0]?.estado ?? '')}`}>
                  {mirando.pedidos.length}
                </span>{' '}
                {mirando.titulo}
              </span>
              <button type="button" onClick={() => setMirando(null)} aria-label="Cerrar">
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            </div>
            <div className="ventanita-cuerpo ventanita-cuerpo--scroll">
              <div className="pedidos-lista">{mirando.pedidos.map((p) => tarjeta(p, false))}</div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
