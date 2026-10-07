/**
 * La pantalla de una operación que todavía no está hecha.
 *
 * Existe porque el menú ofrece las operaciones según el módulo, y una que está en el menú pero no
 * tiene pantalla deja la ventana en blanco. En blanco nadie piensa "esto todavía no se hizo":
 * piensa que la app se rompió, y lo reporta como un error.
 */
interface Props {
  titulo: string
  detalle: string
}

export function EnConstruccion({ titulo, detalle }: Props) {
  return (
    <div className="scroll">
      <div className="view">
        <div className="sec-head">
          <span className="sec-num">
            <i className="fa-solid fa-helmet-safety" aria-hidden="true" />
          </span>
          <span className="sec-txt">
            <span className="sec-tit">{titulo}</span>
            <span className="sec-det">Esta pantalla está en construcción.</span>
          </span>
        </div>

        <div className="aviso aviso--neutro">
          <i className="fa-solid fa-circle-info" aria-hidden="true" />
          <span>{detalle}</span>
        </div>
      </div>
    </div>
  )
}
