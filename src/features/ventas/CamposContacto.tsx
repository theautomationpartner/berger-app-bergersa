/**
 * Los campos de un contacto.
 *
 * Están acá y no adentro de la pantalla porque se usan en dos lugares: dando de alta un contacto
 * suelto, y creando uno desde el alta de una cuenta. Son los mismos campos con las mismas reglas,
 * y tenerlos dos veces garantizaba que en algún momento uno de los dos se quedara atrás.
 */
import { Desplegable } from '@/components/ui/Desplegable'
import { DesplegableMulti } from '@/components/ui/DesplegableMulti'
import {
  armarWhatsapp,
  PAISES,
  PAIS_POR_DEFECTO,
  prefijoDe,
  problemaDelTelefono,
} from '@/lib/telefono'

export interface DatosContacto {
  nombres: string
  apellidos: string
  categorias: string[]
  email: string
  paisCodigo: string
  area: string
  abonado: string
  comentarios: string
}

export const CONTACTO_VACIO: DatosContacto = {
  nombres: '',
  apellidos: '',
  categorias: [],
  email: '',
  paisCodigo: PAIS_POR_DEFECTO,
  area: '',
  abonado: '',
  comentarios: '',
}

interface Props {
  datos: DatosContacto
  onCambiar: (datos: DatosContacto) => void
  categorias: string[]
  cargando?: boolean
  /** En el alta de una cuenta el comentario sobra: el espacio es para la cuenta. */
  conComentarios?: boolean
}

export function CamposContacto({
  datos,
  onCambiar,
  categorias,
  cargando,
  conComentarios = true,
}: Props) {
  const cambiar = (parcial: Partial<DatosContacto>) => onCambiar({ ...datos, ...parcial })
  const whatsapp = armarWhatsapp(datos.paisCodigo, datos.area, datos.abonado)
  const problemaTel = problemaDelTelefono(datos.paisCodigo, datos.area, datos.abonado)

  return (
    <>
      <div className="datos datos--form">
        <label className="campo">
          <span className="campo-lbl">
            Nombre/s <span className="campo-req">· obligatorio</span>
          </span>
          <input
            className="input"
            placeholder="Ej: Ricardo"
            value={datos.nombres}
            onChange={(e) => cambiar({ nombres: e.target.value })}
          />
        </label>

        <label className="campo">
          <span className="campo-lbl">
            Apellido/s <span className="campo-req">· obligatorio</span>
          </span>
          <input
            className="input"
            placeholder="Ej: Gutiérrez"
            value={datos.apellidos}
            onChange={(e) => cambiar({ apellidos: e.target.value })}
          />
        </label>

        <label className="campo">
          <span className="campo-lbl">E-mail</span>
          <input
            className="input"
            type="email"
            placeholder="nombre@empresa.com"
            value={datos.email}
            onChange={(e) => cambiar({ email: e.target.value })}
          />
          <span className="campo-ayuda">
            Con el mail o el WhatsApp alcanza, pero alguno de los dos tiene que estar: son los que
            identifican a la persona.
          </span>
        </label>

        <div className="campo">
          <span className="campo-lbl">Categoría</span>
          <DesplegableMulti
            valores={datos.categorias}
            opciones={categorias}
            vacio="Elegir…"
            bloqueado={cargando}
            onCambiar={(v) => cambiar({ categorias: v })}
          />
          <span className="campo-ayuda">Puede tener más de una.</span>
        </div>
      </div>

      {/* El teléfono ocupa su propia fila: son cuatro casilleros y, metidos en la grilla junto a
          los demás campos, quedaban de dos centímetros. */}
      <div className="campo campo--suelto">
        <span className="campo-lbl">WhatsApp</span>
        <div className="tel-partes">
          <div className="tel-pais">
            <Desplegable
              valor={datos.paisCodigo}
              opciones={PAISES.map((p) => ({
                valor: p.codigo,
                rotulo: p.nombre,
                detalle: `+${p.prefijo}`,
              }))}
              buscable
              onCambiar={(v) => cambiar({ paisCodigo: v })}
            />
          </div>
          <span className="tel-prefijo">+{prefijoDe(datos.paisCodigo)}</span>
          <input
            className="input tel-area"
            placeholder="Característica"
            inputMode="numeric"
            value={datos.area}
            onChange={(e) => cambiar({ area: e.target.value })}
          />
          <input
            className="input tel-numero"
            placeholder="Número"
            inputMode="numeric"
            value={datos.abonado}
            onChange={(e) => cambiar({ abonado: e.target.value })}
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
        {problemaTel && <span className="campo-ayuda campo-ayuda--falta">{problemaTel}</span>}
      </div>

      {conComentarios && (
        <label className="campo campo--suelto">
          <span className="campo-lbl">Comentarios</span>
          <textarea
            className="input textarea"
            rows={4}
            placeholder="Opcional: de qué se habló, qué conviene recordar la próxima vez."
            value={datos.comentarios}
            onChange={(e) => cambiar({ comentarios: e.target.value })}
          />
        </label>
      )}
    </>
  )
}
