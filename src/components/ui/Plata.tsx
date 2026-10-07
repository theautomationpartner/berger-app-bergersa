/**
 * Un importe, siempre igual en toda la app: en negrita, en verde y con cifras de ancho fijo.
 *
 * En estas pantallas la plata es el dato por el que se entra. Hasta ahora cada tabla la escribía
 * con el tamaño y el peso que le tocaba por herencia, así que el número más importante de la
 * pantalla se leía igual que el nombre de una columna. Con una sola pieza, un importe se reconoce
 * sin leerlo.
 *
 * Las cifras tabulares no son un detalle: con la fuente normal, el 1 es más angosto que el 8 y una
 * columna de importes queda desalineada, que es justo lo que impide compararlos de un vistazo.
 */
import { importe } from '@/lib/format'

interface Props {
  valor: number | null | undefined
  /** `+ IVA`, `c/IVA`, lo que haga falta aclarar al lado. */
  nota?: string
  /** Para los números grandes de un encabezado. */
  grande?: boolean
  /** Para lo que resta —un descuento, lo que falta de crédito—: en rojo en vez de verde. */
  resta?: boolean
  /** Sin color, para lo secundario que igual tiene que leerse como plata. */
  apagado?: boolean
}

export function Plata({ valor, nota, grande, resta, apagado }: Props) {
  const tono = apagado ? ' plata--apagada' : resta ? ' plata--resta' : ''
  return (
    <span className={`plata${grande ? ' plata--grande' : ''}${tono}`}>
      {importe(valor)}
      {nota && <small>{nota}</small>}
    </span>
  )
}
