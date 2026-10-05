/**
 * VENTA · Alta de cuentas y contactos.
 *
 * Son dos trabajos y no uno, como en el resto de la app: dar de alta **una cuenta** o dar de alta
 * **un contacto** de una cuenta que ya existe. Mezclarlos en un formulario único obligaría a
 * mostrar catorce campos de los cuales la mitad nunca corresponden.
 *
 * Por qué existe esta pantalla en vez de cargar directo en el tablero: es el único lugar donde se
 * controla que el CUIT esté bien formado, que no haya dos cuentas con el mismo, y que dentro de
 * una cuenta no se repita un contacto. Una fila cargada a mano en monday no comprueba nada.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Desplegable } from '@/components/ui/Desplegable'
import { DesplegableMulti } from '@/components/ui/DesplegableMulti'
import { formatearCuit, problemaDelCuit, soloDigitos, tipoDePersonaSegunCuit } from '@/lib/cuit'
import { armarWhatsapp, PAIS_POR_DEFECTO, PAISES, paisPorCodigo } from '@/lib/telefono'
import { condicionFiscalDeArca, consultarArca } from '@/services/arca'
import {
  concesionariosDelCrm,
  contactoRepetido,
  contactosDelCrm,
  crearContacto,
  crearCuenta,
  cuentaConElMismoCuit,
  cuentasDelCrm,
  etiquetasDelCrm,
  faltaParaElContacto,
  faltaParaLaCuenta,
  nombreDeContacto,
  type Concesionario,
  type ContactoCrm,
  type CuentaCrm,
} from '@/services/monday/crm'
import { SinAcceso } from '@/services/monday/sdk'
import { CamposContacto, CONTACTO_VACIO, type DatosContacto } from './CamposContacto'

const mensaje = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** Los dos trabajos de la pantalla. */
type Trabajo = 'cuenta' | 'contacto'

const CUENTA_VACIA = {
  razonSocial: '',
  cuit: '',
  clasificacion: '',
  categoria: '',
  condicionFiscal: '',
  direccion: '',
  ciudad: '',
  provincia: '',
  paisCodigo: PAIS_POR_DEFECTO,
  descripcion: '',
  concesionarioIds: [] as string[],
  /** Contactos que ya existen y se enganchan a la cuenta nueva. */
  contactoIds: [] as string[],
}

export function AltaCuentasContactos() {
  const [trabajo, setTrabajo] = useState<Trabajo>('cuenta')

  const [cuentas, setCuentas] = useState<CuentaCrm[]>([])
  const [contactos, setContactos] = useState<ContactoCrm[]>([])
  const [concesionarios, setConcesionarios] = useState<Concesionario[]>([])
  const [opciones, setOpciones] = useState({
    tipoPersona: [] as string[],
    clasificacion: [] as string[],
    categoriaCuenta: [] as string[],
    condicionFiscal: [] as string[],
    categoriaContacto: [] as string[],
  })

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)

  const [cuenta, setCuenta] = useState(CUENTA_VACIA)
  const [contacto, setContacto] = useState<DatosContacto>(CONTACTO_VACIO)
  const [cuentaElegida, setCuentaElegida] = useState('')

  /* ARCA: lo que devolvió el padrón para el CUIT que se está cargando. */
  const [consultando, setConsultando] = useState(false)
  const [arca, setArca] = useState<{ ok: boolean; mensaje: string; viejo?: boolean } | null>(null)

  /**
   * Los contactos nuevos que se crean desde el alta de la cuenta.
   *
   * Quedan en memoria y se crean DESPUÉS de la cuenta, no al tocar "Agregar". Si se crearan en el
   * momento, abandonar el alta a mitad dejaría contactos sueltos en el tablero, colgando de una
   * cuenta que nunca existió, y nadie los iría a buscar.
   */
  const [nuevos, setNuevos] = useState<DatosContacto[]>([])
  const [armando, setArmando] = useState<DatosContacto | null>(null)

  const recargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [c, k, con, et] = await Promise.all([
        cuentasDelCrm(),
        contactosDelCrm(),
        concesionariosDelCrm(),
        etiquetasDelCrm(),
      ])
      setCuentas(c)
      setContactos(k)
      setConcesionarios(con)
      setOpciones(et)
    } catch (e) {
      setError(
        e instanceof SinAcceso
          ? 'la app tiene que abrirse desde monday para leer el CRM.'
          : mensaje(e),
      )
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void recargar()
  }, [recargar])

  /* ---------------- la cuenta ---------------- */

  const problemaCuit = cuenta.cuit.trim() ? problemaDelCuit(cuenta.cuit) : null
  const cuitLimpio = soloDigitos(cuenta.cuit)

  /* El CUIT es la llave: dos cuentas con el mismo son la misma empresa cargada dos veces, y el
     historial queda partido sin que nadie se entere hasta que falta la mitad. */
  const repetida = useMemo(
    () => (cuitLimpio.length === 11 ? cuentaConElMismoCuit(cuentas, cuitLimpio) : null),
    [cuentas, cuitLimpio],
  )

  /* El prefijo del CUIT ya dice si es una persona o una empresa, así que no se pregunta. */
  const tipoPersona = tipoDePersonaSegunCuit(cuenta.cuit) ?? ''

  /**
   * Trae del padrón lo que ARCA sabe.
   *
   * Se dispara sola al terminar de escribir un CUIT válido. Lo que vuelve se carga sólo en los
   * campos **vacíos**: si alguien ya escribió la razón social, no se le pisa lo que puso.
   */
  const traerDeArca = useCallback(
    async (cuit: string) => {
      const digitos = soloDigitos(cuit)
      if (digitos.length !== 11 || problemaDelCuit(digitos)) return
      setConsultando(true)
      setArca(null)
      try {
        const r = await consultarArca(digitos)
        if (!r.ok) {
          setArca({ ok: false, mensaje: r.mensaje })
          return
        }
        const d = r.datos
        setCuenta((c) => ({
          ...c,
          razonSocial: c.razonSocial.trim() || d.razonSocial,
          condicionFiscal:
            c.condicionFiscal || condicionFiscalDeArca(d.condicionIva, opciones.condicionFiscal),
          direccion: c.direccion.trim() || d.domicilio,
          ciudad: c.ciudad.trim() || d.localidad,
          provincia: c.provincia.trim() || d.provincia,
        }))
        setArca({
          ok: true,
          mensaje: d.razonSocial
            ? `ARCA dice que es ${d.razonSocial}${d.condicionIvaTexto ? ` · ${d.condicionIvaTexto}` : ''}.`
            : 'ARCA respondió, pero sin razón social.',
          viejo: d.datoViejo,
        })
      } finally {
        setConsultando(false)
      }
    },
    [opciones.condicionFiscal],
  )

  const datosDeCuenta = {
    razonSocial: cuenta.razonSocial,
    cuit: formatearCuit(cuenta.cuit),
    tipoPersona,
    clasificacion: cuenta.clasificacion,
    categorias: cuenta.categoria ? [cuenta.categoria] : [],
    condicionFiscal: cuenta.condicionFiscal,
    direccion: cuenta.direccion,
    ciudad: cuenta.ciudad,
    provincia: cuenta.provincia,
    paisCodigo: cuenta.paisCodigo,
    paisNombre: paisPorCodigo(cuenta.paisCodigo)?.nombre ?? '',
    descripcion: cuenta.descripcion,
    concesionarioIds: cuenta.concesionarioIds,
    contactoIds: cuenta.contactoIds,
  }

  const faltanCuenta = [
    ...faltaParaLaCuenta(datosDeCuenta),
    ...(problemaCuit ? ['un CUIT válido'] : []),
  ]

  /* ---------------- los contactos ---------------- */

  const datosDeContacto = (d: DatosContacto, cuentaId: string) => ({
    nombres: d.nombres,
    apellidos: d.apellidos,
    categorias: d.categorias,
    email: d.email,
    whatsapp: armarWhatsapp(d.paisCodigo, d.area, d.abonado),
    paisCodigo: d.paisCodigo,
    paisNombre: paisPorCodigo(d.paisCodigo)?.nombre ?? '',
    comentarios: d.comentarios,
    cuentaId,
  })

  /* La regla: dentro de UNA cuenta no puede haber dos contactos con el mismo mail o el mismo
     WhatsApp —sería la misma persona dos veces—. Entre cuentas distintas sí: el mismo señor puede
     comprar para dos empresas, y son dos contactos legítimos. */
  const choque = useMemo(
    () =>
      contactoRepetido(
        contactos,
        cuentaElegida,
        contacto.email,
        armarWhatsapp(contacto.paisCodigo, contacto.area, contacto.abonado),
      ),
    [contactos, cuentaElegida, contacto],
  )

  const faltanContacto = [
    ...(cuentaElegida ? [] : ['la cuenta']),
    ...faltaParaElContacto(datosDeContacto(contacto, cuentaElegida)),
  ]

  const contactosDeLaCuenta = useMemo(
    () => contactos.filter((c) => cuentaElegida && c.cuentaIds.includes(cuentaElegida)),
    [contactos, cuentaElegida],
  )

  /* ---------------- el contacto que se arma desde la cuenta ---------------- */

  const faltanDelArmado = armando ? faltaParaElContacto(datosDeContacto(armando, 'x')) : []

  /** La misma regla, pero contra una cuenta que todavía no existe: los que ya se agregaron. */
  const choqueEnLaCuenta = useMemo(() => {
    if (!armando) return null
    const mail = armando.email.trim().toLowerCase()
    const wa = armarWhatsapp(armando.paisCodigo, armando.area, armando.abonado).replace(/\D/g, '')
    const yaEsta = (c: DatosContacto) =>
      (mail && c.email.trim().toLowerCase() === mail) ||
      (wa && armarWhatsapp(c.paisCodigo, c.area, c.abonado).replace(/\D/g, '') === wa)
    if (nuevos.some(yaEsta)) return 'Ya agregaste a alguien con ese mail o ese WhatsApp.'
    const enganchado = contactos.find(
      (c) =>
        cuenta.contactoIds.includes(c.id) &&
        ((mail && c.email.trim().toLowerCase() === mail) ||
          (wa && c.whatsapp.replace(/\D/g, '') === wa)),
    )
    return enganchado ? `${enganchado.nombre} ya está enganchado a esta cuenta.` : null
  }, [armando, nuevos, contactos, cuenta.contactoIds])

  const agregarArmado = () => {
    if (!armando || faltanDelArmado.length > 0 || choqueEnLaCuenta) return
    setNuevos((n) => [...n, armando])
    setArmando(null)
  }

  /* ---------------- envío ---------------- */

  const guardar = async () => {
    setEnviando(true)
    setErrorEnvio(null)
    setHecho(null)
    try {
      if (trabajo === 'cuenta') {
        const r = await crearCuenta(datosDeCuenta)

        /* Los contactos nuevos se crean recién ahora, ya con la cuenta a la que pertenecen. Si
           alguno falla, la cuenta ya está: se dice cuál y se sigue, en vez de hacer creer que no
           se creó nada. */
        const fallados: string[] = []
        for (const n of nuevos) {
          try {
            await crearContacto(datosDeContacto(n, r.id))
          } catch {
            fallados.push(nombreDeContacto(n.nombres, n.apellidos))
          }
        }

        const cuantos = nuevos.length - fallados.length + cuenta.contactoIds.length
        setHecho(
          `${r.nombre} quedó creada${cuantos > 0 ? ` con ${cuantos} contacto${cuantos === 1 ? '' : 's'}` : ''}.` +
            (fallados.length > 0 ? ` No se pudieron crear: ${fallados.join(', ')}.` : ''),
        )
        setCuenta(CUENTA_VACIA)
        setNuevos([])
        setArmando(null)
        setArca(null)
      } else {
        const r = await crearContacto(datosDeContacto(contacto, cuentaElegida))
        const nombreCuenta = cuentas.find((c) => c.id === cuentaElegida)?.nombre ?? 'la cuenta'
        setHecho(`${r.nombre} quedó creado en ${nombreCuenta}.`)
        setContacto(CONTACTO_VACIO)
      }
      await recargar()
    } catch (e) {
      setErrorEnvio(mensaje(e))
    } finally {
      setEnviando(false)
    }
  }

  /* ---------------- pantalla ---------------- */

  const opcionesDeContacto = contactos.map((c) => ({
    valor: c.id,
    rotulo: c.nombre,
    detalle: [c.email, c.whatsapp].filter(Boolean).join(' · '),
  }))

  return (
    <div className="scroll">
      <div className="view">
        <div className="sec-head">
          <span className="sec-num">
            <i className="fa-solid fa-address-book" aria-hidden="true" />
          </span>
          <span className="sec-txt">
            <span className="sec-tit">Alta de cuentas y contactos</span>
            <span className="sec-det">
              Se cargan acá y no en los tableros: es el único lugar donde se controla que el CUIT
              esté bien y que no haya duplicados.
            </span>
          </span>
        </div>

        <div className="decision decision--grande decision--elige">
          <button
            type="button"
            aria-pressed={trabajo === 'cuenta'}
            className={`opcion opcion--confirmar${trabajo === 'cuenta' ? ' opcion--elegida' : ''}`}
            onClick={() => {
              setTrabajo('cuenta')
              setHecho(null)
              setErrorEnvio(null)
            }}
          >
            <span className="opcion-ic">
              <i className="fa-solid fa-building" aria-hidden="true" />
            </span>
            <span className="opcion-txt">
              <span className="opcion-tit">Una cuenta nueva</span>
              <span className="opcion-det">
                El cliente, con su CUIT y su condición fiscal. Se le pueden enganchar contactos acá
                mismo.
              </span>
            </span>
          </button>

          <button
            type="button"
            aria-pressed={trabajo === 'contacto'}
            className={`opcion opcion--proponer${trabajo === 'contacto' ? ' opcion--elegida' : ''}`}
            onClick={() => {
              setTrabajo('contacto')
              setHecho(null)
              setErrorEnvio(null)
            }}
          >
            <span className="opcion-ic">
              <i className="fa-solid fa-user-plus" aria-hidden="true" />
            </span>
            <span className="opcion-txt">
              <span className="opcion-tit">Un contacto de una cuenta que ya existe</span>
              <span className="opcion-det">La persona con la que se habla: mail y WhatsApp.</span>
              <span className="opcion-req opcion-req--aviso">
                <i className="fa-solid fa-address-book" aria-hidden="true" />
                {cuentas.length} cuenta{cuentas.length === 1 ? '' : 's'} cargada
                {cuentas.length === 1 ? '' : 's'}
              </span>
            </span>
          </button>
        </div>

        {error && (
          <div className="aviso aviso--error" style={{ marginTop: 14 }}>
            <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
            <span>No se pudo leer el CRM: {error}</span>
          </div>
        )}

        {hecho && (
          <div className="aviso aviso--ok" style={{ marginTop: 14 }}>
            <i className="fa-solid fa-circle-check" aria-hidden="true" />
            <span>{hecho}</span>
          </div>
        )}

        {errorEnvio && (
          <div className="aviso aviso--error" style={{ marginTop: 14 }}>
            <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
            <span>{errorEnvio}</span>
          </div>
        )}

        {/* ================= CUENTA ================= */}
        {trabajo === 'cuenta' && (
          <div className="card card--flush op-editor" style={{ marginTop: 14 }}>
            <div className="ctitle op-editor-head">
              <span className="op-editor-nom">
                <i className="fa-solid fa-id-card" aria-hidden="true" /> El cliente
              </span>
              <span className="op-editor-chips">
                <span className="chip chip--verde">Activa</span>
                {tipoPersona && <span className="chip chip--indigo">{tipoPersona}</span>}
              </span>
            </div>

            <div className="op-editor-cuerpo form-moderno">
              <div className="datos datos--form">
                <label className="campo">
                  <span className="campo-lbl">
                    CUIT / CUIL <span className="campo-req">· obligatorio</span>
                  </span>
                  <input
                    className="input"
                    placeholder="Ej: 20-12345678-6"
                    value={cuenta.cuit}
                    onChange={(e) => {
                      setCuenta({ ...cuenta, cuit: e.target.value })
                      setArca(null)
                    }}
                    onBlur={() => {
                      setCuenta((c) => ({ ...c, cuit: formatearCuit(c.cuit) }))
                      void traerDeArca(cuenta.cuit)
                    }}
                  />
                  {/* El motivo, y no un "CUIT inválido": decir qué está mal es lo que permite
                      corregirlo sin adivinar. */}
                  {problemaCuit && (
                    <span className="campo-ayuda campo-ayuda--falta">{problemaCuit}</span>
                  )}
                  {!problemaCuit && tipoPersona && (
                    <span className="campo-ayuda campo-ayuda--ok">
                      Es una <b>{tipoPersona}</b>, por el prefijo del CUIT.
                    </span>
                  )}
                  {consultando && (
                    <span className="campo-ayuda">
                      <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" /> Preguntándole
                      a ARCA…
                    </span>
                  )}
                  {arca && !consultando && (
                    <span
                      className={`campo-ayuda ${arca.ok ? 'campo-ayuda--ok' : 'campo-ayuda--aviso'}`}
                    >
                      {arca.mensaje}
                      {arca.viejo && ' (es el último dato que tenía: puede estar desactualizado)'}
                    </span>
                  )}
                </label>

                <label className="campo">
                  <span className="campo-lbl">
                    Razón social <span className="campo-req">· obligatorio</span>
                  </span>
                  <input
                    className="input"
                    placeholder="Ej: Agropecuaria La Esperanza S.A."
                    value={cuenta.razonSocial}
                    onChange={(e) => setCuenta({ ...cuenta, razonSocial: e.target.value })}
                  />
                </label>

                <div className="campo">
                  <span className="campo-lbl">
                    Condición fiscal <span className="campo-req">· obligatorio</span>
                  </span>
                  <Desplegable
                    valor={cuenta.condicionFiscal}
                    opciones={opciones.condicionFiscal}
                    vacio="Elegir…"
                    bloqueado={cargando}
                    onCambiar={(v) => setCuenta({ ...cuenta, condicionFiscal: v })}
                  />
                </div>

                <div className="campo">
                  <span className="campo-lbl">Clasificación</span>
                  <Desplegable
                    valor={cuenta.clasificacion}
                    opciones={opciones.clasificacion}
                    vacio="Elegir…"
                    bloqueado={cargando}
                    onCambiar={(v) => setCuenta({ ...cuenta, clasificacion: v })}
                  />
                  <span className="campo-ayuda">Habitual, ocasional, moroso o bloqueado.</span>
                </div>

                <label className="campo">
                  <span className="campo-lbl">Domicilio</span>
                  <input
                    className="input"
                    placeholder="Calle y número"
                    value={cuenta.direccion}
                    onChange={(e) => setCuenta({ ...cuenta, direccion: e.target.value })}
                  />
                </label>

                <label className="campo">
                  <span className="campo-lbl">Ciudad</span>
                  <input
                    className="input"
                    value={cuenta.ciudad}
                    onChange={(e) => setCuenta({ ...cuenta, ciudad: e.target.value })}
                  />
                </label>

                <label className="campo">
                  <span className="campo-lbl">Provincia</span>
                  <input
                    className="input"
                    value={cuenta.provincia}
                    onChange={(e) => setCuenta({ ...cuenta, provincia: e.target.value })}
                  />
                </label>

                <div className="campo">
                  <span className="campo-lbl">País</span>
                  <Desplegable
                    valor={cuenta.paisCodigo}
                    opciones={PAISES.map((p) => ({ valor: p.codigo, rotulo: p.nombre }))}
                    buscable
                    onCambiar={(v) => setCuenta({ ...cuenta, paisCodigo: v })}
                  />
                </div>

                <div className="campo">
                  <span className="campo-lbl">Categoría</span>
                  <Desplegable
                    valor={cuenta.categoria}
                    opciones={opciones.categoriaCuenta}
                    vacio="Elegir…"
                    bloqueado={cargando}
                    onCambiar={(v) => setCuenta({ ...cuenta, categoria: v })}
                  />
                </div>

                {concesionarios.length > 0 && (
                  <div className="campo">
                    <span className="campo-lbl">Concesionario asignado</span>
                    <DesplegableMulti
                      valores={cuenta.concesionarioIds}
                      opciones={concesionarios.map((c) => ({ valor: c.id, rotulo: c.nombre }))}
                      vacio="Ninguno"
                      buscable={concesionarios.length > 6}
                      bloqueado={cargando}
                      onCambiar={(ids) => setCuenta({ ...cuenta, concesionarioIds: ids })}
                    />
                    <span className="campo-ayuda">Puede ser más de uno.</span>
                  </div>
                )}
              </div>

              {/* ---- los contactos de la cuenta ---- */}
              <div className="sub-bloque">
                <span className="sub-bloque-tit">
                  <i className="fa-solid fa-users" aria-hidden="true" /> Contactos de la cuenta
                </span>

                <div className="campo">
                  <span className="campo-lbl">Enganchar contactos que ya existen</span>
                  <DesplegableMulti
                    valores={cuenta.contactoIds}
                    opciones={opcionesDeContacto}
                    vacio="Buscá por nombre, mail o WhatsApp"
                    buscable
                    soloAlBuscar
                    bloqueado={cargando}
                    onCambiar={(ids) => setCuenta({ ...cuenta, contactoIds: ids })}
                  />
                  <span className="campo-ayuda">
                    Una persona puede estar en más de una cuenta: si compra para dos empresas, es el
                    mismo contacto.
                  </span>
                </div>

                {nuevos.length > 0 && (
                  <ul className="pendientes">
                    {nuevos.map((n, i) => (
                      <li key={`${n.email}-${n.abonado}-${i}`} className="pendiente">
                        <i className="fa-solid fa-user-plus" aria-hidden="true" />
                        <span className="pendiente-txt">
                          <b>{nombreDeContacto(n.nombres, n.apellidos)}</b>
                          {n.email && <span> · {n.email}</span>}
                          {armarWhatsapp(n.paisCodigo, n.area, n.abonado) && (
                            <span> · {armarWhatsapp(n.paisCodigo, n.area, n.abonado)}</span>
                          )}
                        </span>
                        <button
                          type="button"
                          className="pendiente-quitar"
                          aria-label="Quitar"
                          onClick={() => setNuevos((v) => v.filter((_, j) => j !== i))}
                        >
                          <i className="fa-solid fa-xmark" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {armando === null ? (
                  <button
                    type="button"
                    className="btn btn--borde btn--chico"
                    onClick={() => setArmando(CONTACTO_VACIO)}
                  >
                    <i className="fa-solid fa-plus" aria-hidden="true" /> Crear un contacto nuevo
                  </button>
                ) : (
                  <div className="sub-form">
                    <span className="sub-form-tit">Un contacto nuevo para esta cuenta</span>

                    <CamposContacto
                      datos={armando}
                      onCambiar={setArmando}
                      categorias={opciones.categoriaContacto}
                      cargando={cargando}
                      conComentarios={false}
                    />

                    {choqueEnLaCuenta && (
                      <div className="aviso aviso--error" style={{ marginTop: 10 }}>
                        <i className="fa-solid fa-user-slash" aria-hidden="true" />
                        <span>{choqueEnLaCuenta}</span>
                      </div>
                    )}

                    {faltanDelArmado.length > 0 && (
                      <span className="campo-ayuda campo-ayuda--falta" style={{ marginTop: 8 }}>
                        <i className="fa-solid fa-lock" aria-hidden="true" /> Falta{' '}
                        {faltanDelArmado.join(', ')}.
                      </span>
                    )}

                    <div className="op-editor-acciones">
                      <button
                        type="button"
                        className="btn btn--texto btn--chico"
                        onClick={() => setArmando(null)}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="btn btn--marca btn--chico"
                        disabled={faltanDelArmado.length > 0 || Boolean(choqueEnLaCuenta)}
                        onClick={agregarArmado}
                      >
                        <i className="fa-solid fa-user-check" aria-hidden="true" /> Agregar a la
                        cuenta
                      </button>
                    </div>

                    <span className="campo-ayuda">
                      Se crea junto con la cuenta, no ahora: así no quedan contactos sueltos si el
                      alta se abandona a mitad.
                    </span>
                  </div>
                )}
              </div>

              {/* La descripción es texto largo y va sola, abajo y a todo el ancho: en la grilla
                  quedaba del tamaño de un campo de ciudad. */}
              <label className="campo campo--suelto">
                <span className="campo-lbl">Descripción</span>
                <textarea
                  className="input textarea"
                  rows={4}
                  placeholder="Opcional: qué hace la empresa, con quién se habla, lo que convenga recordar."
                  value={cuenta.descripcion}
                  onChange={(e) => setCuenta({ ...cuenta, descripcion: e.target.value })}
                />
              </label>

              {repetida && (
                <div className="aviso aviso--error" style={{ marginTop: 12 }}>
                  <i className="fa-solid fa-ban" aria-hidden="true" />
                  <span>
                    Ese CUIT ya es de <b>{repetida.nombre}</b>. Si querés sumarle una persona, usá
                    «Un contacto de una cuenta que ya existe».
                  </span>
                </div>
              )}

              {faltanCuenta.length > 0 && (
                <span className="campo-ayuda campo-ayuda--falta" style={{ marginTop: 8 }}>
                  <i className="fa-solid fa-lock" aria-hidden="true" /> Falta{' '}
                  {faltanCuenta.join(', ')}.
                </span>
              )}

              <div className="op-editor-acciones">
                <button
                  type="button"
                  className="btn btn--texto btn--chico"
                  disabled={enviando}
                  onClick={() => {
                    setCuenta(CUENTA_VACIA)
                    setNuevos([])
                    setArmando(null)
                    setArca(null)
                  }}
                >
                  <i className="fa-solid fa-eraser" aria-hidden="true" /> Vaciar el formulario
                </button>
                <button
                  type="button"
                  className="btn btn--primario"
                  disabled={enviando || cargando || faltanCuenta.length > 0 || Boolean(repetida)}
                  onClick={() => void guardar()}
                >
                  <i className="fa-solid fa-building-circle-check" aria-hidden="true" />{' '}
                  {enviando ? 'Creando…' : 'Crear la cuenta'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= CONTACTO ================= */}
        {trabajo === 'contacto' && (
          <div className="card card--flush op-editor" style={{ marginTop: 14 }}>
            <div className="ctitle op-editor-head">
              <span className="op-editor-nom">
                <i className="fa-solid fa-user-plus" aria-hidden="true" /> El contacto
              </span>
              <span className="op-editor-chips">
                <span className="chip chip--verde">Activo</span>
              </span>
            </div>

            <div className="op-editor-cuerpo form-moderno">
              <div className="campo">
                <span className="campo-lbl">
                  ¿De qué cuenta es? <span className="campo-req">· obligatorio</span>
                </span>
                <Desplegable
                  valor={cuentaElegida}
                  opciones={cuentas.map((c) => ({
                    valor: c.id,
                    rotulo: c.nombre,
                    detalle: [c.cuit, c.clasificacion].filter(Boolean).join(' · '),
                  }))}
                  vacio={cargando ? 'Cargando cuentas…' : 'Buscá la cuenta por nombre o CUIT'}
                  buscable
                  soloAlBuscar
                  bloqueado={cargando}
                  onCambiar={setCuentaElegida}
                />
                {cuentas.length === 0 && !cargando && (
                  <span className="campo-ayuda campo-ayuda--falta">
                    Todavía no hay cuentas cargadas. Creá primero la cuenta.
                  </span>
                )}
              </div>

              {/* Lo que la cuenta ya tiene, antes de tipear nada: es lo que evita cargar de nuevo
                  a alguien que ya está. */}
              {cuentaElegida && (
                <div className="aviso aviso--neutro" style={{ marginTop: 10 }}>
                  <i className="fa-solid fa-users" aria-hidden="true" />
                  <span>
                    {contactosDeLaCuenta.length === 0 ? (
                      <>Esta cuenta todavía no tiene contactos cargados.</>
                    ) : (
                      <>
                        Esta cuenta ya tiene {contactosDeLaCuenta.length} contacto
                        {contactosDeLaCuenta.length === 1 ? '' : 's'}:
                        <ul className="lista-compacta">
                          {contactosDeLaCuenta.map((c) => (
                            <li key={c.id}>
                              <b>{c.nombre}</b>
                              {c.email && <> · {c.email}</>}
                              {c.whatsapp && <> · {c.whatsapp}</>}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </span>
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <CamposContacto
                  datos={contacto}
                  onCambiar={setContacto}
                  categorias={opciones.categoriaContacto}
                  cargando={cargando}
                />
              </div>

              {choque && (
                <div className="aviso aviso--error" style={{ marginTop: 12 }}>
                  <i className="fa-solid fa-user-slash" aria-hidden="true" />
                  <span>
                    <b>{choque.contacto.nombre}</b> ya está en esta cuenta con {choque.por}. Si es
                    otra persona, revisá {choque.por}; si es la misma, ya está cargada.
                  </span>
                </div>
              )}

              {faltanContacto.length > 0 && (
                <span className="campo-ayuda campo-ayuda--falta" style={{ marginTop: 8 }}>
                  <i className="fa-solid fa-lock" aria-hidden="true" /> Falta{' '}
                  {faltanContacto.join(', ')}.
                </span>
              )}

              <div className="op-editor-acciones">
                <button
                  type="button"
                  className="btn btn--texto btn--chico"
                  disabled={enviando}
                  onClick={() => setContacto(CONTACTO_VACIO)}
                >
                  <i className="fa-solid fa-eraser" aria-hidden="true" /> Vaciar el formulario
                </button>
                <button
                  type="button"
                  className="btn btn--primario"
                  disabled={enviando || cargando || faltanContacto.length > 0 || Boolean(choque)}
                  onClick={() => void guardar()}
                >
                  <i className="fa-solid fa-user-check" aria-hidden="true" />{' '}
                  {enviando
                    ? 'Creando…'
                    : `Crear ${nombreDeContacto(contacto.nombres, contacto.apellidos) || 'el contacto'}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
