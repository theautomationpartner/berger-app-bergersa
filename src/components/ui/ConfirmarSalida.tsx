interface Props {
  /** Por qué conviene quedarse: lo que se pierde o lo que queda a medias si sale ahora. */
  motivo: string
  onQuedarse: () => void
  onSalir: () => void
}

/**
 * La ventana de "¿Seguro que querés salir?".
 *
 * El botón que se enfoca solo es **Cancelar**: si alguien apretó Enter sin leer, lo que pasa es que
 * se queda, que es lo que no rompe nada.
 */
export function ConfirmarSalida({ motivo, onQuedarse, onSalir }: Props) {
  return (
    <>
      <button className="lateral-fondo lateral-fondo--alto" aria-label="Cancelar" onClick={onQuedarse} />
      <div
        className="ventanita ventanita--alto"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="salir-tit"
        aria-describedby="salir-det"
      >
        <div className="ventanita-head">
          <span id="salir-tit">
            <i className="fa-solid fa-triangle-exclamation salir-ic" aria-hidden="true" /> ¿Seguro
            que querés salir?
          </span>
        </div>
        <div className="ventanita-cuerpo">
          <p id="salir-det" className="salir-det">
            {motivo}
          </p>
        </div>
        <div className="ventanita-pie">
          <button type="button" className="btn btn--borde btn--chico" autoFocus onClick={onQuedarse}>
            Cancelar
          </button>
          <button type="button" className="btn btn--peligro btn--chico" onClick={onSalir}>
            Sí, seguro
          </button>
        </div>
      </div>
    </>
  )
}
