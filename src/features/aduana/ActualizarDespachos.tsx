import { useEffect, useMemo, useState } from 'react'
import { Stepper } from '@/components/ui/Stepper'
import { tonoEstadoCarga } from '@/lib/chips'
import {
  cambiosDe,
  coincide,
  faltaNroDespacho,
  soloLoCambiado,
  valoresActuales,
} from '@/lib/despachos'
import { avisarProximaArribar } from '@/services/monday/avisos'
import { ESTADO_CARGA, PROXIMA_A_ARRIBAR, URL_TABLERO_DESPACHANTE } from '@/services/monday/columns'
import { contenedoresDeOp, tractoresDeOps } from '@/services/monday/contenedoresDespacho'
import { actualizarDespacho, ARCHIVOS_OP, ROTULO_ARCHIVO } from '@/services/monday/despachos'
import { sincronizarPorEstadoDeCarga } from '@/services/monday/estadoInventario'
import { subirArchivoAColumna } from '@/services/monday/sdk'
import type {
  ArchivosDespacho,
  CambioDespacho,
  ContenedorDespacho,
  DespachoOP,
  EdicionDespacho,
  EtapaAduana,
  ModoDespachante,
  ResultadoActualizacion,
  TractorDeOp,
} from '@/types'
import { ArmarContenedores } from './ArmarContenedores'
import { EditorOP } from './EditorOP'
import { EtiquetasOP } from './EtiquetasOP'
import { FichaOP } from './FichaOP'
import { useDespachos } from './useDespachos'

const mensaje = (e: unknown): string => (e instanceof Error ? e.message : String(e))

const SIN_ARCHIVOS: ArchivosDespacho = {
  fcTransporteImpo: [],
  despachoImpo: [],
  fcTerminal: [],
  gastosVarios: [],
  facturaSenasa: [],
  facturaModoc: [],
  facturaPrecintos: [],
  vepArca: [],
  vepTerminal: [],
}

/** Qué columna de monday le corresponde a cada archivo del formulario. */
const COLUMNA_DE_ARCHIVO: Record<keyof ArchivosDespacho, string> = {
  fcTransporteImpo: ARCHIVOS_OP[0],
  despachoImpo: ARCHIVOS_OP[1],
  fcTerminal: ARCHIVOS_OP[2],
  gastosVarios: ARCHIVOS_OP[3],
  facturaSenasa: ARCHIVOS_OP[4],
  facturaModoc: ARCHIVOS_OP[5],
  facturaPrecintos: ARCHIVOS_OP[6],
  vepArca: ARCHIVOS_OP[7],
  vepTerminal: ARCHIVOS_OP[8],
}

/**
 * Actualizar Despacho OP · DESPACHANTE.
 *
 * Lo que hace el despachante de aduana todos los días. Después de elegir las OP, decide qué va a
 * hacer con ellas:
 *
 *   **Actualizar datos** — cargar cómo avanza el viaje y subir los comprobantes del trámite.
 *   **Armar contenedores** — decir en qué contenedor va cada tractor. Se habilita cuando la OP ya
 *   tiene N° de OP del despachante: antes de eso el trámite no arrancó y no hay contra qué armar.
 *
 * El camino de actualizar tiene tres pasos, y cada uno evita un error distinto: ver cómo está la OP
 * antes de tocarla, mandar sólo lo que cambió, y leer `antes → después` antes de escribir.
 *
 * **"Próxima a Arribar" exige los contenedores armados.** Ese estado dispara el aviso a BERGER, que
 * lleva los links de los contenedores para que carguen transportista y ubicación de entrega: sin
 * contenedores, el aviso no sirve para nada.
 */
export function ActualizarDespachos() {
  const { despachos, cargando, error, recargar } = useDespachos()

  const [etapa, setEtapa] = useState<EtapaAduana>('seleccion')
  const [modo, setModo] = useState<ModoDespachante>('datos')
  const [estados, setEstados] = useState<string[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [abierta, setAbierta] = useState<string | null>(null)

  /** Lo elegido y lo editado viven juntos: una OP seleccionada siempre tiene su formulario. */
  const [seleccion, setSeleccion] = useState<string[]>([])
  const [ediciones, setEdiciones] = useState<Record<string, EdicionDespacho>>({})
  const [archivos, setArchivos] = useState<Record<string, ArchivosDespacho>>({})

  /** Tractores y contenedores de las OP elegidas. Se cargan al pasar del paso 1. */
  const [tractores, setTractores] = useState<Record<string, TractorDeOp[]>>({})
  const [contenedores, setContenedores] = useState<Record<string, ContenedorDespacho[]>>({})
  const [cargandoOp, setCargandoOp] = useState(false)

  const [enviando, setEnviando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ResultadoActualizacion | null>(null)

  const visibles = useMemo(
    () => despachos.filter((op) => coincide(op, estados, busqueda)),
    [despachos, estados, busqueda],
  )

  /* Los tractores de todas las OP del tablero, en UNA consulta, apenas se cargan las OP.
     Sin esto, "¿a cuál le falta armar los contenedores?" sólo se podía contestar entrando a cada
     una, que es justamente la pregunta con la que se abre esta pantalla. La cantidad que estimó
     BERGER es una estimación; la que vale es la que arma el despachante. */
  useEffect(() => {
    if (despachos.length === 0) return
    tractoresDeOps(despachos.map((op) => op.id))
      .then((porOp) => setTractores((a) => ({ ...Object.fromEntries(porOp), ...a })))
      .catch(() => undefined)
  }, [despachos])

  const elegidas = useMemo(
    () =>
      seleccion
        .map((id) => despachos.find((op) => op.id === id))
        .filter((op): op is DespachoOP => Boolean(op)),
    [seleccion, despachos],
  )

  /** Los cambios de cada OP elegida, calculados una vez y usados en los tres lugares. */
  const cambiosPorOp = useMemo(() => {
    const mapa = new Map<string, CambioDespacho[]>()
    for (const op of elegidas) {
      const edicion = ediciones[op.id] ?? valoresActuales(op)
      mapa.set(op.id, cambiosDe(op, edicion))
    }
    return mapa
  }, [elegidas, ediciones])

  /** Cuántos archivos nuevos hay cargados para una OP. */
  const archivosDe = (id: string) => archivos[id] ?? SIN_ARCHIVOS
  const archivosNuevos = (id: string) =>
    Object.values(archivosDe(id)).reduce((n, lista) => n + lista.length, 0)

  /** Una OP sin cambios y sin archivos nuevos no tiene nada que guardar. */
  const sinNada = elegidas.filter(
    (op) => (cambiosPorOp.get(op.id) ?? []).length === 0 && archivosNuevos(op.id) === 0,
  )
  const totalCambios = elegidas.reduce(
    (n, op) => n + (cambiosPorOp.get(op.id) ?? []).length + archivosNuevos(op.id),
    0,
  )

  /** Tractores de una OP que todavía no están en ningún contenedor. */
  const sinContenedor = (id: string) => (tractores[id] ?? []).filter((t) => !t.contenedorId).length

  /**
   * Cómo está el armado de contenedores de una OP.
   *
   * `null` mientras los tractores no se leyeron: mejor no decir nada que decir "faltan" sobre algo
   * que todavía no se sabe.
   */
  const armado = (id: string): { listo: boolean; faltan: number; total: number } | null => {
    const lista = tractores[id]
    if (!lista) return null
    const faltan = lista.filter((t) => !t.contenedorId).length
    return { listo: lista.length > 0 && faltan === 0, faltan, total: lista.length }
  }

  /** Las que quieren pasar a "Próxima a Arribar" sin tener los contenedores armados. */
  const bloqueadas = elegidas.filter(
    (op) =>
      (ediciones[op.id] ?? valoresActuales(op)).estadoCarga === PROXIMA_A_ARRIBAR &&
      sinContenedor(op.id) > 0,
  )

  /** Las que quieren nacionalizarse sin el N° del despacho de importación. */
  const sinNroDespacho = elegidas.filter((op) =>
    faltaNroDespacho(ediciones[op.id] ?? valoresActuales(op)),
  )

  /** La OP sobre la que se arman contenedores: el modo trabaja sobre UNA. */
  const opDeContenedores = elegidas[0] ?? null
  const puedeArmar = elegidas.length === 1 && Boolean(opDeContenedores?.nroOp.trim())

  /* Los dos requisitos del paso 2, calculados una sola vez para poder mostrarlos en las DOS
     tarjetas: cada una tiene que decir qué le falta a ella y qué habilita en la otra. */
  const faltaNroOp = elegidas.length === 1 && !opDeContenedores?.nroOp.trim()
  /** Tractores sin contenedor sumando TODAS las OP elegidas: son las que no van a poder arribar. */
  const pendientesDeContenedor = elegidas.reduce((n, op) => n + sinContenedor(op.id), 0)

  const alternar = (op: DespachoOP) => {
    setSeleccion((actual) =>
      actual.includes(op.id) ? actual.filter((id) => id !== op.id) : [...actual, op.id],
    )
    setEdiciones((actual) => (actual[op.id] ? actual : { ...actual, [op.id]: valoresActuales(op) }))
  }

  const quitar = (id: string) => setSeleccion((actual) => actual.filter((x) => x !== id))

  const alternarEstado = (estado: string) =>
    setEstados((actual) =>
      actual.includes(estado) ? actual.filter((e) => e !== estado) : [...actual, estado],
    )

  const reiniciar = () => {
    setSeleccion([])
    setEdiciones({})
    setArchivos({})
    setTractores({})
    setContenedores({})
    setResultado(null)
    setErrorEnvio(null)
    setModo('datos')
    setEtapa('seleccion')
    void recargar()
  }

  /**
   * Trae los tractores de las OP elegidas y sus contenedores.
   *
   * Se hace al salir del paso 1 y no al entrar a la pantalla: sólo importan las OP elegidas, y
   * pedir los subitems de todo el tablero para mostrar una lista sería traer de más.
   */
  const cargarDetalle = async () => {
    setCargandoOp(true)
    try {
      const porOp = await tractoresDeOps(elegidas.map((op) => op.id))
      const nuevosTractores: Record<string, TractorDeOp[]> = {}
      const nuevosContenedores: Record<string, ContenedorDespacho[]> = {}
      for (const [opId, lista] of porOp) {
        nuevosTractores[opId] = lista
        nuevosContenedores[opId] = await contenedoresDeOp(lista)
      }
      setTractores(nuevosTractores)
      setContenedores(nuevosContenedores)
    } catch (e) {
      setErrorEnvio(`No se pudieron leer los tractores de la OP: ${mensaje(e)}`)
    } finally {
      setCargandoOp(false)
    }
  }

  const irAModo = () => {
    setErrorEnvio(null)
    setEtapa('modo')
    void cargarDetalle()
  }

  const guardar = async () => {
    setEnviando(true)
    setErrorEnvio(null)
    const actualizadas: string[] = []
    const avisadas: string[] = []
    const advertencias: string[] = []

    /* Una por una y no todo o nada: si la quinta falla, las cuatro anteriores ya quedaron bien
       guardadas y no hay nada que deshacer. Lo que falló se informa con nombre y apellido. */
    for (const op of elegidas) {
      const edicion = ediciones[op.id] ?? valoresActuales(op)
      const cambios = soloLoCambiado(op, edicion)
      const nombre = op.nombre || op.idDespacho || op.id
      let tocada = false

      if (Object.keys(cambios).length > 0) {
        try {
          await actualizarDespacho(op.id, cambios)
          tocada = true
        } catch (e) {
          advertencias.push(`No se pudo actualizar ${nombre}: ${mensaje(e)}`)
          continue
        }
      }

      /* Los archivos van DESPUÉS de las columnas: si una subida falla, los datos ya quedaron
         guardados y sólo se pierde el adjunto, que se puede volver a subir. */
      for (const [campo, lista] of Object.entries(archivosDe(op.id))) {
        const columna = COLUMNA_DE_ARCHIVO[campo as keyof ArchivosDespacho]
        /* Uno por uno: monday SUMA cada archivo a la columna, no la reemplaza —probado contra la
           API—, así que subir tres certificados de Senasa son tres llamadas y las tres quedan. */
        for (const archivo of lista) {
          try {
            await subirArchivoAColumna(op.id, columna, archivo)
            tocada = true
          } catch (e) {
            advertencias.push(
              `No se pudo subir "${ROTULO_ARCHIVO[columna]}" (${archivo.name}) de ${nombre}: ${mensaje(e)}`,
            )
          }
        }
      }

      if (tocada) actualizadas.push(nombre)

      /* El estado de carga es de la CARGA; el del Inventario es de cada tractor, y tiene que
         seguirlo. Sólo cuando el estado cambió de verdad: volver a guardar la misma OP no vuelve a
         escribir los mismos tractores. */
      if (cambios.estadoCarga && cambios.estadoCarga !== op.estadoCarga) {
        const inventarioIds = (tractores[op.id] ?? [])
          .map((t) => t.inventarioId)
          .filter((id): id is string => Boolean(id))
        const fallas = await sincronizarPorEstadoDeCarga(cambios.estadoCarga, inventarioIds)
        advertencias.push(...fallas.map((f) => `${nombre}: ${f}`))
      }

      /* El aviso a BERGER sale sólo cuando la OP RECIÉN pasa a "Próxima a Arribar": si ya estaba
         en ese estado, volver a guardarla no vuelve a avisar. */
      const entraAProxima =
        cambios.estadoCarga === PROXIMA_A_ARRIBAR && op.estadoCarga !== PROXIMA_A_ARRIBAR
      if (entraAProxima) {
        const avisos = await avisarProximaArribar(op, contenedores[op.id] ?? [])
        advertencias.push(...avisos)
        if (avisos.length === 0) avisadas.push(nombre)
      }
    }

    setEnviando(false)
    if (actualizadas.length === 0 && advertencias.length > 0) {
      setErrorEnvio(advertencias.join(' · '))
      return
    }
    setResultado({ actualizadas, advertencias, avisadas })
    setEtapa('listo')
  }

  /* ------------------------------------------------------------------ *
   * Armar contenedores
   * ------------------------------------------------------------------ */
  if (etapa === 'contenedores' && opDeContenedores) {
    return (
      <ArmarContenedores
        op={opDeContenedores}
        tractores={tractores[opDeContenedores.id] ?? []}
        armados={contenedores[opDeContenedores.id] ?? []}
        onVolver={() => setEtapa('modo')}
        onListo={(r) => {
          setResultado({
            actualizadas: [],
            advertencias: r.advertencias,
            avisadas: [],
          })
          setModo('contenedores')
          setEtapa('listo')
        }}
      />
    )
  }

  /* ------------------------------------------------------------------ *
   * Pantalla final
   * ------------------------------------------------------------------ */
  if (etapa === 'listo' && resultado) {
    const conProblemas = resultado.advertencias.length > 0
    const armoContenedores = modo === 'contenedores'
    return (
      <div className="scroll">
        <div className="view">
          <Stepper variante="aduana" actual="listo" />

          {conProblemas && (
            <div className="aviso aviso--alerta">
              <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
              <span>
                <b>Quedaron cosas sin resolver.</b> Revisalas en monday:
                <ul style={{ margin: '6px 0 0 18px' }}>
                  {resultado.advertencias.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </span>
            </div>
          )}

          <div className="final">
            <span className="final-ic">
              <i
                className={`fa-solid ${conProblemas ? 'fa-circle-exclamation' : 'fa-check'}`}
                aria-hidden="true"
              />
            </span>
            <span className="final-tit">
              {armoContenedores ? 'Contenedores armados' : 'OP actualizadas'}
            </span>
            <span className="final-det">
              {armoContenedores
                ? 'Los contenedores quedaron creados con sus tractores conectados.'
                : `Se guardaron los cambios de ${resultado.actualizadas.length} OP en el tablero del Despachante de aduana.`}
            </span>

            <div className="final-datos">
              {resultado.actualizadas.map((nombre) => (
                <span key={nombre} className="chip chip--verde">
                  <i className="fa-solid fa-check" aria-hidden="true" /> {nombre}
                </span>
              ))}
              {resultado.avisadas.map((nombre) => (
                <span key={`aviso-${nombre}`} className="chip chip--violeta">
                  <i className="fa-solid fa-bell" aria-hidden="true" /> Aviso a BERGER · {nombre}
                </span>
              ))}
            </div>

            <div className="final-acciones">
              <a
                className="btn btn--borde"
                href={URL_TABLERO_DESPACHANTE}
                target="_blank"
                rel="noreferrer"
              >
                <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /> Ver en
                monday
              </a>
              <button type="button" className="btn btn--primario" onClick={reiniciar}>
                <i className="fa-solid fa-list" aria-hidden="true" /> Volver a la lista
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="scroll">
        <div className="view">
          <Stepper
            variante="aduana"
            actual={etapa}
            onIr={enviando ? undefined : (e) => setEtapa(e as EtapaAduana)}
          />

          {errorEnvio && (
            <div className="aviso aviso--error">
              <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
              <span>No se pudieron guardar los cambios: {errorEnvio}</span>
            </div>
          )}

          {/* ---------------- Paso 1 · Selección ---------------- */}
          {etapa === 'seleccion' && (
            <>
              <div className="sec-head">
                <span className="sec-num">1</span>
                <span className="sec-txt">
                  <span className="sec-tit">OP a trabajar</span>
                  <span className="sec-det">
                    Filtrá por estado de carga o buscá por nombre, N° de OP o ID del despacho.
                    Desplegá una OP para ver cómo está hoy antes de elegirla.
                  </span>
                </span>
              </div>

              {error && (
                <div className="aviso aviso--error">
                  <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
                  <span>
                    No se pudo leer el tablero: {error}{' '}
                    <button
                      type="button"
                      className="btn btn--texto btn--chico"
                      onClick={() => void recargar()}
                    >
                      Reintentar
                    </button>
                  </span>
                </div>
              )}

              <div className="filtros">
                <div className="filtros-fila">
                  <label className="campo campo--busqueda">
                    <span className="campo-lbl">Buscar</span>
                    <input
                      className="input"
                      value={busqueda}
                      placeholder="PAGOINV-019, N° de OP, buque…"
                      onChange={(e) => setBusqueda(e.target.value)}
                    />
                  </label>
                </div>

                <div className="filtros-tags">
                  {ESTADO_CARGA.map((estado) => {
                    const activo = estados.includes(estado)
                    const cuantos = despachos.filter((op) => op.estadoCarga === estado).length
                    return (
                      <button
                        key={estado}
                        type="button"
                        aria-pressed={activo}
                        className={`chip chip--boton ${tonoEstadoCarga(estado)}${activo ? ' chip--activo' : ''}`}
                        onClick={() => alternarEstado(estado)}
                      >
                        {estado} ({cuantos})
                        {activo && <i className="fa-solid fa-xmark" aria-hidden="true" />}
                      </button>
                    )
                  })}
                  {estados.length > 0 && (
                    <button
                      type="button"
                      className="btn btn--texto btn--chico"
                      onClick={() => setEstados([])}
                    >
                      Quitar filtros
                    </button>
                  )}
                </div>

                <span className="filtros-nota filtros-nota--sola">
                  <i className="fa-solid fa-rotate" aria-hidden="true" />
                  {visibles.length} de {despachos.length} OP
                  <button
                    type="button"
                    className="btn btn--borde btn--chico"
                    onClick={() => void recargar()}
                  >
                    Actualizar
                  </button>
                </span>
              </div>

              <div className="lista">
                <div className="lista-head">
                  <span>Orden de pago</span>
                </div>

                <div className="lista-body">
                  {cargando && (
                    <div className="vacio">
                      <span className="spin spin--oscuro" aria-hidden="true" />
                      <span className="vacio-tit">Buscando OP…</span>
                    </div>
                  )}

                  {!cargando && visibles.length === 0 && !error && (
                    <div className="vacio">
                      <span className="vacio-ic">
                        <i className="fa-solid fa-inbox" aria-hidden="true" />
                      </span>
                      <span className="vacio-tit">No hay OP que coincidan</span>
                      <span className="vacio-det">
                        Probá quitando filtros o buscando por otro número.
                      </span>
                    </div>
                  )}

                  {!cargando &&
                    visibles.map((op) => {
                      const marcada = seleccion.includes(op.id)
                      const desplegada = abierta === op.id
                      return (
                        <div key={op.id} className={`opfila${marcada ? ' opfila--sel' : ''}`}>
                          <div className="opfila-head">
                            <button
                              type="button"
                              aria-pressed={marcada}
                              className="opfila-marca"
                              onClick={() => alternar(op)}
                            >
                              <span className={`trow-check${marcada ? ' trow-check--sel' : ''}`}>
                                {marcada && <i className="fa-solid fa-check" aria-hidden="true" />}
                              </span>
                              <span className="opfila-nom">{op.nombre}</span>
                            </button>

                            <span className="opfila-chips">
                              <EtiquetasOP op={op} conEta />
                              {(() => {
                                const a = armado(op.id)
                                if (!a) return null
                                if (a.total === 0) {
                                  return <span className="chip chip--gris">Sin tractores</span>
                                }
                                return a.listo ? (
                                  <span
                                    className="chip chip--verde"
                                    title="Todos los tractores tienen contenedor"
                                  >
                                    <i className="fa-solid fa-boxes-packing" aria-hidden="true" />{' '}
                                    Contenedores armados
                                  </span>
                                ) : (
                                  <span
                                    className="chip chip--rojo"
                                    title="Tractores sin contenedor"
                                  >
                                    <i className="fa-solid fa-boxes-packing" aria-hidden="true" />{' '}
                                    Faltan armar ({a.faltan} de {a.total})
                                  </span>
                                )
                              })()}
                            </span>

                            <button
                              type="button"
                              className="btn btn--texto btn--chico opfila-ver"
                              aria-expanded={desplegada}
                              onClick={() => setAbierta(desplegada ? null : op.id)}
                            >
                              <i
                                className={`fa-solid fa-chevron-${desplegada ? 'up' : 'down'}`}
                                aria-hidden="true"
                              />{' '}
                              {desplegada ? 'Ocultar' : 'Ver datos'}
                            </button>
                          </div>

                          {desplegada && (
                            <div className="opfila-cuerpo">
                              <FichaOP op={op} />
                            </div>
                          )}
                        </div>
                      )
                    })}
                </div>
              </div>
            </>
          )}

          {/* ---------------- Paso 2 · Qué hacer ---------------- */}
          {etapa === 'modo' && (
            <>
              <div className="sec-head">
                <span className="sec-num">2</span>
                <span className="sec-txt">
                  <span className="sec-tit">¿Qué vas a hacer con esta OP?</span>
                  <span className="sec-det">
                    Actualizar los datos del viaje y subir comprobantes, o armar los contenedores
                    diciendo qué tractor va en cada uno.
                  </span>
                </span>
              </div>

              {cargandoOp && (
                <div className="vacio">
                  <span className="spin spin--oscuro" aria-hidden="true" />
                  <span className="vacio-tit">Leyendo los tractores de la OP…</span>
                </div>
              )}

              {!cargandoOp && (
                <div className="decision decision--grande">
                  <button
                    type="button"
                    className="opcion opcion--confirmar"
                    onClick={() => {
                      setModo('datos')
                      setEtapa('edicion')
                    }}
                  >
                    <span className="opcion-ic">
                      <i className="fa-solid fa-pen-to-square" aria-hidden="true" />
                    </span>
                    <span className="opcion-txt">
                      <span className="opcion-tit">Actualizar datos</span>
                      <span className="opcion-det">
                        Estado de carga, ETA, buque, documentación y comprobantes
                      </span>
                      {/* El requisito de la OTRA tarjeta, dicho acá: el estado de carga se edita
                          en esta pantalla, así que es acá donde hay que enterarse de que
                          ese estado necesita los contenedores hechos. */}
                      {pendientesDeContenedor > 0 ? (
                        <span className="opcion-req opcion-req--aviso">
                          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                          Para poner "{PROXIMA_A_ARRIBAR}" hay que armar los contenedores antes
                        </span>
                      ) : (
                        <span className="opcion-req opcion-req--ok">
                          <i className="fa-solid fa-circle-check" aria-hidden="true" />
                          Contenedores listos: ya puede pasar a "{PROXIMA_A_ARRIBAR}"
                        </span>
                      )}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={!puedeArmar}
                    className="opcion opcion--proponer"
                    onClick={() => {
                      setModo('contenedores')
                      setEtapa('contenedores')
                    }}
                  >
                    <span className="opcion-ic">
                      <i className="fa-solid fa-boxes-packing" aria-hidden="true" />
                    </span>
                    <span className="opcion-txt">
                      <span className="opcion-tit">Armar contenedores</span>
                      <span className="opcion-det">
                        Decir qué tractor viaja en cada contenedor
                        {elegidas.length === 1 && opDeContenedores?.nroOp.trim()
                          ? `: ${sinContenedor(opDeContenedores.id)} de ${
                              (tractores[opDeContenedores.id] ?? []).length
                            } sin ubicar`
                          : ''}
                      </span>
                      {elegidas.length !== 1 ? (
                        <span className="opcion-req opcion-req--falta">
                          <i className="fa-solid fa-lock" aria-hidden="true" />
                          Se arman de a una OP por vez: elegí una sola
                        </span>
                      ) : faltaNroOp ? (
                        <span className="opcion-req opcion-req--falta">
                          <i className="fa-solid fa-lock" aria-hidden="true" />
                          Requiere el N° Op Despachante cargado en la OP
                        </span>
                      ) : sinContenedor(opDeContenedores.id) === 0 ? (
                        <span className="opcion-req opcion-req--ok">
                          <i className="fa-solid fa-circle-check" aria-hidden="true" />
                          Todos los tractores ya tienen contenedor
                        </span>
                      ) : (
                        <span className="opcion-req opcion-req--aviso">
                          <i className="fa-solid fa-arrow-right" aria-hidden="true" />
                          Hacelo antes de pasar la OP a "{PROXIMA_A_ARRIBAR}"
                        </span>
                      )}
                    </span>
                  </button>
                </div>
              )}

              {!cargandoOp && faltaNroOp && (
                <div className="aviso aviso--alerta" style={{ marginTop: 14 }}>
                  <i className="fa-solid fa-hashtag" aria-hidden="true" />
                  <span>
                    Esta OP todavía no tiene <b>N° Op Despachante</b>. Cargáselo desde{' '}
                    <b>Actualizar datos</b> y después vas a poder armarle los contenedores.
                  </span>
                </div>
              )}
            </>
          )}

          {/* ---------------- Paso 3 · Actualización de datos ---------------- */}
          {etapa === 'edicion' && (
            <>
              <div className="sec-head">
                <span className="sec-num">3</span>
                <span className="sec-txt">
                  <span className="sec-tit">Actualización de datos de cada OP</span>
                  <span className="sec-det">
                    Cada campo viene con lo que hay hoy en monday. Lo que no toques queda como está:
                    sólo se guarda lo que cambies.
                  </span>
                </span>
              </div>

              {sinNada.length > 0 && (
                <div className="aviso aviso--alerta">
                  <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                  <span>
                    <b>
                      {sinNada.length === 1
                        ? 'Hay 1 OP sin editar.'
                        : `Hay ${sinNada.length} OP sin editar.`}
                    </b>{' '}
                    Actualizales algún dato o quitalas de la selección para poder continuar:
                    <span className="aviso-chips">
                      {sinNada.map((op) => (
                        <button
                          key={op.id}
                          type="button"
                          className="chip chip--boton chip--ambar"
                          onClick={() => quitar(op.id)}
                        >
                          {op.nombre} <i className="fa-solid fa-xmark" aria-hidden="true" />
                        </button>
                      ))}
                    </span>
                  </span>
                </div>
              )}

              <div className="op-editores">
                {elegidas.map((op) => (
                  <EditorOP
                    key={op.id}
                    op={op}
                    edicion={ediciones[op.id] ?? valoresActuales(op)}
                    cambios={cambiosPorOp.get(op.id) ?? []}
                    onCambiar={(edicion) => setEdiciones((a) => ({ ...a, [op.id]: edicion }))}
                    onDeshacer={() => setEdiciones((a) => ({ ...a, [op.id]: valoresActuales(op) }))}
                    onQuitar={() => quitar(op.id)}
                    archivos={archivosDe(op.id)}
                    onArchivo={(campo, lista) =>
                      setArchivos((a) => ({
                        ...a,
                        [op.id]: { ...archivosDe(op.id), [campo]: lista },
                      }))
                    }
                    sinContenedor={sinContenedor(op.id)}
                    onArmarContenedores={() => {
                      setSeleccion([op.id])
                      setModo('contenedores')
                      setEtapa('contenedores')
                    }}
                  />
                ))}
              </div>
            </>
          )}

          {/* ---------------- Paso 4 · Resumen ---------------- */}
          {etapa === 'resumen' && (
            <>
              <div className="sec-head">
                <span className="sec-num">4</span>
                <span className="sec-txt">
                  <span className="sec-tit">Resumen de los cambios</span>
                  <span className="sec-det">
                    Esto es lo que se va a escribir en monday. Lo que no aparece acá queda tal cual
                    está.
                  </span>
                </span>
              </div>

              {sinNroDespacho.length > 0 && (
                <div className="aviso aviso--error">
                  <i className="fa-solid fa-file-circle-exclamation" aria-hidden="true" />
                  <span>
                    <b>
                      {sinNroDespacho.length === 1
                        ? 'Hay 1 OP que pasa a "Nacionalizado" sin N° Despacho Importación.'
                        : `Hay ${sinNroDespacho.length} OP que pasan a "Nacionalizado" sin N° Despacho Importación.`}
                    </b>{' '}
                    Es el número del trámite ante la aduana, y sin él ese estado no se puede
                    respaldar con nada.
                    <ul style={{ margin: '6px 0 0 18px' }}>
                      {sinNroDespacho.map((op) => (
                        <li key={op.id}>{op.nombre}</li>
                      ))}
                    </ul>
                  </span>
                </div>
              )}

              {bloqueadas.length > 0 && (
                <div className="aviso aviso--error">
                  <i className="fa-solid fa-boxes-packing" aria-hidden="true" />
                  <span>
                    <b>
                      {bloqueadas.length === 1
                        ? 'Hay 1 OP que pasa a "Próxima a Arribar" sin contenedores armados.'
                        : `Hay ${bloqueadas.length} OP que pasan a "Próxima a Arribar" sin contenedores armados.`}
                    </b>{' '}
                    Armalos primero: el aviso a BERGER lleva los links de los contenedores para que
                    carguen transportista y ubicación de entrega.
                    <span className="aviso-chips">
                      {bloqueadas.map((op) => (
                        <span key={op.id} className="chip chip--rojo">
                          {op.nombre} · faltan {sinContenedor(op.id)}
                        </span>
                      ))}
                    </span>
                  </span>
                </div>
              )}

              <div className="op-editores">
                {elegidas.map((op) => {
                  const cambios = cambiosPorOp.get(op.id) ?? []
                  const nuevos = Object.entries(archivosDe(op.id)).flatMap(([campo, lista]) =>
                    (lista as File[]).map((archivo) => ({ campo, archivo })),
                  )
                  const entraAProxima =
                    (ediciones[op.id] ?? valoresActuales(op)).estadoCarga === PROXIMA_A_ARRIBAR &&
                    op.estadoCarga !== PROXIMA_A_ARRIBAR
                  return (
                    <div key={op.id} className="card card--flush">
                      <div className="ctitle op-editor-head">
                        <span className="op-editor-nom">
                          <i className="fa-solid fa-file-lines" aria-hidden="true" /> {op.nombre}
                        </span>
                        <span className="op-editor-chips">
                          <EtiquetasOP op={op} />
                          <span className="chip chip--verde">
                            {cambios.length + nuevos.length} cambio
                            {cambios.length + nuevos.length === 1 ? '' : 's'}
                          </span>
                        </span>
                      </div>
                      <ul className="cambios">
                        {cambios.map((c) => (
                          <li key={c.campo} className="cambio">
                            <span className="cambio-campo">{c.rotulo}</span>
                            <span className="cambio-antes">{c.antes}</span>
                            <i className="fa-solid fa-arrow-right-long" aria-hidden="true" />
                            <span className="cambio-despues">{c.despues}</span>
                          </li>
                        ))}
                        {nuevos.map(({ campo, archivo }) => (
                          <li key={`${campo}-${archivo.name}`} className="cambio">
                            <span className="cambio-campo">
                              {ROTULO_ARCHIVO[COLUMNA_DE_ARCHIVO[campo as keyof ArchivosDespacho]]}
                            </span>
                            <span className="cambio-despues">
                              <i className="fa-solid fa-paperclip" aria-hidden="true" />{' '}
                              {archivo.name}
                            </span>
                          </li>
                        ))}
                        {entraAProxima && (
                          <li className="cambio">
                            <span className="cambio-campo">Aviso a BERGER</span>
                            <span className="cambio-despues">
                              <i className="fa-solid fa-bell" aria-hidden="true" /> se avisa a Sofía
                              y Micaela con {(contenedores[op.id] ?? []).length} contenedor
                              {(contenedores[op.id] ?? []).length === 1 ? '' : 'es'}
                            </span>
                          </li>
                        )}
                      </ul>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <footer className="pie">
        <div className="pie-info">
          <span className="font-b">
            {elegidas.length} OP seleccionada{elegidas.length === 1 ? '' : 's'}
          </span>
          <span className="xs">
            {etapa !== 'seleccion' && sinNroDespacho.length > 0 ? (
              <span className="pie-traba">
                <i className="fa-solid fa-lock" aria-hidden="true" /> Falta el N° Despacho
                Importación para nacionalizar
              </span>
            ) : etapa !== 'seleccion' && bloqueadas.length > 0 ? (
              <span className="pie-traba">
                <i className="fa-solid fa-lock" aria-hidden="true" /> Faltan armar los contenedores
                para pasar a "{PROXIMA_A_ARRIBAR}"
              </span>
            ) : totalCambios === 0 ? (
              'Todavía no hay cambios cargados'
            ) : (
              `${totalCambios} campo${totalCambios === 1 ? '' : 's'} por actualizar`
            )}
          </span>
        </div>

        <div className="pie-acciones">
          {etapa !== 'seleccion' && (
            <button
              type="button"
              className="btn btn--texto"
              disabled={enviando}
              onClick={() =>
                setEtapa(
                  etapa === 'resumen' ? 'edicion' : etapa === 'edicion' ? 'modo' : 'seleccion',
                )
              }
            >
              <i className="fa-solid fa-arrow-left" aria-hidden="true" /> Volver
            </button>
          )}

          {etapa === 'seleccion' && (
            <button
              type="button"
              className="btn btn--primario"
              disabled={elegidas.length === 0}
              onClick={irAModo}
            >
              Continuar <i className="fa-solid fa-arrow-right" aria-hidden="true" />
            </button>
          )}

          {etapa === 'edicion' && (
            <button
              type="button"
              className="btn btn--primario"
              /* No se puede seguir con una OP sin editar: o se le carga algo, o se saca. Guardarla
                 igual escribiría una actualización vacía y la dejaría "tocada" sin nada nuevo.
                 Tampoco con una que quiere nacionalizarse sin su N° de despacho, ni con los
                 contenedores sin armar: son las dos condiciones que el guardado rechaza, y
                 dejarlas pasar acá es hacerle mirar un resumen que no va a poder aplicar. */
              disabled={
                elegidas.length === 0 ||
                sinNada.length > 0 ||
                sinNroDespacho.length > 0 ||
                bloqueadas.length > 0
              }
              onClick={() => setEtapa('resumen')}
            >
              Ver resumen <i className="fa-solid fa-arrow-right" aria-hidden="true" />
            </button>
          )}

          {etapa === 'resumen' && (
            <button
              type="button"
              className="btn btn--marca"
              disabled={
                enviando || totalCambios === 0 || bloqueadas.length > 0 || sinNroDespacho.length > 0
              }
              onClick={() => void guardar()}
            >
              {enviando ? (
                <>
                  <span className="spin" aria-hidden="true" /> Guardando en monday…
                </>
              ) : (
                <>
                  <i className="fa-solid fa-cloud-arrow-up" aria-hidden="true" /> Guardar cambios
                </>
              )}
            </button>
          )}
        </div>
      </footer>
    </>
  )
}
