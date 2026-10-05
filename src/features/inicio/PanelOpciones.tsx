import type { OpcionPanel, SeccionPanel } from '@/types'

interface Props<T extends string> {
  titulo: string
  detalle: string
  opciones: OpcionPanel<T>[]
  onElegir: (id: T) => void
  /**
   * Si el panel se divide en secciones. Sólo se dibuja la sección que tenga opciones visibles:
   * un despachante no tiene por qué ver el encabezado de BERGER con la caja vacía debajo.
   */
  secciones?: SeccionPanel[]
}

/**
 * Panel de elección con tarjetas grandes. Es la misma pieza para los dos niveles de entrada: la
 * operación principal (DESPACHO) y la modalidad (ANTICIPADO / VISTA).
 *
 * Las tarjetas son grandes a propósito: es una decisión que se toma una vez por visita y abre un
 * circuito entero, así que tiene que leerse sin esfuerzo y tocarse sin puntería, también en el
 * celular.
 */
export function PanelOpciones<T extends string>({
  titulo,
  detalle,
  opciones,
  onElegir,
  secciones,
}: Props<T>) {
  const tarjeta = (op: OpcionPanel<T>) => (
    <button key={op.id} type="button" className="panel-opcion" onClick={() => onElegir(op.id)}>
      <span className="panel-opcion-ic">
        <i className={op.icono} aria-hidden="true" />
      </span>
      <span className="panel-opcion-txt">
        <span className="panel-opcion-tit">
          {op.titulo}
          {/* Cuántas hay adentro. Una sola no se dice: "1 operación" ocupa lugar para contar que
              no hay nada que elegir. */}
          {op.cuantas != null && op.cuantas > 1 && (
            <span className="panel-opcion-cuantas">{op.cuantas} operaciones</span>
          )}
        </span>
        <span className="panel-opcion-det">{op.detalle}</span>
      </span>
      <i className="fa-solid fa-chevron-right panel-opcion-flecha" aria-hidden="true" />
    </button>
  )

  /* Las que no caen en ninguna sección van arriba y sueltas: un panel con secciones no tiene por
     qué tenerlas todas, y una opción sin grupo no se puede perder. */
  const sueltas = secciones ? opciones.filter((o) => !o.seccion) : opciones

  return (
    <div className="scroll">
      <div className="view">
        <div className="panel-head">
          <h1 className="panel-tit">{titulo}</h1>
          <p className="panel-det">{detalle}</p>
        </div>

        {sueltas.length > 0 && <div className="panel-opciones">{sueltas.map(tarjeta)}</div>}

        {secciones?.map((sec) => {
          const dentro = opciones.filter((o) => o.seccion === sec.id)
          if (dentro.length === 0) return null
          return (
            <div key={sec.id} className={`panel-grupo panel-grupo--${sec.tono}`}>
              <div className="panel-grupo-head">
                <span className="panel-grupo-ic">
                  <i className={sec.icono} aria-hidden="true" />
                </span>
                <span className="panel-grupo-txt">
                  <span className="panel-grupo-tit">{sec.titulo}</span>
                  <span className="panel-grupo-det">{sec.detalle}</span>
                </span>
              </div>
              <div className="panel-opciones">{dentro.map(tarjeta)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
