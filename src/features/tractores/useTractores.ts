import { useCallback, useEffect, useMemo, useState } from 'react'
import { SinAcceso } from '@/services/monday/sdk'
import type { Tractor } from '@/types'

const mensaje = (e: unknown): string =>
  e instanceof SinAcceso
    ? 'la app tiene que abrirse desde monday para consultar el tablero.'
    : e instanceof Error
      ? e.message
      : String(e)

/**
 * Carga una lista de tractores del Inventario y mantiene su estado de carga y de error.
 *
 * `consulta` tiene que ser estable (una función de módulo, no una flecha armada en cada render):
 * es dependencia del efecto que dispara la carga, y una nueva en cada render la dispararía en
 * bucle.
 */
export function useTractores(consulta: () => Promise<Tractor[]>) {
  const [tractores, setTractores] = useState<Tractor[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      setTractores(await consulta())
    } catch (e) {
      setTractores([])
      setError(mensaje(e))
    } finally {
      setCargando(false)
    }
  }, [consulta])

  useEffect(() => {
    void recargar()
  }, [recargar])

  return { tractores, cargando, error, recargar }
}

/**
 * Selección de tractores sobre una lista.
 *
 * `elegidos` se DERIVA de la lista cargada en vez de guardarse aparte. Si al recargar un tractor
 * cambió de estado y ya no está disponible, desaparece solo de lo elegido y del total: guardar
 * copias de los tractores elegidos dejaría despachar uno con los datos de hace cinco minutos.
 */
export function useSeleccionTractores(tractores: Tractor[]) {
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())

  const alternar = useCallback(
    (id: string) =>
      setSeleccionados((previos) => {
        const proximos = new Set(previos)
        if (proximos.has(id)) proximos.delete(id)
        else proximos.add(id)
        return proximos
      }),
    [],
  )

  const marcar = useCallback(
    (ids: string[]) => setSeleccionados((previos) => new Set([...previos, ...ids])),
    [],
  )

  const desmarcar = useCallback(
    (ids: string[]) =>
      setSeleccionados((previos) => {
        const quitar = new Set(ids)
        return new Set([...previos].filter((id) => !quitar.has(id)))
      }),
    [],
  )

  const limpiar = useCallback(() => setSeleccionados(new Set()), [])

  const elegidos = useMemo(
    () => tractores.filter((t) => seleccionados.has(t.id)),
    [tractores, seleccionados],
  )
  const total = useMemo(
    () => elegidos.reduce((suma, t) => suma + (t.valorNeto ?? 0), 0),
    [elegidos],
  )

  return { seleccionados, alternar, marcar, desmarcar, limpiar, elegidos, total }
}
