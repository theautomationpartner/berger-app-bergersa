/**
 * VENTA · Cuentas y contactos.
 *
 * Tres trabajos: dar de alta una cuenta, dar de alta un contacto de una cuenta que ya existe, y
 * corregir los datos de cualquiera de los dos. Separados y no en un formulario único porque cada
 * uno pide cosas distintas, y mezclarlos obligaría a mostrar catorce campos de los cuales la mitad
 * nunca corresponden.
 *
 * Por qué pasa por acá y no por el tablero: es el único lugar donde algo se controla —que el CUIT
 * esté bien formado, que no haya un contacto repetido dentro de una cuenta, y que si el CUIT ya
 * existe alguien lo sepa antes de crear la segunda—. Una fila cargada a mano en monday no
 * comprueba nada.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { SelectorBuscable, SelectorBuscableMulti } from '@/components/ui/SelectorBuscable'
import { formatearCuit, soloDigitos, tipoDePersonaSegunCuit } from '@/lib/cuit'
import { PAIS_POR_DEFECTO, PAISES, paisPorCodigo } from '@/lib/telefono'
import {
  actualizarContacto,
  actualizarCuenta,
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
  textoDeBusquedaDeContacto,
  textoDeBusquedaDeCuenta,
  type Concesionario,
  type ContactoCrm,
  type CuentaCrm,
} from '@/services/monday/crm'
import { SinAcceso } from '@/services/monday/sdk'
import { CamposContacto, CONTACTO_VACIO, whatsappDe, type DatosContacto } from './CamposContacto'
import { CamposCuenta, CUENTA_VACIA, type DatosCuenta } from './CamposCuenta'

const mensaje = (e: unknown): string => (e instanceof Error ? e.message : String(e))

type Trabajo = 'cuenta' | 'contacto' | 'editar'
type QueEditar = 'cuenta' | 'contacto'

/** El código ISO del país a partir de cómo lo muestra monday ("Argentina"). */
const codigoDePais = (nombre: string): string =>
  PAISES.find((p) => p.nombre.toLowerCase() === nombre.trim().toLowerCase())?.codigo ??
  PAIS_POR_DEFECTO

/** Una cuenta del tablero, pasada al formulario. */
const aFormularioCuenta = (c: CuentaCrm): DatosCuenta => ({
  razonSocial: c.nombre,
  cuit: c.cuit,
  clasificacion: c.clasificacion,
  /* La categoría es de a una en el formulario; en el tablero la columna admite varias, así que de
     una fila vieja con dos se toma la primera. */
  categoria: c.categoria.split(',')[0]?.trim() ?? '',
  condicionFiscal: c.condicionFiscal,
  direccion: c.direccion,
  ciudad: c.ciudad,
  provincia: c.provincia,
  paisCodigo: codigoDePais(c.pais),
  descripcion: c.descripcion,
  concesionarioIds: c.concesionarioIds,
  contactoIds: c.contactoIds,
})

/** Un contacto del tablero, pasado al formulario. */
const aFormularioContacto = (c: ContactoCrm): DatosContacto => ({
  nombres: c.nombres,
  apellidos: c.apellidos,
  categorias: c.categoria
    ? c.categoria
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    : [],
  email: c.email,
  paisCodigo: codigoDePais(c.pais),
  area: '',
  abonado: '',
  comentarios: c.comentarios,
  /* Editando, el número va entero: ver `DatosContacto.whatsappCompleto`. */
  whatsappCompleto: c.whatsapp,
})

export function CuentasYContactos() {
  const [trabajo, setTrabajo] = useState<Trabajo>('cuenta')
  const [queEditar, setQueEditar] = useState<QueEditar>('cuenta')

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

  const [cuenta, setCuenta] = useState<DatosCuenta>(CUENTA_VACIA)
  const [contacto, setContacto] = useState<DatosContacto>(CONTACTO_VACIO)
  const [cuentaElegida, setCuentaElegida] = useState('')

  /** Que sepa que está creando una segunda cuenta con un CUIT que ya existe. */
  const [duplicadoAceptado, setDuplicadoAceptado] = useState(false)

  /* ---- lo que se está editando ---- */
  const [editandoCuenta, setEditandoCuenta] = useState('')
  const [editandoContacto, setEditandoContacto] = useState('')
  const [formCuenta, setFormCuenta] = useState<DatosCuenta>(CUENTA_VACIA)
  const [formContacto, setFormContacto] = useState<DatosContacto>(CONTACTO_VACIO)
  const [cuentaDelContacto, setCuentaDelContacto] = useState('')

  /** Contactos nuevos que se crean desde el alta de una cuenta, y nacen con ella. */
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

  /* ---------------- el alta de una cuenta ---------------- */

  const cuitLimpio = soloDigitos(cuenta.cuit)

  /* Dos cuentas con el mismo CUIT suelen ser la misma empresa cargada dos veces, y el historial
     queda partido sin que nadie se entere hasta que falta la mitad. Pero a veces es a propósito
     —dos razones sociales del mismo titular—, así que no se prohíbe: se avisa y se pide que lo
     confirme. */
  const repetida = useMemo(
    () => (cuitLimpio.length === 11 ? cuentaConElMismoCuit(cuentas, cuitLimpio) : null),
    [cuentas, cuitLimpio],
  )

  useEffect(() => {
    setDuplicadoAceptado(false)
  }, [cuitLimpio])

  const contactosDe = (id: string) => contactos.filter((c) => c.cuentaIds.includes(id))

  const paraMonday = (d: DatosCuenta) => ({
    razonSocial: d.razonSocial,
    cuit: formatearCuit(d.cuit),
    tipoPersona: tipoDePersonaSegunCuit(d.cuit) ?? '',
    clasificacion: d.clasificacion,
    categorias: d.categoria ? [d.categoria] : [],
    condicionFiscal: d.condicionFiscal,
    direccion: d.direccion,
    ciudad: d.ciudad,
    provincia: d.provincia,
    paisCodigo: d.paisCodigo,
    paisNombre: paisPorCodigo(d.paisCodigo)?.nombre ?? '',
    descripcion: d.descripcion,
    concesionarioIds: d.concesionarioIds,
    contactoIds: d.contactoIds,
  })

  const faltanCuenta = faltaParaLaCuenta(paraMonday(cuenta))

  /* ---------------- los contactos ---------------- */

  const datosDeContacto = (d: DatosContacto, cuentaId: string) => ({
    nombres: d.nombres,
    apellidos: d.apellidos,
    categorias: d.categorias,
    email: d.email,
    whatsapp: whatsappDe(d),
    paisCodigo: d.paisCodigo,
    paisNombre: paisPorCodigo(d.paisCodigo)?.nombre ?? '',
    comentarios: d.comentarios,
    cuentaId,
  })

  const choque = useMemo(
    () => contactoRepetido(contactos, cuentaElegida, contacto.email, whatsappDe(contacto)),
    [contactos, cuentaElegida, contacto],
  )

  const faltanContacto = [
    ...(cuentaElegida ? [] : ['la cuenta']),
    ...faltaParaElContacto(datosDeContacto(contacto, cuentaElegida)),
  ]

  const faltanDelArmado = armando ? faltaParaElContacto(datosDeContacto(armando, 'x')) : []

  const choqueEnLaCuenta = useMemo(() => {
    if (!armando) return null
    const mail = armando.email.trim().toLowerCase()
    const wa = whatsappDe(armando).replace(/\D/g, '')
    const yaEsta = (c: DatosContacto) =>
      (mail && c.email.trim().toLowerCase() === mail) ||
      (wa && whatsappDe(c).replace(/\D/g, '') === wa)
    if (nuevos.some(yaEsta)) return 'Ya agregaste a alguien con ese mail o ese WhatsApp.'
    const enganchado = contactos.find(
      (c) =>
        cuenta.contactoIds.includes(c.id) &&
        ((mail && c.email.trim().toLowerCase() === mail) ||
          (wa && c.whatsapp.replace(/\D/g, '') === wa)),
    )
    return enganchado ? `${enganchado.nombre} ya está enganchado a esta cuenta.` : null
  }, [armando, nuevos, contactos, cuenta.contactoIds])

  /* ---------------- la edición ---------------- */

  const abrirCuenta = (id: string) => {
    setEditandoCuenta(id)
    setErrorEnvio(null)
    setHecho(null)
    const c = cuentas.find((x) => x.id === id)
    if (c) setFormCuenta(aFormularioCuenta(c))
  }

  const abrirContacto = (id: string) => {
    setEditandoContacto(id)
    setErrorEnvio(null)
    setHecho(null)
    const c = contactos.find((x) => x.id === id)
    if (c) {
      setFormContacto(aFormularioContacto(c))
      setCuentaDelContacto(c.cuentaIds[0] ?? '')
    }
  }

  const faltanEnEdicionCuenta = editandoCuenta ? faltaParaLaCuenta(paraMonday(formCuenta)) : []
  const faltanEnEdicionContacto = editandoContacto
    ? faltaParaElContacto(datosDeContacto(formContacto, cuentaDelContacto))
    : []

  /* ---------------- guardar ---------------- */

  const guardar = async () => {
    setEnviando(true)
    setErrorEnvio(null)
    setHecho(null)
    try {
      if (trabajo === 'cuenta') {
        const r = await crearCuenta(paraMonday(cuenta))
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
        setDuplicadoAceptado(false)
      } else if (trabajo === 'contacto') {
        const r = await crearContacto(datosDeContacto(contacto, cuentaElegida))
        const nombreCuenta = cuentas.find((c) => c.id === cuentaElegida)?.nombre ?? 'la cuenta'
        setHecho(`${r.nombre} quedó creado en ${nombreCuenta}.`)
        setContacto(CONTACTO_VACIO)
      } else if (queEditar === 'cuenta' && editandoCuenta) {
        await actualizarCuenta(editandoCuenta, paraMonday(formCuenta))
        setHecho(`Los cambios de ${formCuenta.razonSocial.trim()} quedaron guardados.`)
      } else if (editandoContacto) {
        await actualizarContacto(editandoContacto, datosDeContacto(formContacto, cuentaDelContacto))
        setHecho(
          `Los cambios de ${nombreDeContacto(formContacto.nombres, formContacto.apellidos)} quedaron guardados.`,
        )
      }
      await recargar()
    } catch (e) {
      setErrorEnvio(mensaje(e))
    } finally {
      setEnviando(false)
    }
  }

  /* ---------------- pantalla ---------------- */

  /* Lo que se ve y por lo que se busca no son lo mismo: el CUIT se muestra con guiones y se
     escribe sin ellos, y a un contacto se lo busca por el apellido suelto. */
  const opcionesDeContacto = contactos.map((c) => ({
    valor: c.id,
    rotulo: c.nombre,
    detalle: [c.email, c.whatsapp].filter(Boolean).join(' · '),
    busqueda: textoDeBusquedaDeContacto(c),
  }))

  const opcionesDeCuenta = cuentas.map((c) => ({
    valor: c.id,
    rotulo: c.nombre,
    detalle: [c.cuit && `CUIT ${c.cuit}`, c.clasificacion].filter(Boolean).join(' · '),
    busqueda: textoDeBusquedaDeCuenta(c),
  }))

  const tarjeta = (
    id: Trabajo,
    clase: string,
    icono: string,
    titulo: string,
    detalle: string,
    pie?: React.ReactNode,
  ) => (
    <button
      type="button"
      aria-pressed={trabajo === id}
      className={`opcion ${clase}${trabajo === id ? ' opcion--elegida' : ''}`}
      onClick={() => {
        setTrabajo(id)
        setHecho(null)
        setErrorEnvio(null)
      }}
    >
      <span className="opcion-ic">
        <i className={icono} aria-hidden="true" />
      </span>
      <span className="opcion-txt">
        <span className="opcion-tit">{titulo}</span>
        <span className="opcion-det">{detalle}</span>
        {pie}
      </span>
    </button>
  )

  return (
    <div className="scroll">
      <div className="view">
        <div className="sec-head">
          <span className="sec-num">
            <i className="fa-solid fa-address-book" aria-hidden="true" />
          </span>
          <span className="sec-txt">
            <span className="sec-tit">Cuentas y contactos</span>
            <span className="sec-det">
              Se cargan y se corrigen acá, no en los tableros: es el único lugar donde se controla
              que el CUIT esté bien y que no haya duplicados sin que nadie se entere.
            </span>
          </span>
        </div>

        <div className="decision decision--grande decision--elige">
          {tarjeta(
            'cuenta',
            'opcion--confirmar',
            'fa-solid fa-building',
            'Una cuenta nueva',
            'El cliente, con su CUIT y su condición fiscal. Se le pueden enganchar contactos acá mismo.',
          )}
          {tarjeta(
            'contacto',
            'opcion--proponer',
            'fa-solid fa-user-plus',
            'Un contacto de una cuenta que ya existe',
            'La persona con la que se habla: mail y WhatsApp.',
            <span className="opcion-req opcion-req--aviso">
              <i className="fa-solid fa-address-book" aria-hidden="true" />
              {cuentas.length} cuenta{cuentas.length === 1 ? '' : 's'} cargada
              {cuentas.length === 1 ? '' : 's'}
            </span>,
          )}
          {tarjeta(
            'editar',
            'opcion--editar',
            'fa-solid fa-pen-to-square',
            'Corregir una cuenta o un contacto',
            'Buscar lo que ya está cargado y cambiarle los datos.',
          )}
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

        {/* ================= ALTA DE CUENTA ================= */}
        {trabajo === 'cuenta' && (
          <div className="card card--flush op-editor" style={{ marginTop: 14 }}>
            <div className="ctitle op-editor-head">
              <span className="op-editor-nom">
                <i className="fa-solid fa-id-card" aria-hidden="true" /> El cliente
              </span>
              <span className="op-editor-chips">
                <span className="chip chip--verde">Activa</span>
              </span>
            </div>

            <div className="op-editor-cuerpo form-moderno">
              <CamposCuenta
                datos={cuenta}
                onCambiar={setCuenta}
                opciones={opciones}
                concesionarios={concesionarios}
                cargando={cargando}
              />

              {/* Ese CUIT ya está. No se prohíbe —dos razones sociales del mismo titular es un caso
                  real— pero sí se muestra cuál es la que existe y se pide confirmarlo: crear la
                  segunda sin saberlo parte el historial en dos. */}
              {repetida && (
                <div className="duplicado">
                  <div className="duplicado-aviso">
                    <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                    <span>
                      <b>Ese CUIT ya está cargado.</b> Si seguís, vas a tener dos cuentas con el
                      mismo CUIT.
                    </span>
                  </div>

                  <div className="duplicado-ficha">
                    <span className="duplicado-ficha-tit">{repetida.nombre}</span>
                    <span className="duplicado-ficha-det">
                      CUIT {repetida.cuit}
                      {repetida.condicionFiscal && ` · ${repetida.condicionFiscal}`}
                      {repetida.clasificacion && ` · ${repetida.clasificacion}`}
                    </span>
                    <span className="duplicado-ficha-det">
                      {[repetida.direccion, repetida.ciudad, repetida.provincia]
                        .filter(Boolean)
                        .join(', ') || 'Sin domicilio cargado'}
                    </span>
                    <span className="duplicado-ficha-det">
                      {contactosDe(repetida.id).length === 0
                        ? 'Sin contactos'
                        : `${contactosDe(repetida.id).length} contacto${contactosDe(repetida.id).length === 1 ? '' : 's'}: ${contactosDe(
                            repetida.id,
                          )
                            .map((c) => c.nombre)
                            .join(', ')}`}
                    </span>
                  </div>

                  <div className="duplicado-acciones">
                    <button
                      type="button"
                      className="btn btn--borde btn--chico"
                      onClick={() => {
                        /* Se copia TODO lo de la que existe para corregir desde ahí: es más rápido
                           que volver a tipear ocho campos para cambiar uno. */
                        setCuenta({ ...aFormularioCuenta(repetida), contactoIds: [] })
                        setDuplicadoAceptado(true)
                      }}
                    >
                      <i className="fa-solid fa-copy" aria-hidden="true" /> Traer sus datos y
                      editarlos
                    </button>

                    <button
                      type="button"
                      className="interruptor interruptor--chico"
                      role="switch"
                      aria-checked={duplicadoAceptado}
                      onClick={() => setDuplicadoAceptado((v) => !v)}
                    >
                      <span
                        className={`interruptor-palanca${duplicadoAceptado ? ' interruptor-palanca--on' : ''}`}
                      >
                        <span className="interruptor-bolita" />
                      </span>
                      <span className="interruptor-txt">
                        <span className="interruptor-tit">Sí, crearla igual</span>
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* ---- los contactos de la cuenta ---- */}
              <div className="sub-bloque">
                <span className="sub-bloque-tit">
                  <i className="fa-solid fa-users" aria-hidden="true" /> Contactos de la cuenta
                </span>

                <div className="campo">
                  <span className="campo-lbl">Enganchar contactos que ya existen</span>
                  <SelectorBuscableMulti
                    valores={cuenta.contactoIds}
                    opciones={opcionesDeContacto}
                    vacio="Escribí un nombre, un mail o un WhatsApp"
                    queSon="contactos"
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
                          {whatsappDe(n) && <span> · {whatsappDe(n)}</span>}
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
                        onClick={() => {
                          setNuevos((n) => [...n, armando])
                          setArmando(null)
                        }}
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
                    setDuplicadoAceptado(false)
                  }}
                >
                  <i className="fa-solid fa-eraser" aria-hidden="true" /> Vaciar el formulario
                </button>
                <button
                  type="button"
                  className="btn btn--primario"
                  disabled={
                    enviando ||
                    cargando ||
                    faltanCuenta.length > 0 ||
                    (Boolean(repetida) && !duplicadoAceptado)
                  }
                  onClick={() => void guardar()}
                >
                  <i className="fa-solid fa-building-circle-check" aria-hidden="true" />{' '}
                  {enviando ? 'Creando…' : repetida ? 'Crear igual la cuenta' : 'Crear la cuenta'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= ALTA DE CONTACTO ================= */}
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
                <SelectorBuscable
                  valor={cuentaElegida}
                  opciones={opcionesDeCuenta}
                  vacio={cargando ? 'Cargando cuentas…' : 'Escribí el nombre o el CUIT'}
                  queSon="clientes"
                  bloqueado={cargando}
                  onCambiar={setCuentaElegida}
                />
              </div>

              {cuentaElegida && (
                <div className="aviso aviso--neutro" style={{ marginTop: 10 }}>
                  <i className="fa-solid fa-users" aria-hidden="true" />
                  <span>
                    {contactosDe(cuentaElegida).length === 0 ? (
                      <>Esta cuenta todavía no tiene contactos cargados.</>
                    ) : (
                      <>
                        Esta cuenta ya tiene {contactosDe(cuentaElegida).length} contacto
                        {contactosDe(cuentaElegida).length === 1 ? '' : 's'}:
                        <ul className="lista-compacta">
                          {contactosDe(cuentaElegida).map((c) => (
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

        {/* ================= CORREGIR ================= */}
        {trabajo === 'editar' && (
          <div className="card card--flush op-editor" style={{ marginTop: 14 }}>
            <div className="ctitle op-editor-head">
              <span className="op-editor-nom">
                <i className="fa-solid fa-pen-to-square" aria-hidden="true" /> Corregir datos
              </span>
            </div>

            <div className="op-editor-cuerpo form-moderno">
              <div className="opciones-chips" style={{ marginBottom: 14 }}>
                <button
                  type="button"
                  aria-pressed={queEditar === 'cuenta'}
                  className="chip--opcion"
                  onClick={() => {
                    setQueEditar('cuenta')
                    setHecho(null)
                  }}
                >
                  Una cuenta
                </button>
                <button
                  type="button"
                  aria-pressed={queEditar === 'contacto'}
                  className="chip--opcion chip--opcion-violeta"
                  onClick={() => {
                    setQueEditar('contacto')
                    setHecho(null)
                  }}
                >
                  Un contacto
                </button>
              </div>

              {queEditar === 'cuenta' ? (
                <>
                  <div className="campo">
                    <span className="campo-lbl">¿Qué cuenta querés corregir?</span>
                    <SelectorBuscable
                      valor={editandoCuenta}
                      opciones={opcionesDeCuenta}
                      vacio={cargando ? 'Cargando cuentas…' : 'Escribí la razón social o el CUIT'}
                      queSon="clientes"
                      bloqueado={cargando}
                      onCambiar={(v) => (v ? abrirCuenta(v) : setEditandoCuenta(''))}
                    />
                  </div>

                  {editandoCuenta && (
                    <>
                      <div style={{ marginTop: 14 }}>
                        <CamposCuenta
                          datos={formCuenta}
                          onCambiar={setFormCuenta}
                          opciones={opciones}
                          concesionarios={concesionarios}
                          cargando={cargando}
                          cuitBloqueado
                        />
                      </div>

                      <div className="sub-bloque">
                        <span className="sub-bloque-tit">
                          <i className="fa-solid fa-users" aria-hidden="true" /> Contactos de la
                          cuenta
                        </span>
                        <SelectorBuscableMulti
                          valores={formCuenta.contactoIds}
                          opciones={opcionesDeContacto}
                          vacio="Escribí un nombre, un mail o un WhatsApp"
                          queSon="contactos"
                          bloqueado={cargando}
                          onCambiar={(ids) => setFormCuenta({ ...formCuenta, contactoIds: ids })}
                        />
                      </div>

                      <label className="campo campo--suelto">
                        <span className="campo-lbl">Descripción</span>
                        <textarea
                          className="input textarea"
                          rows={4}
                          value={formCuenta.descripcion}
                          onChange={(e) =>
                            setFormCuenta({ ...formCuenta, descripcion: e.target.value })
                          }
                        />
                      </label>

                      {faltanEnEdicionCuenta.length > 0 && (
                        <span className="campo-ayuda campo-ayuda--falta" style={{ marginTop: 8 }}>
                          <i className="fa-solid fa-lock" aria-hidden="true" /> Falta{' '}
                          {faltanEnEdicionCuenta.join(', ')}.
                        </span>
                      )}

                      <div className="op-editor-acciones">
                        <button
                          type="button"
                          className="btn btn--texto btn--chico"
                          disabled={enviando}
                          onClick={() => setEditandoCuenta('')}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="btn btn--primario"
                          disabled={enviando || faltanEnEdicionCuenta.length > 0}
                          onClick={() => void guardar()}
                        >
                          <i className="fa-solid fa-floppy-disk" aria-hidden="true" />{' '}
                          {enviando ? 'Guardando…' : 'Guardar los cambios'}
                        </button>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="campo">
                    <span className="campo-lbl">¿Qué contacto querés corregir?</span>
                    <SelectorBuscable
                      valor={editandoContacto}
                      opciones={opcionesDeContacto}
                      vacio={
                        cargando
                          ? 'Cargando contactos…'
                          : 'Escribí el nombre, el mail o el WhatsApp'
                      }
                      queSon="contactos"
                      bloqueado={cargando}
                      onCambiar={(v) => (v ? abrirContacto(v) : setEditandoContacto(''))}
                    />
                  </div>

                  {editandoContacto && (
                    <>
                      <div className="campo" style={{ marginTop: 14 }}>
                        <span className="campo-lbl">Cuenta a la que pertenece</span>
                        <SelectorBuscable
                          valor={cuentaDelContacto}
                          opciones={opcionesDeCuenta}
                          vacio="Escribí el nombre o el CUIT"
                          queSon="clientes"
                          bloqueado={cargando}
                          onCambiar={setCuentaDelContacto}
                        />
                      </div>

                      <div style={{ marginTop: 14 }}>
                        <CamposContacto
                          datos={formContacto}
                          onCambiar={setFormContacto}
                          categorias={opciones.categoriaContacto}
                          cargando={cargando}
                        />
                      </div>

                      {faltanEnEdicionContacto.length > 0 && (
                        <span className="campo-ayuda campo-ayuda--falta" style={{ marginTop: 8 }}>
                          <i className="fa-solid fa-lock" aria-hidden="true" /> Falta{' '}
                          {faltanEnEdicionContacto.join(', ')}.
                        </span>
                      )}

                      <div className="op-editor-acciones">
                        <button
                          type="button"
                          className="btn btn--texto btn--chico"
                          disabled={enviando}
                          onClick={() => setEditandoContacto('')}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="btn btn--primario"
                          disabled={enviando || faltanEnEdicionContacto.length > 0}
                          onClick={() => void guardar()}
                        >
                          <i className="fa-solid fa-floppy-disk" aria-hidden="true" />{' '}
                          {enviando ? 'Guardando…' : 'Guardar los cambios'}
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
