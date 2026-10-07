/**
 * Las novedades de los pedidos del concesionario.
 *
 * Cada vez que BERGER aprueba, rechaza o deja una observación, queda un update en el pedido que
 * menciona a quien lo cargó. Esta pantalla es esa bandeja, adentro de la app: quien trabaja acá no
 * tiene por qué ir al tablero de monday a enterarse de que le aprobaron algo.
 *
 * Lo leído se guarda en el navegador, no en monday. "Leído" es de cada persona y de cada máquina, y
 * escribirlo en el tablero sería una columna que nadie mira y una escritura cada vez que alguien
 * abre la pantalla. Si se borran los datos del navegador se vuelven a ver como nuevas: molesto, no
 * grave.
 */
import { useEffect, useMemo, useState } from 'react'
import { fechaCorta } from '@/lib/format'
import type { Novedad } from '@/services/monday/pedidosBerger'
import { marcarLeidas, novedadesLeidas } from '@/services/monday/pedidosBerger'

/** "2026-10-07T20:26:31Z" → "07/10/2026 20:26". */
function cuando(iso: string): string {
  const dia = fechaCorta(iso.slice(0, 10))
  const hora = iso.slice(11, 16)
  return hora ? `${dia} ${hora}` : dia
}

interface Props {
  novedades: Novedad[]
  cargando?: boolean
  /** Para que el resto de la pantalla sepa cuántas quedan sin leer. */
  onCambiarNoLeidas?: (cuantas: number) => void
}

export function Novedades({ novedades, cargando, onCambiarNoLeidas }: Props) {
  const [leidas, setLeidas] = useState<string[]>(() => novedadesLeidas())

  const noLeidas = useMemo(
    () => novedades.filter((n) => !leidas.includes(n.id)),
    [novedades, leidas],
  )

  useEffect(() => {
    onCambiarNoLeidas?.(noLeidas.length)
  }, [noLeidas.length, onCambiarNoLeidas])

  const marcarTodas = () => {
    const ids = novedades.map((n) => n.id)
    marcarLeidas(ids)
    setLeidas((v) => [...new Set([...v, ...ids])])
  }

  const marcarUna = (id: string) => {
    marcarLeidas([id])
    setLeidas((v) => [...new Set([...v, id])])
  }

  return (
    <div className="novedades">
      <div className="novedades-head">
        <span className="novedades-tit">
          <i className="fa-solid fa-bell" aria-hidden="true" /> Novedades
          {noLeidas.length > 0 && <span className="btn-contador">{noLeidas.length}</span>}
        </span>
        {noLeidas.length > 0 && (
          <button type="button" className="btn btn--texto btn--chico" onClick={marcarTodas}>
            Marcar todas como leídas
          </button>
        )}
      </div>

      {cargando && (
        <div className="aviso aviso--neutro">
          <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
          <span>Buscando novedades…</span>
        </div>
      )}

      {!cargando && novedades.length === 0 && (
        <div className="aviso aviso--neutro">
          <i className="fa-solid fa-bell-slash" aria-hidden="true" />
          <span>
            Todavía no hay novedades. Acá van a aparecer las respuestas de BERGER a cada pedido.
          </span>
        </div>
      )}

      <div className="novedades-lista">
        {novedades.map((n) => {
          const nueva = !leidas.includes(n.id)
          return (
            <button
              key={n.id}
              type="button"
              className={`novedad${nueva ? ' novedad--nueva' : ''}`}
              onClick={() => marcarUna(n.id)}
              title={nueva ? 'Marcar como leída' : 'Ya la leíste'}
            >
              <span className="novedad-punto" aria-hidden="true" />
              <span className="novedad-txt">
                <span className="novedad-pedido">{n.pedidoNombre}</span>
                {/* El cuerpo viene con el markdown de monday: los asteriscos se sacan porque acá
                    no los interpreta nadie y se leen como basura. */}
                <span className="novedad-cuerpo">{n.texto.replace(/\*\*/g, '')}</span>
                <span className="novedad-pie">
                  {n.autor} · {cuando(n.cuando)}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
