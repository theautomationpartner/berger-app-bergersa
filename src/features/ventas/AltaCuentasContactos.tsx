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
import {
  armarWhatsapp,
  PAIS_POR_DEFECTO,
  PAISES,
  paisPorCodigo,
  prefijoDe,
  problemaDelTelefono,
} from '@/lib/telefono'
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

const mensaje = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** Los dos trabajos de la pantalla. */
type Trabajo = 'cuenta' | 'contacto'

const CONTACTO_VACIO = {
  nombres: '',
  apellidos: '',
  categorias: [] as string[],
  email: '',
  paisCodigo: PAIS_POR_DEFECTO,
  area: '',
  abonado: '',
  comentarios: '',
}

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
  const [contacto, setContacto] = useState(CONTACTO_VACIO)
  /** La cuenta a la que se le cuelga el contacto. */
  const [cuentaElegida, setCuentaElegida] = useState('')

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
    contactoIds: [],
  }

  const faltanCuenta = [
    ...faltaParaLaCuenta(datosDeCuenta),
    ...(problemaCuit ? ['un CUIT válido'] : []),
  ]

  /* ---------------- el contacto ---------------- */

  const whatsapp = armarWhatsapp(contacto.paisCodigo, contacto.area, contacto.abonado)
  const problemaTel = problemaDelTelefono(contacto.paisCodigo, contacto.area, contacto.abonado)

  const datosDeContacto = {
    nombres: contacto.nombres,
    apellidos: contacto.apellidos,
    categorias: contacto.categorias,
    email: contacto.email,
    whatsapp,
    paisCodigo: contacto.paisCodigo,
    paisNombre: paisPorCodigo(contacto.paisCodigo)?.nombre ?? '',
    comentarios: contacto.comentarios,
    cuentaId: cuentaElegida,
  }

  /* La regla: dentro de UNA cuenta no puede haber dos contactos con el mismo mail o el mismo
     WhatsApp —sería la misma persona dos veces—. Entre cuentas distintas sí: el mismo señor puede
     comprar para dos empresas, y son dos contactos legítimos. */
  const choque = useMemo(
    () => contactoRepetido(contactos, cuentaElegida, contacto.email, whatsapp),
    [contactos, cuentaElegida, contacto.email, whatsapp],
  )

  const faltanContacto = [
    ...(cuentaElegida ? [] : ['la cuenta']),
    ...faltaParaElContacto(datosDeContacto),
    ...(problemaTel ? ['el teléfono completo'] : []),
  ]

  /** Los contactos que ya tiene la cuenta elegida. */
  const contactosDeLaCuenta = useMemo(
    () => contactos.filter((c) => cuentaElegida && c.cuentaIds.includes(cuentaElegida)),
    [contactos, cuentaElegida],
  )

  /* ---------------- envío ---------------- */

  const guardar = async () => {
    setEnviando(true)
    setErrorEnvio(null)
    setHecho(null)
    try {
      if (trabajo === 'cuenta') {
        const r = await crearCuenta(datosDeCuenta)
        setHecho(`${r.nombre} quedó creada.`)
        setCuenta(CUENTA_VACIA)
      } else {
        const r = await crearContacto(datosDeContacto)
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

        <div className="decision decision--grande">
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
              <span className="opcion-det">El cliente, con su CUIT y su condición fiscal.</span>
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
                    onChange={(e) => setCuenta({ ...cuenta, cuit: e.target.value })}
                    onBlur={() => setCuenta((c) => ({ ...c, cuit: formatearCuit(c.cuit) }))}
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

              <span className="campo-ayuda" style={{ marginTop: 10, display: 'block' }}>
                El teléfono y el mail van en cada contacto, no en la cuenta.
              </span>

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
                  onClick={() => setCuenta(CUENTA_VACIA)}
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

              <div className="datos datos--form" style={{ marginTop: 12 }}>
                <label className="campo">
                  <span className="campo-lbl">
                    Nombre/s <span className="campo-req">· obligatorio</span>
                  </span>
                  <input
                    className="input"
                    placeholder="Ej: Ricardo"
                    value={contacto.nombres}
                    onChange={(e) => setContacto({ ...contacto, nombres: e.target.value })}
                  />
                </label>

                <label className="campo">
                  <span className="campo-lbl">
                    Apellido/s <span className="campo-req">· obligatorio</span>
                  </span>
                  <input
                    className="input"
                    placeholder="Ej: Gutiérrez"
                    value={contacto.apellidos}
                    onChange={(e) => setContacto({ ...contacto, apellidos: e.target.value })}
                  />
                </label>

                <label className="campo">
                  <span className="campo-lbl">E-mail</span>
                  <input
                    className="input"
                    type="email"
                    placeholder="nombre@empresa.com"
                    value={contacto.email}
                    onChange={(e) => setContacto({ ...contacto, email: e.target.value })}
                  />
                  <span className="campo-ayuda">
                    Con el mail o el WhatsApp alcanza, pero alguno de los dos tiene que estar: son
                    los que identifican a la persona.
                  </span>
                </label>

                <div className="campo">
                  <span className="campo-lbl">Categoría</span>
                  <DesplegableMulti
                    valores={contacto.categorias}
                    opciones={opciones.categoriaContacto}
                    vacio="Elegir…"
                    bloqueado={cargando}
                    onCambiar={(v) => setContacto({ ...contacto, categorias: v })}
                  />
                  <span className="campo-ayuda">Puede tener más de una.</span>
                </div>
              </div>

              {/* El teléfono ocupa su propia fila: son cuatro casilleros, y metidos en la grilla
                  junto a los demás campos quedaban de dos centímetros. */}
              <div className="campo campo--suelto">
                <span className="campo-lbl">WhatsApp</span>
                <div className="tel-partes">
                  <div className="tel-pais">
                    <Desplegable
                      valor={contacto.paisCodigo}
                      opciones={PAISES.map((p) => ({
                        valor: p.codigo,
                        rotulo: p.nombre,
                        detalle: `+${p.prefijo}`,
                      }))}
                      buscable
                      onCambiar={(v) => setContacto({ ...contacto, paisCodigo: v })}
                    />
                  </div>
                  <span className="tel-prefijo">+{prefijoDe(contacto.paisCodigo)}</span>
                  <input
                    className="input tel-area"
                    placeholder="Característica"
                    inputMode="numeric"
                    value={contacto.area}
                    onChange={(e) => setContacto({ ...contacto, area: e.target.value })}
                  />
                  <input
                    className="input tel-numero"
                    placeholder="Número"
                    inputMode="numeric"
                    value={contacto.abonado}
                    onChange={(e) => setContacto({ ...contacto, abonado: e.target.value })}
                  />
                </div>
                <span className="campo-ayuda campo-ayuda--ejemplo">
                  La característica sin el 0 y el número sin el 15.
                </span>
                {whatsapp && (
                  <span className="campo-ayuda campo-ayuda--ok">
                    Se guarda como <b>{whatsapp}</b>.
                  </span>
                )}
                {problemaTel && (
                  <span className="campo-ayuda campo-ayuda--falta">{problemaTel}</span>
                )}
              </div>

              <label className="campo campo--suelto">
                <span className="campo-lbl">Comentarios</span>
                <textarea
                  className="input textarea"
                  rows={4}
                  placeholder="Opcional: de qué se habló, qué conviene recordar la próxima vez."
                  value={contacto.comentarios}
                  onChange={(e) => setContacto({ ...contacto, comentarios: e.target.value })}
                />
              </label>

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
