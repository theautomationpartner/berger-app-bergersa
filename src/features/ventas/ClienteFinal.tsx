/**
 * El cliente final de una venta directa: buscarlo, y darlo de alta si no está.
 *
 * El concesionario no tiene la operación de Cuentas y contactos —el CRM entero no es suyo— pero sí
 * necesita poder cargar al cliente al que le está vendiendo. Mandarlo a pedirle el alta a BERGER
 * para después volver a empezar el pedido sería convertir una venta en un trámite.
 *
 * Por eso el alta de acá es la mínima: CUIT, razón social y condición frente al IVA, que es lo que
 * ARCA contesta y lo que hace falta para facturar. La clasificación, la categoría y el resto de la
 * ficha los completa BERGER después, desde el CRM, que es donde esa información tiene dueño.
 *
 * Se pueden cargar varios: un tractor a nombre de dos hermanos o de una sociedad y su titular es
 * algo que pasa seguido, y partir el pedido en dos por eso no tendría sentido.
 */
import { useState } from 'react'
import { Desplegable } from '@/components/ui/Desplegable'
import { SelectorBuscable } from '@/components/ui/SelectorBuscable'
import { formatearCuit, problemaDelCuit, soloDigitos, tipoDePersonaSegunCuit } from '@/lib/cuit'
import { condicionFiscalDeArca, consultarArca } from '@/services/arca'
import { crearCuenta, cuentaConElMismoCuit, type CuentaCrm } from '@/services/monday/crm'
import { FichaCuenta } from './FichaCuenta'

const mensaje = (e: unknown): string => (e instanceof Error ? e.message : String(e))

interface Props {
  /** Todas las cuentas del CRM, para buscar y para detectar el CUIT repetido. */
  cuentas: CuentaCrm[]
  /** Las etiquetas de la columna de condición fiscal, leídas de monday. */
  condicionesFiscales: string[]
  /** Los que ya están elegidos. */
  elegidos: { id: string; nombre: string }[]
  onCambiar: (clientes: { id: string; nombre: string }[]) => void
  /** La cuenta del concesionario, que no puede ser su propio cliente final. */
  excluirId: string
  cargando?: boolean
  /** Se avisa hacia afuera para que la pantalla sume la cuenta nueva a su lista. */
  onCuentaNueva: (cuenta: CuentaCrm) => void
}

export function ClienteFinal({
  cuentas,
  condicionesFiscales,
  elegidos,
  onCambiar,
  excluirId,
  cargando,
  onCuentaNueva,
}: Props) {
  const [creando, setCreando] = useState(false)
  const [cuit, setCuit] = useState('')
  const [razonSocial, setRazonSocial] = useState('')
  const [condicionFiscal, setCondicionFiscal] = useState('')
  const [consultando, setConsultando] = useState(false)
  const [arca, setArca] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const digitos = soloDigitos(cuit)
  const problema = cuit.trim() ? problemaDelCuit(cuit) : null
  /* El mismo CUIT ya cargado no se da de alta de nuevo: se elige el que existe. Dos cuentas con el
     mismo CUIT es un problema que después hay que resolver a mano y con facturas de por medio. */
  const repetida = digitos.length === 11 ? cuentaConElMismoCuit(cuentas, digitos) : null

  const limpiar = () => {
    setCuit('')
    setRazonSocial('')
    setCondicionFiscal('')
    setArca(null)
    setError(null)
  }

  const sumar = (c: { id: string; nombre: string }) => {
    if (elegidos.some((x) => x.id === c.id)) return
    onCambiar([...elegidos, { id: c.id, nombre: c.nombre }])
  }

  /** ARCA, en cuanto el CUIT está completo y es válido. */
  const preguntarAArca = async (texto: string) => {
    const d = soloDigitos(texto)
    if (d.length !== 11 || problemaDelCuit(texto)) return
    setConsultando(true)
    setArca(null)
    try {
      const r = await consultarArca(d)
      if (!r.ok) {
        setArca(`ARCA no contestó: ${r.mensaje} Cargá la razón social a mano.`)
        return
      }
      setRazonSocial((v) => v.trim() || r.datos.razonSocial)
      setCondicionFiscal(
        (v) => v || condicionFiscalDeArca(r.datos.condicionIva, condicionesFiscales),
      )
      setArca(
        r.datos.razonSocial
          ? `ARCA dice que es ${r.datos.razonSocial}${
              r.datos.condicionIvaTexto ? ` · ${r.datos.condicionIvaTexto}` : ''
            }${r.datos.datoViejo ? ' (dato guardado, ARCA no respondió ahora)' : ''}.`
          : 'ARCA respondió, pero sin razón social. Cargala a mano.',
      )
    } finally {
      setConsultando(false)
    }
  }

  const faltan = [
    !razonSocial.trim() && 'la razón social',
    !digitos && 'el CUIT',
    problema && 'un CUIT válido',
    !condicionFiscal && 'la condición frente al IVA',
  ].filter(Boolean) as string[]

  const guardar = async () => {
    setGuardando(true)
    setError(null)
    try {
      const nueva = await crearCuenta({
        razonSocial: razonSocial.trim(),
        cuit: formatearCuit(cuit),
        tipoPersona: tipoDePersonaSegunCuit(digitos) ?? '',
        clasificacion: '',
        categorias: [],
        condicionFiscal,
        direccion: '',
        ciudad: '',
        provincia: '',
        paisCodigo: '',
        paisNombre: '',
        descripcion: '',
        concesionarioIds: [],
        contactoIds: [],
      })
      /* La cuenta recién creada todavía no está en la lista que leyó la pantalla: se arma acá con
         lo que se cargó, para que se vea igual que las demás sin volver a pedir el CRM entero. */
      onCuentaNueva({
        id: nueva.id,
        nombre: nueva.nombre,
        cuit: formatearCuit(cuit),
        clasificacion: '',
        categoria: '',
        tipoPersona: tipoDePersonaSegunCuit(digitos) ?? '',
        condicionFiscal,
        direccion: '',
        ciudad: '',
        provincia: '',
        pais: '',
        descripcion: '',
        estado: '',
        creditoAsignado: null,
        creditoUtilizado: null,
        concesionarioIds: [],
        contactoIds: [],
      })
      sumar(nueva)
      limpiar()
      setCreando(false)
    } catch (e) {
      setError(mensaje(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="ficha ficha--elegir">
      <div className="ficha-head">
        <span className="ficha-rotulo">
          Cliente final <span className="campo-req">· obligatorio</span>
        </span>
        {!creando && (
          <button
            type="button"
            className="btn btn--borde btn--chico"
            disabled={cargando}
            onClick={() => setCreando(true)}
          >
            <i className="fa-solid fa-plus" aria-hidden="true" /> Cliente nuevo
          </button>
        )}
      </div>

      {elegidos.map((c) => {
        const ficha = cuentas.find((x) => x.id === c.id)
        return ficha ? (
          <FichaCuenta
            key={c.id}
            cuenta={ficha}
            rotulo=""
            onQuitar={() => onCambiar(elegidos.filter((x) => x.id !== c.id))}
          />
        ) : null
      })}

      {!creando ? (
        <>
          <SelectorBuscable
            valor=""
            opciones={cuentas
              .filter((c) => c.id !== excluirId && !elegidos.some((e) => e.id === c.id))
              .map((c) => ({
                valor: c.id,
                rotulo: c.nombre,
                detalle: [c.cuit && `CUIT ${c.cuit}`, c.ciudad, c.provincia]
                  .filter(Boolean)
                  .join(' · '),
              }))}
            vacio={cargando ? 'Cargando las cuentas…' : 'Buscar por nombre o CUIT…'}
            queSon="cuentas"
            bloqueado={cargando}
            onCambiar={(v) => {
              const c = cuentas.find((x) => x.id === v)
              if (c) sumar(c)
            }}
          />
          <span className="campo-ayuda">
            Se puede poner más de uno: el pedido queda a nombre de todos.
          </span>
        </>
      ) : (
        <div className="alta-rapida">
          <span className="alta-rapida-tit">
            <i className="fa-solid fa-building-user" aria-hidden="true" /> Cargar un cliente nuevo
          </span>

          <div className="datos datos--form">
            <label className="campo">
              <span className="campo-lbl">
                CUIT <span className="campo-req">· obligatorio</span>
              </span>
              <input
                className="input"
                inputMode="numeric"
                placeholder="20-12345678-6"
                value={cuit}
                disabled={guardando}
                onChange={(e) => {
                  setCuit(e.target.value)
                  setArca(null)
                }}
                /* Al salir del campo, no en cada tecla: así ARCA se consulta una vez y no once. */
                onBlur={() => void preguntarAArca(cuit)}
              />
              {problema && <span className="campo-ayuda campo-ayuda--falta">{problema}</span>}
              {consultando && <span className="campo-ayuda">Preguntándole a ARCA…</span>}
              {arca && !problema && <span className="campo-ayuda">{arca}</span>}
            </label>

            <label className="campo">
              <span className="campo-lbl">
                Razón social <span className="campo-req">· obligatorio</span>
              </span>
              <input
                className="input"
                value={razonSocial}
                disabled={guardando}
                placeholder="La trae ARCA con el CUIT"
                onChange={(e) => setRazonSocial(e.target.value)}
              />
            </label>

            <div className="campo">
              <span className="campo-lbl">
                Condición frente al IVA <span className="campo-req">· obligatorio</span>
              </span>
              <Desplegable
                valor={condicionFiscal}
                opciones={condicionesFiscales}
                vacio="Elegir…"
                bloqueado={guardando}
                onCambiar={setCondicionFiscal}
              />
            </div>
          </div>

          {/* El CUIT repetido se avisa antes de crear nada: la cuenta ya existe y se puede usar. */}
          {repetida && (
            <div className="aviso aviso--alerta">
              <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
              <span>
                Ese CUIT ya está cargado como <b>{repetida.nombre}</b>. Usá esa cuenta en vez de
                crear una repetida.
                <button
                  type="button"
                  className="btn btn--borde btn--chico"
                  onClick={() => {
                    sumar(repetida)
                    limpiar()
                    setCreando(false)
                  }}
                >
                  Usar esta cuenta
                </button>
              </span>
            </div>
          )}

          {error && (
            <div className="aviso aviso--error">
              <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
              <span>No se pudo crear la cuenta: {error}</span>
            </div>
          )}

          <span className="campo-ayuda">
            Con esto alcanza para facturarle. El resto de la ficha —clasificación, categoría,
            domicilio— la completa BERGER desde el CRM.
          </span>

          <div className="alta-rapida-pie">
            <button
              type="button"
              className="btn btn--texto btn--chico"
              disabled={guardando}
              onClick={() => {
                limpiar()
                setCreando(false)
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn--primario btn--chico"
              disabled={guardando || faltan.length > 0 || Boolean(repetida)}
              onClick={() => void guardar()}
            >
              {guardando ? 'Creando…' : 'Crear y usar'}
            </button>
          </div>
          {faltan.length > 0 && (
            <span className="campo-ayuda campo-ayuda--falta">
              <i className="fa-solid fa-lock" aria-hidden="true" /> Falta {faltan.join(', ')}.
            </span>
          )}
        </div>
      )}
    </div>
  )
}
