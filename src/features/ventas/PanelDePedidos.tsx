/**
 * El tablero del concesionario: cuántos pedidos tiene en cada estado, y cómo le viene yendo.
 *
 * Va arriba de todo, antes de elegir qué hacer, porque es la respuesta a la pregunta con la que se
 * entra: "¿cómo vengo?". Los números son botones: un contador que dice "3 esperando aprobación" y
 * no deja ver cuáles obliga a ir a buscarlos a otra pantalla.
 *
 * Los gráficos se dibujan con SVG a mano y no con una librería. Son dos: una línea de doce meses y
 * unas barras. Traerse una librería de gráficos para eso son doscientos kilobytes que todos los
 * usuarios descargan, incluidos los que nunca abren esta pantalla.
 */
import { useMemo, useState } from 'react'
import { Plata } from '@/components/ui/Plata'
import { ESTADO_PEDIDO } from '@/services/monday/columns'
import type { PedidoLeido, UnidadLeida } from '@/services/monday/pedidosBerger'
import { tonoDeEstado } from './TarjetaPedido'

/** Los estados que se muestran como cajita, en el orden del circuito. */
const ORDEN: { estado: string; rotulo: string; icono: string }[] = [
  { estado: ESTADO_PEDIDO.CARGADA, rotulo: 'Esperando respuesta', icono: 'fa-clock' },
  { estado: ESTADO_PEDIDO.APROBADO, rotulo: 'Aprobados', icono: 'fa-circle-check' },
  { estado: ESTADO_PEDIDO.ASIGNADO, rotulo: 'Con inventario', icono: 'fa-warehouse' },
  { estado: ESTADO_PEDIDO.A_FABRICA, rotulo: 'Pedidos a fábrica', icono: 'fa-industry' },
  { estado: ESTADO_PEDIDO.RECHAZADO, rotulo: 'Rechazados', icono: 'fa-circle-xmark' },
]

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/** El mes de una fecha ISO, sin `new Date()`: parsear ISO corre el día por zona horaria. */
const mesDe = (iso: string): string => iso.slice(0, 7)

/** Los últimos doce meses hasta hoy, en orden. */
function ultimosDoceMeses(): string[] {
  const hoy = new Date()
  const meses: string[] = []
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return meses
}

interface Props {
  pedidos: PedidoLeido[]
  unidades: UnidadLeida[]
  /** Al tocar una cajita, qué pedidos mostrar. */
  onVer: (estado: string, pedidos: PedidoLeido[]) => void
}

export function PanelDePedidos({ pedidos, unidades, onVer }: Props) {
  const [queMide, setQueMide] = useState<'plata' | 'unidades'>('plata')

  const porEstado = useMemo(() => {
    const m = new Map<string, PedidoLeido[]>()
    for (const p of pedidos) {
      const k = p.estado || 'Sin estado'
      m.set(k, [...(m.get(k) ?? []), p])
    }
    return m
  }, [pedidos])

  const meses = useMemo(() => ultimosDoceMeses(), [])

  const serie = useMemo(() => {
    const plata = new Map<string, number>()
    const cuantos = new Map<string, number>()
    const unidadesPorMes = new Map<string, number>()
    for (const p of pedidos) {
      const m = mesDe(p.fechaSolicitud)
      if (!m) continue
      plata.set(m, (plata.get(m) ?? 0) + p.totalFacturaSinIva)
      cuantos.set(m, (cuantos.get(m) ?? 0) + 1)
      unidadesPorMes.set(
        m,
        (unidadesPorMes.get(m) ?? 0) + unidades.filter((u) => u.pedidoId === p.id).length,
      )
    }
    return meses.map((m) => ({
      mes: m,
      plata: plata.get(m) ?? 0,
      pedidos: cuantos.get(m) ?? 0,
      unidades: unidadesPorMes.get(m) ?? 0,
    }))
  }, [pedidos, unidades, meses])

  const valores = serie.map((s) => (queMide === 'plata' ? s.plata : s.unidades))
  const techo = Math.max(...valores, 1)

  /* Los modelos más pedidos: el dato con el que se decide qué conviene tener en stock. */
  const masPedidos = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of pedidos) {
      for (const r of p.renglones) m.set(r.nombre, (m.get(r.nombre) ?? 0) + r.cantidad)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [pedidos])
  const masPedido = Math.max(...masPedidos.map(([, n]) => n), 1)

  const total = pedidos.length
  const totalPlata = pedidos.reduce((a, p) => a + p.totalFacturaSinIva, 0)
  const totalUnidades = unidades.length
  const esteMes = serie[serie.length - 1]

  if (total === 0) return null

  return (
    <div className="panel-pedidos">
      <div className="tableros tableros--estados">
        {ORDEN.map(({ estado, rotulo, icono }) => {
          const suyos = porEstado.get(estado) ?? []
          return (
            <button
              key={estado}
              type="button"
              className={`tablero tablero--boton tablero--${tonoDeEstado(estado).replace('chip--', '')}${
                suyos.length === 0 ? ' tablero--vacio' : ''
              }`}
              disabled={suyos.length === 0}
              onClick={() => onVer(rotulo, suyos)}
            >
              <span className="tablero-ic">
                <i className={`fa-solid ${icono}`} aria-hidden="true" />
              </span>
              <span className="tablero-num">{suyos.length}</span>
              <span className="tablero-txt">
                {rotulo}
                {suyos.length > 0 && <small>Tocá para verlos</small>}
              </span>
            </button>
          )
        })}
      </div>

      <div className="estadisticas">
        <div className="estad-head">
          <span className="estad-tit">
            <i className="fa-solid fa-chart-line" aria-hidden="true" /> Cómo viene
          </span>
          <div className="estad-tabs">
            <button
              type="button"
              className={`estad-tab${queMide === 'plata' ? ' estad-tab--si' : ''}`}
              onClick={() => setQueMide('plata')}
            >
              En plata
            </button>
            <button
              type="button"
              className={`estad-tab${queMide === 'unidades' ? ' estad-tab--si' : ''}`}
              onClick={() => setQueMide('unidades')}
            >
              En unidades
            </button>
          </div>
        </div>

        <div className="estad-cifras">
          <div className="estad-cifra">
            <small>Pedidos en total</small>
            <b>{total}</b>
          </div>
          <div className="estad-cifra">
            <small>Unidades pedidas</small>
            <b>{totalUnidades}</b>
          </div>
          <div className="estad-cifra">
            <small>Total pedido s/IVA</small>
            <Plata valor={totalPlata} grande />
          </div>
          <div className="estad-cifra">
            <small>Este mes</small>
            {queMide === 'plata' ? (
              <Plata valor={esteMes?.plata ?? 0} grande />
            ) : (
              <b>{esteMes?.unidades ?? 0}</b>
            )}
          </div>
        </div>

        {/* Doce meses. La línea dice si viene creciendo; las barras, cuánto hubo en cada uno. */}
        <div className="grafico">
          <svg viewBox="0 0 720 180" role="img" preserveAspectRatio="none">
            <title>
              {queMide === 'plata' ? 'Pedido por mes, sin IVA' : 'Unidades pedidas por mes'}, de los
              últimos doce meses
            </title>
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <line
                key={f}
                x1="0"
                x2="720"
                y1={20 + f * 130}
                y2={20 + f * 130}
                className="grafico-guia"
              />
            ))}
            {serie.map((s, i) => {
              const v = queMide === 'plata' ? s.plata : s.unidades
              const alto = (v / techo) * 130
              const ancho = 720 / serie.length
              return (
                <rect
                  key={s.mes}
                  x={i * ancho + ancho * 0.22}
                  y={150 - alto}
                  width={ancho * 0.56}
                  height={Math.max(alto, v > 0 ? 2 : 0)}
                  rx="3"
                  className="grafico-barra"
                >
                  <title>
                    {MESES[Number(s.mes.slice(5, 7)) - 1]} {s.mes.slice(0, 4)}: {s.pedidos} pedidos
                    · {s.unidades} unidades
                  </title>
                </rect>
              )
            })}
            <polyline
              className="grafico-linea"
              points={serie
                .map((s, i) => {
                  const v = queMide === 'plata' ? s.plata : s.unidades
                  const ancho = 720 / serie.length
                  return `${i * ancho + ancho / 2},${150 - (v / techo) * 130}`
                })
                .join(' ')}
            />
          </svg>
          <div className="grafico-meses">
            {serie.map((s) => (
              <span key={s.mes}>{MESES[Number(s.mes.slice(5, 7)) - 1]}</span>
            ))}
          </div>
        </div>

        {masPedidos.length > 0 && (
          <div className="ranking">
            <span className="ranking-tit">Lo que más pedís</span>
            {masPedidos.map(([nombre, cuantos]) => (
              <div key={nombre} className="ranking-fila">
                <span className="ranking-nom">{nombre}</span>
                <span className="ranking-barra">
                  <span style={{ width: `${(cuantos / masPedido) * 100}%` }} />
                </span>
                <span className="ranking-num">{cuantos}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
