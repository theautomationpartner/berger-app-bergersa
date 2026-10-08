import { useEffect, useLayoutEffect, useRef } from 'react'

/** Lo que se deja libre entre el panel y el borde de lo que se ve. */
const MARGEN = 8
/** Por debajo de esto, un panel achicado ya no sirve para elegir: conviene darlo vuelta. */
const ALTO_MINIMO = 140

interface Rect {
  top: number
  bottom: number
  left: number
  right: number
}

/**
 * Lo que de verdad se ve alrededor de `el`.
 *
 * No alcanza con la ventana: la app corre dentro de un contenedor con scroll propio y de tarjetas
 * que recortan lo que se sale, así que un panel puede estar "dentro de la pantalla" y aun así
 * cortado por la tarjeta que lo contiene. Se intersecta la ventana con cada antecesor que recorta.
 */
function areaVisible(el: HTMLElement): Rect {
  const area: Rect = { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth }
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const s = getComputedStyle(p)
    if (s.overflowY === 'visible' && s.overflowX === 'visible') continue
    const r = p.getBoundingClientRect()
    area.top = Math.max(area.top, r.top)
    area.bottom = Math.min(area.bottom, r.bottom)
    area.left = Math.max(area.left, r.left)
    area.right = Math.min(area.right, r.right)
  }
  return area
}

/**
 * Acomoda un panel desplegable para que se vea entero.
 *
 * Arranca siempre de cómo lo dibuja su CSS —abajo y alineado a la izquierda— y recién si así no
 * entra lo mueve: hacia arriba si arriba hay más lugar, hacia la izquierda si se sale por la
 * derecha, y si ni así entra, lo achica con scroll propio. Se escribe en el `style` del panel y no
 * con clases porque cada desplegable de la app tiene su propia separación del botón, y así la
 * conserva dada vuelta.
 */
function acomodar(panel: HTMLElement): void {
  const ancla = (panel.offsetParent as HTMLElement | null) ?? panel.parentElement
  if (!ancla) return

  const a = ancla.getBoundingClientRect()
  const area = areaVisible(ancla)

  /* La separación y el ancho se toman la primera vez, cuando el panel todavía está como lo dibuja
     su CSS: después ya puede estar dado vuelta, y medirlo ahí daría una separación negativa. */
  if (!panel.dataset.separacion) {
    const p = panel.getBoundingClientRect()
    panel.dataset.separacion = String(Math.max(p.top - a.bottom, 4))
    panel.dataset.ancho = String(p.width)
  }
  const separacion = Number(panel.dataset.separacion)
  const ancho = Number(panel.dataset.ancho)
  /* El alto que tendría sin recortar: el del contenido más los bordes. Se mide así y no sacándole
     el límite, porque sacárselo —aunque sea un instante— le pierde el scroll a quien ya bajó. */
  const alto = panel.scrollHeight + (panel.offsetHeight - panel.clientHeight)

  const abajo = area.bottom - a.bottom - separacion - MARGEN
  const arriba = a.top - area.top - separacion - MARGEN

  const quiero: Record<'top' | 'bottom' | 'left' | 'right' | 'width' | 'maxHeight' | 'overflowY', string> = {
    top: '',
    bottom: '',
    left: '',
    right: '',
    width: '',
    maxHeight: '',
    overflowY: '',
  }

  if (alto > abajo) {
    if (arriba > abajo && (abajo < ALTO_MINIMO || arriba >= alto)) {
      quiero.top = 'auto'
      quiero.bottom = `${a.height + separacion}px`
      if (alto > arriba) {
        quiero.maxHeight = `${Math.max(arriba, ALTO_MINIMO)}px`
        quiero.overflowY = 'auto'
      }
    } else {
      quiero.maxHeight = `${Math.max(abajo, ALTO_MINIMO)}px`
      quiero.overflowY = 'auto'
    }
  }

  /* De costado: si se sale por la derecha, se alinea con el borde derecho del botón, que es hacia
     donde hay lugar. El ancho queda fijo para que darlo vuelta no lo achique. Si ni así entrara,
     queda como estaba: mejor que el texto empiece donde se lee. */
  if (a.left + ancho > area.right - MARGEN && a.right - ancho >= area.left + MARGEN) {
    quiero.left = `${a.width - ancho}px`
    quiero.right = 'auto'
    quiero.width = `${ancho}px`
  }

  /* Sólo lo que cambió: reescribir el mismo valor en cada render no rompe nada, pero tampoco hace
     falta tocar el estilo de algo que ya está bien. */
  const s = panel.style
  for (const [k, v] of Object.entries(quiero) as [keyof typeof quiero, string][]) {
    if (s[k] !== v) s[k] = v
  }
}

/**
 * Para los paneles de los desplegables: si abajo no hay lugar, se abren para arriba; si se salen
 * por un costado, se dan vuelta hacia el otro.
 *
 * Sin esto, un desplegable al final de la página o de una tarjeta abría sus opciones fuera de lo
 * que se ve, y las últimas no se podían elegir. Devuelve el `ref` que va en el panel.
 *
 * Se vuelve a medir en cada render mientras está abierto —filtrar la lista cambia su alto— y
 * cuando cambia el tamaño de la ventana o se scrollea lo que lo contiene.
 */
export function usePanelQueEntra<T extends HTMLElement>(abierto: boolean) {
  const ref = useRef<T>(null)

  useLayoutEffect(() => {
    if (abierto && ref.current) acomodar(ref.current)
  })

  useEffect(() => {
    if (!abierto) return
    const otraVez = (e?: Event) => {
      const panel = ref.current
      if (!panel) return
      /* El scroll de la propia lista no mueve el panel: es alguien recorriendo las opciones. */
      if (e?.type === 'scroll' && e.target instanceof Node && panel.contains(e.target)) return
      acomodar(panel)
    }
    window.addEventListener('resize', otraVez)
    /* En captura: el scroll de un contenedor no burbujea hasta la ventana. */
    window.addEventListener('scroll', otraVez, true)
    return () => {
      window.removeEventListener('resize', otraVez)
      window.removeEventListener('scroll', otraVez, true)
    }
  }, [abierto])

  return ref
}
