import { useCallback, useEffect, useMemo, useState } from 'react'
import { Desplegable } from '@/components/ui/Desplegable'
import { NACIONALIZADO } from '@/lib/despachos'
import { fechaCorta, hoyISO } from '@/lib/format'
import {
  ESTADO_ARRIBO,
  ESTADOS_CON_ARRIBO,
  PROXIMA_A_ARRIBAR,
  URL_TABLERO_CONTENEDORES,
} from '@/services/monday/columns'
import {
  actualizarContenedor,
  contenedoresDelTablero,
  depositosDeEntrega,
  listarTransportistas,
} from '@/services/monday/contenedoresDespacho'
import { sincronizarArribo } from '@/services/monday/estadoInventario'
import { SinAcceso } from '@/services/monday/sdk'
import type { Contacto, ContenedorDespacho, EdicionContenedor } from '@/types'

const mensaje = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/**
 * Los dos trabajos de esta pantalla.
 *
 * Son dos momentos distintos del mismo contenedor, con gente y días distintos, y mezclarlos fue
 * un error: al poder elegir juntos un contenedor que se puede marcar arribado y otro que no,
 * media pantalla se iba en explicar a cuál de los tildados no se le iba a aplicar qué. Separados,
 * cada lista tiene una sola acción posible y no hace falta ninguna advertencia.
 */
type Trabajo = 'entrega' | 'arribo'

const sinUbicacion = (c: ContenedorDespacho): boolean => !c.ubicacion.trim()
const sinTransportista = (c: ContenedorDespacho): boolean => !c.transportistaId
const arribado = (c: ContenedorDespacho): boolean => c.estadoArribo === ESTADO_ARRIBO.ARRIBADO

/** La carga está llegando o ya llegó: antes de eso el contenedor no es asunto de BERGER. */
const enEtapaDeArribo = (c: ContenedorDespacho): boolean =>
  ESTADOS_CON_ARRIBO.some((estado) => c.estadoCargaOp.includes(estado))

/**
 * ¿Se puede dar por arribado?
 *
 * Sólo con la OP **nacionalizada**: en "Próxima a Arribar" la carga está llegando pero todavía no
 * pasó la aduana, y un contenedor no se retira antes de eso.
 */
const puedeArribar = (c: ContenedorDespacho): boolean => c.estadoCargaOp.includes(NACIONALIZADO)

/** Busca por cualquiera de los nombres con los que se llama a un contenedor. */
const coincide = (c: ContenedorDespacho, busqueda: string): boolean => {
  const texto = busqueda.trim().toLowerCase()
  if (!texto) return true
  return [c.numero, c.nombre, c.nroOpDespachante, c.idOp, c.chasis]
    .filter(Boolean)
    .some((campo) => campo.toLowerCase().includes(texto))
}

/**
 * Actualizar Contenedores · BERGER S.A.
 *
 * Cuando la carga llega, el trabajo deja de ser por OP y pasa a ser **por contenedor**: un camión
 * llega y se descarga de a uno. Por eso esta pantalla entra por el tablero de 🚚Contenedores.
 *
 * Y son **dos trabajos, no uno**:
 *
 * - **Entrega** — mientras la OP está *Próxima a Arribar*: adónde va y quién lo lleva. Se prepara
 *   antes de que el barco llegue, que es justamente para lo que sirve.
 * - **Arribo** — cuando la OP ya está *Nacionalizada*: qué día llegó. Recién ahí salió de aduana
 *   y se puede retirar.
 *
 * Cada uno tiene su lista y su única acción, así que nunca hay que explicar que a alguno de los
 * elegidos no se le va a aplicar lo que se cargó.
 */
export function ActualizarContenedores() {
  const [contenedores, setContenedores] = useState<ContenedorDespacho[]>([])
  const [contactos, setContactos] = useState<Contacto[]>([])
  /** Los depósitos del desplegable de entrega. Se leen del tablero: van sumando. */
  const [depositos, setDepositos] = useState<string[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [trabajo, setTrabajo] = useState<Trabajo>('entrega')
  const [busqueda, setBusqueda] = useState('')
  const [soloPendientes, setSoloPendientes] = useState(true)

  /** Los tildados para cargarlos juntos. Se vacía al cambiar de trabajo. */
  const [lote, setLote] = useState<string[]>([])
  /**
   * Lo elegido en el panel del lote.
   *
   * Vive acá y NO se copia a cada contenedor al tocar: es la diferencia entre "esto vale para los
   * tildados" y "esto se copió una vez a los que había". Con lo segundo, tildar uno más lo dejaba
   * afuera de lo ya elegido.
   */
  const [loteValores, setLoteValores] = useState<Partial<EdicionContenedor>>({})
  const [fechaLote, setFechaLote] = useState(hoyISO())

  /** Lo editado a mano en CADA contenedor. Sólo los campos tocados: lo demás sale del lote. */
  const [ediciones, setEdiciones] = useState<Record<string, Partial<EdicionContenedor>>>({})

  const [guardando, setGuardando] = useState<string | null>(null)
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null)
  const [guardados, setGuardados] = useState<string[]>([])

  const recargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      setContenedores(await contenedoresDelTablero())
    } catch (e) {
      setContenedores([])
      setError(
        e instanceof SinAcceso
          ? 'la app tiene que abrirse desde monday para leer el tablero.'
          : mensaje(e),
      )
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void recargar()
  }, [recargar])

  useEffect(() => {
    listarTransportistas()
      .then(setContactos)
      .catch(() => setContactos([]))
    depositosDeEntrega()
      .then(setDepositos)
      .catch(() => setDepositos([]))
  }, [])

  /* ------------------------------------------------------------------ *
   * Las dos poblaciones
   * ------------------------------------------------------------------ */

  /** Entrega: los que están en camino o ya llegaron. Pendientes = les falta depósito o camión. */
  const deEntrega = useMemo(() => contenedores.filter(enEtapaDeArribo), [contenedores])
  const entregaPendiente = useMemo(
    () => deEntrega.filter((c) => sinUbicacion(c) || sinTransportista(c)),
    [deEntrega],
  )

  /** Arribo: sólo los nacionalizados. Pendientes = los que todavía no se marcaron. */
  const deArribo = useMemo(() => contenedores.filter(puedeArribar), [contenedores])
  const arriboPendiente = useMemo(() => deArribo.filter((c) => !arribado(c)), [deArribo])

  const todosDelTrabajo = trabajo === 'entrega' ? deEntrega : deArribo
  const pendientesDelTrabajo = trabajo === 'entrega' ? entregaPendiente : arriboPendiente

  const visibles = useMemo(
    () =>
      (soloPendientes ? pendientesDelTrabajo : todosDelTrabajo).filter((c) =>
        coincide(c, busqueda),
      ),
    [soloPendientes, pendientesDelTrabajo, todosDelTrabajo, busqueda],
  )

  /* ------------------------------------------------------------------ *
   * Qué queda en cada contenedor
   * ------------------------------------------------------------------ */

  const enLote = (c: ContenedorDespacho) => lote.includes(c.id)

  /**
   * Lo que va a quedar en un contenedor, con esta prioridad:
   *
   *   1. lo editado **a mano en su tarjeta** —gana siempre, es lo más específico—,
   *   2. lo elegido en el **panel del lote**, si está tildado,
   *   3. lo que ya tiene en monday.
   *
   * Esa escalera permite "todos a este depósito, menos éste" sin destildar nada.
   */
  const edicionDe = (c: ContenedorDespacho): EdicionContenedor => {
    const propio = ediciones[c.id] ?? {}
    const delLoteAhora = enLote(c) ? loteValores : {}
    const elegir = <T,>(a: T | undefined, b: T | undefined, c2: T): T => a ?? b ?? c2
    return {
      ubicacion: elegir(propio.ubicacion, delLoteAhora.ubicacion, c.ubicacion),
      transportistaId: elegir(
        propio.transportistaId,
        delLoteAhora.transportistaId,
        c.transportistaId,
      ),
      estadoArribo: elegir(propio.estadoArribo, delLoteAhora.estadoArribo, c.estadoArribo),
      fechaArribo: elegir(propio.fechaArribo, delLoteAhora.fechaArribo, c.fechaArribo),
    }
  }

  const cambiar = (c: ContenedorDespacho, cambio: Partial<EdicionContenedor>) =>
    setEdiciones((a) => ({ ...a, [c.id]: { ...(a[c.id] ?? {}), ...cambio } }))

  /** Qué cambió respecto de lo que hay en monday. Sólo eso viaja. */
  const cambiosDe = (c: ContenedorDespacho): Partial<EdicionContenedor> => {
    const e = edicionDe(c)
    const parcial: Partial<EdicionContenedor> = {}
    if ((e.ubicacion ?? '') !== (c.ubicacion ?? '')) parcial.ubicacion = e.ubicacion
    if ((e.transportistaId ?? null) !== (c.transportistaId ?? null)) {
      parcial.transportistaId = e.transportistaId ?? null
    }
    if ((e.estadoArribo ?? '') !== (c.estadoArribo ?? '')) parcial.estadoArribo = e.estadoArribo
    if ((e.fechaArribo ?? '') !== (c.fechaArribo ?? '')) parcial.fechaArribo = e.fechaArribo
    return parcial
  }

  const tieneCambios = (c: ContenedorDespacho) => Object.keys(cambiosDe(c)).length > 0

  /* ------------------------------------------------------------------ *
   * El lote
   * ------------------------------------------------------------------ */

  const alternarLote = (c: ContenedorDespacho) =>
    setLote((a) => (a.includes(c.id) ? a.filter((x) => x !== c.id) : [...a, c.id]))

  /** Los tildados que además están en pantalla: tildar y después filtrar no deja fantasmas. */
  const delLote = useMemo(() => visibles.filter((c) => lote.includes(c.id)), [visibles, lote])

  const vaciarLote = () => {
    setLote([])
    setLoteValores({})
  }

  /** Cambiar de trabajo empieza de cero: lo elegido para uno no tiene sentido en el otro. */
  const irA = (t: Trabajo) => {
    setTrabajo(t)
    vaciarLote()
    setSoloPendientes(true)
  }

  const guardar = async (c: ContenedorDespacho) => {
    const cambios = cambiosDe(c)
    if (Object.keys(cambios).length === 0) return

    setGuardando(c.id)
    setErrorGuardar(null)
    try {
      await actualizarContenedor(c.id, cambios)

      /* Marcar el contenedor arribado es decir que esos tractores llegaron: el Inventario tiene
         que enterarse. Sólo al PASAR a arribado —no cada vez que se guarda uno que ya lo estaba—
         y sólo con los tractores de ESE contenedor, que son los que viajaron en él. */
      if (
        cambios.estadoArribo === ESTADO_ARRIBO.ARRIBADO &&
        c.estadoArribo !== ESTADO_ARRIBO.ARRIBADO
      ) {
        const fallas = await sincronizarArribo(c.inventarioIds)
        if (fallas.length > 0) {
          setErrorGuardar(`${c.numero || c.nombre}: ${fallas.join(' · ')}`)
        }
      }

      setGuardados((a) => [...a, c.id])
      /* Se actualiza la fila en memoria en vez de recargar el tablero entero: el resto no cambió,
         y recargar haría desaparecer de golpe el que se acaba de completar. */
      setContenedores((a) =>
        a.map((x) =>
          x.id === c.id
            ? {
                ...x,
                ubicacion: cambios.ubicacion ?? x.ubicacion,
                estadoArribo: cambios.estadoArribo ?? x.estadoArribo,
                fechaArribo: cambios.fechaArribo ?? x.fechaArribo,
                transportistaId:
                  cambios.transportistaId !== undefined
                    ? cambios.transportistaId
                    : x.transportistaId,
                transportista: cambios.transportistaId
                  ? (contactos.find((k) => k.id === cambios.transportistaId)?.nombre ??
                    x.transportista)
                  : x.transportista,
              }
            : x,
        ),
      )
      setEdiciones((a) => {
        const { [c.id]: _, ...resto } = a
        return resto
      })
      setLote((a) => a.filter((x) => x !== c.id))
    } catch (e) {
      setErrorGuardar(`No se pudo guardar ${c.numero || c.nombre}: ${mensaje(e)}`)
      throw e
    } finally {
      setGuardando(null)
    }
  }

  /** Guarda de a uno, en orden: si el tercero falla, los dos anteriores ya quedaron bien. */
  const guardarLote = async () => {
    setErrorGuardar(null)
    const fallaron: string[] = []
    for (const c of delLote) {
      if (!tieneCambios(c)) continue
      try {
        await guardar(c)
      } catch {
        fallaron.push(c.numero || c.nombre)
      }
    }
    if (fallaron.length > 0) setErrorGuardar(`No se pudieron guardar: ${fallaron.join(', ')}.`)
    vaciarLote()
  }

  const conCambiosDelLote = delLote.filter(tieneCambios)

  /* ------------------------------------------------------------------ */

  const nombreDelContacto = (id: string | null) => contactos.find((x) => x.id === id)?.nombre ?? ''

  /** El renglón del resumen: qué le va a pasar a este contenedor. */
  const resumenDe = (c: ContenedorDespacho): string => {
    const cambio = cambiosDe(c)
    const partes: string[] = []
    if (cambio.ubicacion !== undefined) {
      partes.push(`entrega → ${cambio.ubicacion || '(sin depósito)'}`)
    }
    if (cambio.transportistaId !== undefined) {
      partes.push(`transportista → ${nombreDelContacto(cambio.transportistaId) || '(sin asignar)'}`)
    }
    /* El arribo se dice en un solo renglón: marcarlo y fecharlo son el mismo acto. */
    if (cambio.estadoArribo !== undefined || cambio.fechaArribo !== undefined) {
      const dia = cambio.fechaArribo ?? c.fechaArribo
      partes.push(
        cambio.estadoArribo === ESTADO_ARRIBO.PENDIENTE
          ? 'vuelve a pendiente de arribar'
          : `arribado el ${dia ? fechaCorta(dia) : 'sin fecha'}`,
      )
    }
    return partes.join(' · ')
  }

  return (
    <div className="scroll">
      <div className="view">
        <div className="sec-head">
          <span className="sec-num">
            <i className="fa-solid fa-truck-ramp-box" aria-hidden="true" />
          </span>
          <span className="sec-txt">
            <span className="sec-tit">Contenedores</span>
            <span className="sec-det">
              Dos momentos distintos del mismo contenedor: primero <b>adónde va y quién lo lleva</b>
              , y cuando sale de aduana, <b>qué día llegó</b>.
            </span>
          </span>
          <button
            type="button"
            className="btn btn--borde btn--chico"
            style={{ marginLeft: 'auto' }}
            disabled={cargando}
            onClick={() => void recargar()}
          >
            <i className={`fa-solid fa-rotate${cargando ? ' fa-spin' : ''}`} aria-hidden="true" />{' '}
            Actualizar
          </button>
        </div>

        {/* Los dos trabajos, como dos tarjetas grandes: es la primera decisión de la pantalla y
            define todo lo que viene abajo, así que no puede ser un chip perdido entre filtros. */}
        <div className="decision decision--grande decision--elige">
          <button
            type="button"
            aria-pressed={trabajo === 'entrega'}
            className={`opcion opcion--confirmar${trabajo === 'entrega' ? ' opcion--elegida' : ''}`}
            onClick={() => irA('entrega')}
          >
            <span className="opcion-ic">
              <i className="fa-solid fa-map-location-dot" aria-hidden="true" />
            </span>
            <span className="opcion-txt">
              <span className="opcion-tit">Entrega y transportista</span>
              <span className="opcion-det">
                De las OP <b>{PROXIMA_A_ARRIBAR}</b> y nacionalizadas. Se prepara antes de que
                llegue.
              </span>
              <span
                className={`opcion-req ${
                  entregaPendiente.length > 0 ? 'opcion-req--aviso' : 'opcion-req--ok'
                }`}
              >
                {entregaPendiente.length > 0 ? (
                  <>
                    <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                    {entregaPendiente.length} sin depósito o sin transportista
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-circle-check" aria-hidden="true" />
                    Todos tienen entrega y transportista
                  </>
                )}
              </span>
            </span>
          </button>

          <button
            type="button"
            aria-pressed={trabajo === 'arribo'}
            className={`opcion opcion--proponer${trabajo === 'arribo' ? ' opcion--elegida' : ''}`}
            onClick={() => irA('arribo')}
          >
            <span className="opcion-ic">
              <i className="fa-solid fa-anchor" aria-hidden="true" />
            </span>
            <span className="opcion-txt">
              <span className="opcion-tit">Marcar arribos</span>
              <span className="opcion-det">
                Sólo los de OP <b>{NACIONALIZADO}</b>: qué día llegó cada uno.
              </span>
              <span
                className={`opcion-req ${
                  arriboPendiente.length > 0 ? 'opcion-req--aviso' : 'opcion-req--ok'
                }`}
              >
                {deArribo.length === 0 ? (
                  <>
                    <i className="fa-solid fa-circle-minus" aria-hidden="true" />
                    Todavía no hay ninguna OP nacionalizada
                  </>
                ) : arriboPendiente.length > 0 ? (
                  <>
                    <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                    {arriboPendiente.length} sin marcar como arribado
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-circle-check" aria-hidden="true" />
                    Todos marcados
                  </>
                )}
              </span>
            </span>
          </button>
        </div>

        <div className="filtros" style={{ marginTop: 14 }}>
          <div className="filtros-fila">
            <label className="campo campo--busqueda">
              <span className="campo-lbl">Buscar</span>
              <input
                className="input"
                value={busqueda}
                placeholder="Buscar un contenedor…"
                onChange={(e) => setBusqueda(e.target.value)}
              />
              <span className="campo-ayuda campo-ayuda--ejemplo">
                N° de contenedor, N° de OP, ID del despacho o chasis
              </span>
            </label>
          </div>
          <div className="filtros-fila">
            <button
              type="button"
              className={`chip chip--boton${soloPendientes ? ' chip--activo' : ''}`}
              onClick={() => setSoloPendientes(true)}
            >
              Pendientes ({pendientesDelTrabajo.length})
            </button>
            <button
              type="button"
              className={`chip chip--boton${soloPendientes ? '' : ' chip--activo'}`}
              onClick={() => setSoloPendientes(false)}
            >
              Todos ({todosDelTrabajo.length})
            </button>
            <span className="filtros-nota">
              <i className="fa-solid fa-boxes-stacked" aria-hidden="true" />
              {visibles.length} en pantalla
            </span>
          </div>
        </div>

        {error && (
          <div className="aviso aviso--error">
            <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
            <span>No se pudieron leer los contenedores: {error}</span>
          </div>
        )}

        {errorGuardar && (
          <div className="aviso aviso--error">
            <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
            <span>{errorGuardar}</span>
          </div>
        )}

        {cargando && (
          <div className="vacio">
            <span className="spin spin--oscuro" aria-hidden="true" />
            <span className="vacio-tit">Leyendo los contenedores…</span>
          </div>
        )}

        {!cargando && !error && visibles.length === 0 && (
          <div className="vacio">
            <span className="vacio-ic">
              <i className="fa-solid fa-circle-check" aria-hidden="true" />
            </span>
            <span className="vacio-tit">
              {busqueda.trim()
                ? 'Ningún contenedor coincide con la búsqueda'
                : trabajo === 'entrega'
                  ? 'No hay entregas pendientes'
                  : 'No hay arribos pendientes'}
            </span>
            <span className="vacio-det">
              {busqueda.trim()
                ? 'Probá con el N° de contenedor, el de la OP o una matrícula.'
                : trabajo === 'entrega'
                  ? 'Cuando el despachante arme contenedores nuevos, van a aparecer acá.'
                  : 'Cuando una OP pase a Nacionalizado, sus contenedores aparecen para marcarles el arribo.'}
            </span>
          </div>
        )}

        {/* ---------------- El panel del lote ---------------- */}
        {delLote.length > 0 && (
          <div className="lote">
            <div className="lote-head">
              <span className="lote-tit">
                <i className="fa-solid fa-layer-group" aria-hidden="true" /> {delLote.length}{' '}
                contenedor{delLote.length === 1 ? '' : 'es'} elegido
                {delLote.length === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                className="btn btn--texto btn--chico"
                style={{ marginLeft: 'auto' }}
                onClick={vaciarLote}
              >
                <i className="fa-solid fa-xmark" aria-hidden="true" /> Vaciar la selección
              </button>
            </div>

            <span className="lote-det">
              Lo que elijas acá vale para los {delLote.length}, también para los que tildes después.
              Todavía no se guarda, y podés corregir alguno en su tarjeta.
            </span>

            {trabajo === 'entrega' ? (
              <div className="datos datos--form">
                <div className="campo">
                  <span className="campo-lbl">Ubicación de entrega para todos</span>
                  <Desplegable
                    valor={loteValores.ubicacion ?? ''}
                    opciones={depositos}
                    vacio="Elegir un depósito…"
                    buscable={depositos.length > 8}
                    onCambiar={(v) => setLoteValores((a) => ({ ...a, ubicacion: v || undefined }))}
                  />
                </div>
                <div className="campo">
                  <span className="campo-lbl">Transportista para todos</span>
                  <Desplegable
                    valor={loteValores.transportistaId ?? ''}
                    opciones={contactos.map((x) => ({ valor: x.id, rotulo: x.nombre }))}
                    vacio="Elegir un transportista…"
                    buscable={contactos.length > 8}
                    onCambiar={(v) =>
                      setLoteValores((a) => ({ ...a, transportistaId: v || undefined }))
                    }
                  />
                </div>
              </div>
            ) : (
              /* En esta lista TODOS pueden arribar, así que no hay nada que advertir: un control
                 —la fecha— y un botón que la aplica. */
              <div className="lote-arribo-fila">
                <label className="campo campo--chico">
                  <span className="campo-lbl">¿Qué día llegaron?</span>
                  <input
                    className="input"
                    type="date"
                    max={hoyISO()}
                    value={fechaLote}
                    onChange={(ev) => {
                      setFechaLote(ev.target.value)
                      setLoteValores((a) =>
                        a.estadoArribo ? { ...a, fechaArribo: ev.target.value } : a,
                      )
                    }}
                  />
                </label>
                <button
                  type="button"
                  className={`btn btn--chico ${
                    loteValores.estadoArribo ? 'btn--borde' : 'btn--primario'
                  }`}
                  disabled={!fechaLote}
                  onClick={() =>
                    setLoteValores((a) =>
                      a.estadoArribo
                        ? { ...a, estadoArribo: undefined, fechaArribo: undefined }
                        : { ...a, estadoArribo: ESTADO_ARRIBO.ARRIBADO, fechaArribo: fechaLote },
                    )
                  }
                >
                  {loteValores.estadoArribo ? (
                    <>
                      <i className="fa-solid fa-rotate-left" aria-hidden="true" /> Deshacer
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-circle-check" aria-hidden="true" /> Marcar los{' '}
                      {delLote.length} como arribados
                    </>
                  )}
                </button>
              </div>
            )}

            {conCambiosDelLote.length > 0 && (
              <div className="lote-resumen">
                <span className="lote-resumen-tit">Se va a guardar:</span>
                <ul className="cambios">
                  {conCambiosDelLote.map((c) => (
                    <li key={c.id} className="cambio">
                      <span className="cambio-campo">{c.numero || c.nombre}</span>
                      <span className="cambio-despues">{resumenDe(c)}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="btn btn--primario btn--chico"
                  disabled={Boolean(guardando)}
                  onClick={() => void guardarLote()}
                >
                  {guardando ? (
                    <>
                      <span className="spin" aria-hidden="true" /> Guardando…
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-cloud-arrow-up" aria-hidden="true" /> Guardar los{' '}
                      {conCambiosDelLote.length}
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ---------------- Las tarjetas ---------------- */}
        <div className="op-editores">
          {visibles.map((c) => {
            const e = edicionDe(c)
            const cambios = tieneCambios(c)
            const yaArribo = e.estadoArribo === ESTADO_ARRIBO.ARRIBADO
            const guardado = guardados.includes(c.id)

            return (
              <div key={c.id} className="card card--flush op-editor">
                <div className="ctitle op-editor-head">
                  <button
                    type="button"
                    className={`trow-check${enLote(c) ? ' trow-check--sel' : ''}`}
                    aria-pressed={enLote(c)}
                    aria-label={`Elegir ${c.numero || c.nombre} para cargar en lote`}
                    onClick={() => alternarLote(c)}
                  >
                    {enLote(c) && <i className="fa-solid fa-check" aria-hidden="true" />}
                  </button>
                  <span className="op-editor-nom">
                    <i className="fa-solid fa-box" aria-hidden="true" /> {c.numero || c.nombre}
                  </span>
                  <span className="op-editor-chips">
                    {c.idOp && <span className="chip chip--teal">{c.idOp}</span>}
                    {c.nroOpDespachante && (
                      <span className="chip chip--magenta">OP {c.nroOpDespachante}</span>
                    )}
                    {c.estadoCargaOp && <span className="chip chip--azul">{c.estadoCargaOp}</span>}
                    <span className={`chip ${yaArribo ? 'chip--verde' : 'chip--ambar'}`}>
                      {yaArribo && e.fechaArribo
                        ? `Arribado ${fechaCorta(e.fechaArribo)}`
                        : e.estadoArribo || 'Sin estado de arribo'}
                    </span>
                    {guardado && !cambios && (
                      <span className="chip chip--verde">
                        <i className="fa-solid fa-check" aria-hidden="true" /> Guardado
                      </span>
                    )}
                  </span>
                </div>

                <div className="op-editor-cuerpo">
                  <div className="opfila-chips" style={{ marginBottom: 10 }}>
                    {c.chasis
                      .split(',')
                      .map((x) => x.trim())
                      .filter(Boolean)
                      .map((chasis) => (
                        <span key={chasis} className="chasis chasis--chico">
                          {chasis}
                        </span>
                      ))}
                    {c.fechaCreacion && (
                      <span className="chip chip--violeta">
                        Armado {fechaCorta(c.fechaCreacion)}
                      </span>
                    )}
                  </div>

                  {trabajo === 'entrega' ? (
                    <div className="datos datos--form">
                      <div className="campo">
                        <span className="campo-lbl">
                          Ubicación de entrega {sinUbicacion(c) && '· pendiente'}
                        </span>
                        <Desplegable
                          valor={e.ubicacion}
                          opciones={depositos}
                          vacio="(sin depósito)"
                          buscable={depositos.length > 8}
                          onCambiar={(v) => cambiar(c, { ubicacion: v })}
                        />
                        {/* Lo que había en la columna vieja de ubicación: se muestra hasta que se
                            elija un depósito, para no perder de vista lo ya cargado. */}
                        {!e.ubicacion && c.ubicacionVieja && (
                          <span className="campo-ayuda">
                            <i className="fa-solid fa-clock-rotate-left" aria-hidden="true" /> Antes
                            decía: {c.ubicacionVieja}
                          </span>
                        )}
                      </div>

                      <div className="campo">
                        <span className="campo-lbl">
                          Transportista {sinTransportista(c) && '· pendiente'}
                        </span>
                        <Desplegable
                          valor={e.transportistaId ?? ''}
                          opciones={contactos.map((x) => ({ valor: x.id, rotulo: x.nombre }))}
                          vacio="(sin asignar)"
                          buscable={contactos.length > 8}
                          onCambiar={(v) => cambiar(c, { transportistaId: v || null })}
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Marcar el arribo y decir qué día llegó son el mismo acto: un interruptor
                          que ya deja puesta la fecha de hoy, y la fecha al lado para corregirla. */}
                      <div className="decision">
                        <button
                          type="button"
                          aria-pressed={yaArribo}
                          className={`opcion opcion--confirmar${yaArribo ? ' opcion--elegida' : ''}`}
                          onClick={() =>
                            cambiar(
                              c,
                              yaArribo
                                ? { estadoArribo: ESTADO_ARRIBO.PENDIENTE, fechaArribo: '' }
                                : {
                                    estadoArribo: ESTADO_ARRIBO.ARRIBADO,
                                    fechaArribo: e.fechaArribo || hoyISO(),
                                  },
                            )
                          }
                        >
                          <span className="opcion-ic">
                            <i
                              className={`fa-solid ${yaArribo ? 'fa-circle-check' : 'fa-circle'}`}
                              aria-hidden="true"
                            />
                          </span>
                          <span className="opcion-txt">
                            <span className="opcion-tit">
                              {yaArribo
                                ? `Arribado el ${
                                    e.fechaArribo ? fechaCorta(e.fechaArribo) : 'sin fecha'
                                  }`
                                : 'Marcar como arribado'}
                            </span>
                            <span className="opcion-det">
                              {yaArribo
                                ? 'Tocá de nuevo si te equivocaste'
                                : 'Llegó a destino · se guarda con la fecha de hoy'}
                            </span>
                          </span>
                        </button>
                      </div>

                      {yaArribo && (
                        <div className="arribo-fecha">
                          <label className="campo campo--chico">
                            <span className="campo-lbl">¿Qué día llegó?</span>
                            <input
                              className="input"
                              type="date"
                              value={e.fechaArribo ?? ''}
                              max={hoyISO()}
                              onChange={(ev) => cambiar(c, { fechaArribo: ev.target.value })}
                            />
                          </label>
                          <span className="arribo-nota">
                            {e.fechaArribo ? (
                              <>
                                <i className="fa-solid fa-circle-info" aria-hidden="true" />{' '}
                                Cambiála si llegó antes y recién ahora lo estás marcando.
                              </>
                            ) : (
                              <>
                                <i
                                  className="fa-solid fa-triangle-exclamation"
                                  aria-hidden="true"
                                />{' '}
                                Va a quedar arribado sin fecha.
                              </>
                            )}
                          </span>
                        </div>
                      )}

                      {/* La entrega no se edita acá, pero se muestra: es lo que el transportista
                          necesita saber, y si falta conviene enterarse antes de que llegue. */}
                      <div className="datos datos--lectura" style={{ marginTop: 10 }}>
                        <div className="campo">
                          <span className="campo-lbl">Ubicación de entrega</span>
                          <span className="campo-fijo">
                            <i className="fa-solid fa-location-dot" aria-hidden="true" />{' '}
                            {c.ubicacion || 'Sin cargar'}
                          </span>
                        </div>
                        <div className="campo">
                          <span className="campo-lbl">Transportista</span>
                          <span className="campo-fijo">
                            <i className="fa-solid fa-truck-fast" aria-hidden="true" />{' '}
                            {c.transportista ||
                              nombreDelContacto(c.transportistaId) ||
                              'Sin asignar'}
                          </span>
                        </div>
                      </div>

                      {(sinUbicacion(c) || sinTransportista(c)) && (
                        <span className="campo-ayuda campo-ayuda--aviso">
                          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" /> Le
                          falta {sinUbicacion(c) ? 'el depósito' : ''}
                          {sinUbicacion(c) && sinTransportista(c) ? ' y ' : ''}
                          {sinTransportista(c) ? 'el transportista' : ''}. Se carga en{' '}
                          <b>Entrega y transportista</b>.
                        </span>
                      )}
                    </>
                  )}

                  <div className="op-editor-acciones">
                    <a
                      className="btn btn--texto btn--chico"
                      href={`${URL_TABLERO_CONTENEDORES}/pulses/${c.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />{' '}
                      Ver en monday
                    </a>
                    <button
                      type="button"
                      className="btn btn--marca btn--chico"
                      disabled={!cambios || guardando === c.id}
                      onClick={() => void guardar(c).catch(() => undefined)}
                    >
                      {guardando === c.id ? (
                        <>
                          <span className="spin" aria-hidden="true" /> Guardando…
                        </>
                      ) : (
                        <>
                          <i className="fa-solid fa-cloud-arrow-up" aria-hidden="true" /> Guardar
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
