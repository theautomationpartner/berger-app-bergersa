/**
 * Los campos de una cuenta.
 *
 * Están acá y no adentro de la pantalla porque se usan en tres lugares: dando de alta una cuenta,
 * copiando una que ya existe, y editándola. Son los mismos campos con las mismas reglas, y
 * tenerlos repetidos garantizaba que en algún momento uno de los tres se quedara atrás.
 */
import { useCallback, useState } from 'react'
import { Desplegable } from '@/components/ui/Desplegable'
import { DesplegableMulti } from '@/components/ui/DesplegableMulti'
import { formatearCuit, problemaDelCuit, soloDigitos, tipoDePersonaSegunCuit } from '@/lib/cuit'
import { PAIS_POR_DEFECTO, PAISES } from '@/lib/telefono'
import { condicionFiscalDeArca, consultarArca } from '@/services/arca'
import type { Concesionario } from '@/services/monday/crm'

export interface DatosCuenta {
  razonSocial: string
  cuit: string
  clasificacion: string
  categoria: string
  condicionFiscal: string
  direccion: string
  ciudad: string
  provincia: string
  paisCodigo: string
  descripcion: string
  concesionarioIds: string[]
  /** Contactos que ya existen y quedan enganchados a la cuenta. */
  contactoIds: string[]
}

export const CUENTA_VACIA: DatosCuenta = {
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
  concesionarioIds: [],
  contactoIds: [],
}

export interface OpcionesCuenta {
  clasificacion: string[]
  categoriaCuenta: string[]
  condicionFiscal: string[]
}

interface Props {
  datos: DatosCuenta
  onCambiar: (datos: DatosCuenta) => void
  opciones: OpcionesCuenta
  concesionarios: Concesionario[]
  cargando?: boolean
  /** Editando, el CUIT identifica a la cuenta: cambiarlo es otra cuenta. */
  cuitBloqueado?: boolean
}

export function CamposCuenta({
  datos,
  onCambiar,
  opciones,
  concesionarios,
  cargando,
  cuitBloqueado,
}: Props) {
  const cambiar = (parcial: Partial<DatosCuenta>) => onCambiar({ ...datos, ...parcial })

  const [consultando, setConsultando] = useState(false)
  const [arca, setArca] = useState<{ ok: boolean; mensaje: string; viejo?: boolean } | null>(null)

  const problemaCuit = datos.cuit.trim() ? problemaDelCuit(datos.cuit) : null
  /* El prefijo del CUIT ya dice si es una persona o una empresa, así que no se pregunta. */
  const tipoPersona = tipoDePersonaSegunCuit(datos.cuit) ?? ''

  /**
   * Trae del padrón lo que ARCA sabe.
   *
   * Lo que vuelve se carga sólo en los campos **vacíos**: si alguien ya escribió la razón social
   * —o la trajo de otra cuenta— no se le pisa lo que puso.
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
        onCambiar({
          ...datos,
          razonSocial: datos.razonSocial.trim() || d.razonSocial,
          condicionFiscal:
            datos.condicionFiscal ||
            condicionFiscalDeArca(d.condicionIva, opciones.condicionFiscal),
          direccion: datos.direccion.trim() || d.domicilio,
          ciudad: datos.ciudad.trim() || d.localidad,
          provincia: datos.provincia.trim() || d.provincia,
        })
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
    [datos, onCambiar, opciones.condicionFiscal],
  )

  return (
    <div className="datos datos--form">
      <label className="campo">
        <span className="campo-lbl">
          CUIT / CUIL <span className="campo-req">· obligatorio</span>
        </span>
        <input
          className="input"
          placeholder="Ej: 20-12345678-6"
          disabled={cuitBloqueado}
          value={datos.cuit}
          onChange={(e) => {
            cambiar({ cuit: e.target.value })
            setArca(null)
          }}
          onBlur={() => {
            cambiar({ cuit: formatearCuit(datos.cuit) })
            void traerDeArca(datos.cuit)
          }}
        />
        {/* El motivo, y no un "CUIT inválido": decir qué está mal es lo que permite corregirlo
            sin adivinar. */}
        {problemaCuit && <span className="campo-ayuda campo-ayuda--falta">{problemaCuit}</span>}
        {!problemaCuit && tipoPersona && (
          <span className="campo-ayuda campo-ayuda--ok">
            Es una <b>{tipoPersona}</b>, por el prefijo del CUIT.
          </span>
        )}
        {cuitBloqueado && (
          <span className="campo-ayuda">
            El CUIT identifica a la cuenta: cambiarlo sería otra cuenta.
          </span>
        )}
        {consultando && (
          <span className="campo-ayuda">
            <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" /> Preguntándole a ARCA…
          </span>
        )}
        {arca && !consultando && (
          <span className={`campo-ayuda ${arca.ok ? 'campo-ayuda--ok' : 'campo-ayuda--aviso'}`}>
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
          value={datos.razonSocial}
          onChange={(e) => cambiar({ razonSocial: e.target.value })}
        />
      </label>

      <div className="campo">
        <span className="campo-lbl">
          Condición fiscal <span className="campo-req">· obligatorio</span>
        </span>
        <Desplegable
          valor={datos.condicionFiscal}
          opciones={opciones.condicionFiscal}
          vacio="Elegir…"
          bloqueado={cargando}
          onCambiar={(v) => cambiar({ condicionFiscal: v })}
        />
      </div>

      <div className="campo">
        <span className="campo-lbl">Clasificación</span>
        <Desplegable
          valor={datos.clasificacion}
          opciones={opciones.clasificacion}
          vacio="Elegir…"
          bloqueado={cargando}
          onCambiar={(v) => cambiar({ clasificacion: v })}
        />
        <span className="campo-ayuda">Habitual, ocasional, moroso o bloqueado.</span>
      </div>

      <label className="campo">
        <span className="campo-lbl">Domicilio</span>
        <input
          className="input"
          placeholder="Calle y número"
          value={datos.direccion}
          onChange={(e) => cambiar({ direccion: e.target.value })}
        />
      </label>

      <label className="campo">
        <span className="campo-lbl">Ciudad</span>
        <input
          className="input"
          value={datos.ciudad}
          onChange={(e) => cambiar({ ciudad: e.target.value })}
        />
      </label>

      <label className="campo">
        <span className="campo-lbl">Provincia</span>
        <input
          className="input"
          value={datos.provincia}
          onChange={(e) => cambiar({ provincia: e.target.value })}
        />
      </label>

      <div className="campo">
        <span className="campo-lbl">País</span>
        <Desplegable
          valor={datos.paisCodigo}
          opciones={PAISES.map((p) => ({ valor: p.codigo, rotulo: p.nombre }))}
          buscable
          onCambiar={(v) => cambiar({ paisCodigo: v })}
        />
      </div>

      <div className="campo">
        <span className="campo-lbl">Categoría</span>
        <Desplegable
          valor={datos.categoria}
          opciones={opciones.categoriaCuenta}
          vacio="Elegir…"
          bloqueado={cargando}
          onCambiar={(v) => cambiar({ categoria: v })}
        />
      </div>

      {concesionarios.length > 0 && (
        <div className="campo">
          <span className="campo-lbl">Concesionario asignado</span>
          <DesplegableMulti
            valores={datos.concesionarioIds}
            opciones={concesionarios.map((c) => ({ valor: c.id, rotulo: c.nombre }))}
            vacio="Ninguno"
            buscable={concesionarios.length > 6}
            bloqueado={cargando}
            onCambiar={(ids) => cambiar({ concesionarioIds: ids })}
          />
          <span className="campo-ayuda">Puede ser más de uno.</span>
        </div>
      )}
    </div>
  )
}
