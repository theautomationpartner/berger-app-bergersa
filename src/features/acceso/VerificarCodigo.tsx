import { useState } from 'react'
import type { PerfilIngreso } from '@/services/acceso/cliente'
import { CampoCodigo } from './CampoCodigo'
import { MarcoIngreso } from './MarcoIngreso'

interface Props {
  perfil: PerfilIngreso
  mensaje: string | null
  enviando: boolean
  onVerificar: (codigo: string, recuperacion: boolean) => void
}

/**
 * El código del día: lo que se pide en el primer ingreso de cada día.
 *
 * El código de recuperación está a un clic pero no a la vista: es para el día que se pierde el
 * celular, y con los dos campos juntos cualquiera escribiría el código de 6 dígitos en el que no va.
 */
export function VerificarCodigo({ perfil, mensaje, enviando, onVerificar }: Props) {
  const [recuperacion, setRecuperacion] = useState(false)
  const [codigoRecuperacion, setCodigoRecuperacion] = useState('')

  return (
    <MarcoIngreso
      titulo={recuperacion ? 'Código de recuperación' : 'Código de verificación'}
      bajada={
        recuperacion ? (
          <>
            Escribí uno de los 10 códigos que guardaste al configurar la verificación. Cada uno
            sirve una sola vez.
          </>
        ) : (
          <>
            Hola <b>{perfil.nombre}</b>. Abrí la app de autenticación en tu celular y escribí el
            código de 6 dígitos de <b>BERGER S.A.</b>
          </>
        )
      }
    >
      {recuperacion ? (
        <form
          className="ingreso-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (codigoRecuperacion.trim()) onVerificar(codigoRecuperacion, true)
          }}
        >
          <input
            className="input ingreso-recuperacion"
            placeholder="XXXXX-XXXXX"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            autoFocus
            maxLength={16}
            disabled={enviando}
            value={codigoRecuperacion}
            onChange={(e) => setCodigoRecuperacion(e.target.value.toUpperCase())}
          />
          <button
            type="submit"
            className="btn btn--marca ingreso-accion"
            disabled={enviando || !codigoRecuperacion.trim()}
          >
            {enviando ? <span className="spin" aria-hidden="true" /> : 'Ingresar'}
          </button>
        </form>
      ) : (
        <CampoCodigo
          onCompleto={(codigo) => onVerificar(codigo, false)}
          deshabilitado={enviando}
          reinicio={mensaje}
        />
      )}

      {mensaje && (
        <div className="aviso aviso--error ingreso-aviso">
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
          <span>{mensaje}</span>
        </div>
      )}
      {enviando && !recuperacion && <p className="ingreso-nota">Verificando…</p>}

      <div className="ingreso-enlaces">
        <button
          type="button"
          className="btn btn--texto btn--chico"
          onClick={() => {
            setRecuperacion((r) => !r)
            setCodigoRecuperacion('')
          }}
        >
          <i
            className={`fa-solid ${recuperacion ? 'fa-mobile-screen' : 'fa-life-ring'}`}
            aria-hidden="true"
          />
          {recuperacion
            ? 'Usar el código del celular'
            : '¿Perdiste el celular? Usá un código de recuperación'}
        </button>
      </div>
    </MarcoIngreso>
  )
}
