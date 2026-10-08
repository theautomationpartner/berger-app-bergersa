import { useEffect } from 'react'

/**
 * Las pantallas que hoy no se pueden dejar sin preguntar, con el porqué de cada una.
 *
 * Vive fuera de React a propósito: lo consulta la navegación de la app —que está arriba de todo— y
 * lo escriben las operaciones —que están abajo—, y pasarlo por contexto obligaría a envolver la app
 * entera para un dato que se lee sólo en el momento de salir.
 */
const motivos = new Map<number, string>()
let proximo = 1

/** Por qué no conviene salir ahora, o `null` si se puede salir tranquilo. Gana el último que pidió. */
export function motivoParaNoSalir(): string | null {
  const todos = [...motivos.values()]
  return todos.length > 0 ? todos[todos.length - 1] : null
}

/**
 * Pide confirmación antes de dejar la pantalla mientras `motivo` no sea `null`.
 *
 * Cubre las dos salidas posibles:
 *
 * - **Dentro de la app** (🏠, ☰, los desplegables de arriba, cerrar sesión): la navegación consulta
 *   `motivoParaNoSalir()` y muestra la ventana de "¿Seguro que querés salir?".
 * - **Fuera de la app** (cerrar la pestaña, recargar, irse de monday): el aviso del navegador. Ese
 *   cartel lo dibuja el navegador y no deja cambiarle el texto ni los botones; es lo más que una
 *   página puede hacer para frenar a alguien que se va.
 *
 * El motivo se escribe en criollo porque es lo que se lee en la ventana: "se está cargando el
 * pedido en monday" frena a cualquiera; "hay cambios sin guardar" no frena a nadie.
 */
export function useSalidaProtegida(motivo: string | null): void {
  useEffect(() => {
    if (!motivo) return
    const id = proximo++
    motivos.set(id, motivo)

    const alIrse = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      /* Chrome y Edge todavía lo piden para mostrar el cartel. */
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', alIrse)

    return () => {
      motivos.delete(id)
      window.removeEventListener('beforeunload', alIrse)
    }
  }, [motivo])
}
