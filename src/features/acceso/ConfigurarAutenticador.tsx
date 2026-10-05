import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import type { PerfilIngreso } from '@/services/acceso/cliente'
import { CampoCodigo } from './CampoCodigo'
import { MarcoIngreso } from './MarcoIngreso'

interface Props {
  perfil: PerfilIngreso
  otpauth: string
  secreto: string
  /** Sólo los ADMIN pueden usar una clave que ya tienen, en vez del QR. */
  puedeImportar: boolean
  mensaje: string | null
  enviando: boolean
  onConfirmar: (codigo: string, clave?: string) => void
}

/** La clave en bloques de 4, para copiarla a mano sin perderse: `ABCD EFGH IJKL …`. */
const enBloques = (secreto: string) => secreto.match(/.{1,4}/g)?.join(' ') ?? secreto

/**
 * Primera vez: se vincula el autenticador y se confirma con el primer código.
 *
 * Hay dos caminos, y el segundo existe para la cuenta que comparten los administradores:
 *
 * - **Escanear el QR** que genera la app. Es el de todos los usuarios, y el único que garantiza
 *   que el secreto lo generó la app y nadie más lo vio. El QR se dibuja EN el navegador: mandarlo
 *   a un servicio externo de generación de QR sería entregarle el secreto a un tercero.
 * - **Usar una clave que ya existe**, la del gestor de contraseñas del equipo. Evita repartir un
 *   QR entre varias personas. Sólo se ofrece a los ADMIN, y hay que escribir igual el código que
 *   esa clave está generando: eso prueba que se pegó completa y que es la correcta.
 */
export function ConfigurarAutenticador({
  perfil,
  otpauth,
  secreto,
  puedeImportar,
  mensaje,
  enviando,
  onConfirmar,
}: Props) {
  const [modo, setModo] = useState<'qr' | 'clave'>('qr')
  const [qr, setQr] = useState<string | null>(null)
  const [verClave, setVerClave] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [clavePropia, setClavePropia] = useState('')

  useEffect(() => {
    let vigente = true
    QRCode.toDataURL(otpauth, { margin: 1, width: 220, errorCorrectionLevel: 'M' })
      .then((url) => vigente && setQr(url))
      .catch(() => vigente && setVerClave(true))
    return () => {
      vigente = false
    }
  }, [otpauth])

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(secreto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      setVerClave(true)
    }
  }

  return (
    <MarcoIngreso
      ancha
      titulo="Configurá tu verificación"
      bajada={
        <>
          Hola <b>{perfil.nombre}</b>. Es la primera vez que entrás: vinculá tu verificación una
          sola vez y después sólo te vamos a pedir un código de 6 dígitos por día.
        </>
      }
    >
      {puedeImportar && (
        <div className="ingreso-modos" role="tablist" aria-label="Cómo configurar la verificación">
          <button
            type="button"
            role="tab"
            aria-selected={modo === 'qr'}
            className={`ingreso-modo${modo === 'qr' ? ' ingreso-modo--activo' : ''}`}
            onClick={() => setModo('qr')}
          >
            <i className="fa-solid fa-qrcode" aria-hidden="true" /> Escanear un QR
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={modo === 'clave'}
            className={`ingreso-modo${modo === 'clave' ? ' ingreso-modo--activo' : ''}`}
            onClick={() => setModo('clave')}
          >
            <i className="fa-solid fa-key" aria-hidden="true" /> Ya tengo la clave
          </button>
        </div>
      )}

      {modo === 'qr' ? (
        <>
          <ol className="ingreso-pasos">
            <li>
              <span className="ingreso-paso-num">1</span>
              <span>
                Abrí tu app de autenticación —<b>Google Authenticator</b>, Microsoft Authenticator,
                Authy o <b>1Password</b>— y escaneá este código.
              </span>
            </li>
          </ol>

          <div className="ingreso-qr">
            {qr ? (
              <img
                src={qr}
                alt="Código QR para vincular el autenticador"
                width={220}
                height={220}
              />
            ) : (
              <span className="spin spin--oscuro" aria-hidden="true" />
            )}
          </div>

          <div className="ingreso-clave">
            <button
              type="button"
              className="btn btn--texto btn--chico"
              onClick={() => setVerClave((v) => !v)}
            >
              <i className="fa-solid fa-keyboard" aria-hidden="true" />
              {verClave ? 'Ocultar la clave' : '¿No podés escanear? Ingresá la clave a mano'}
            </button>
            {verClave && (
              <div className="ingreso-clave-caja">
                <code className="ingreso-clave-txt">{enBloques(secreto)}</code>
                <button
                  type="button"
                  className="btn btn--borde btn--chico"
                  onClick={() => void copiar()}
                >
                  <i
                    className={`fa-solid ${copiado ? 'fa-check' : 'fa-copy'}`}
                    aria-hidden="true"
                  />
                  {copiado ? 'Copiada' : 'Copiar'}
                </button>
              </div>
            )}
          </div>

          <ol className="ingreso-pasos" start={2}>
            <li>
              <span className="ingreso-paso-num">2</span>
              <span>Escribí el código de 6 dígitos que muestra la app para confirmar.</span>
            </li>
          </ol>

          <CampoCodigo
            onCompleto={(codigo) => onConfirmar(codigo)}
            deshabilitado={enviando}
            reinicio={mensaje}
          />
        </>
      ) : (
        <form
          className="ingreso-form"
          onSubmit={(e) => {
            e.preventDefault()
          }}
        >
          <ol className="ingreso-pasos">
            <li>
              <span className="ingreso-paso-num">1</span>
              <span>
                Pegá la clave del autenticador que ya usan para esta cuenta. En 1Password está en el
                campo de contraseña de un solo uso, en <b>Editar → Mostrar clave secreta</b>.
              </span>
            </li>
          </ol>

          <input
            className="input ingreso-clave-propia"
            placeholder="ABCD EFGH IJKL MNOP …"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            disabled={enviando}
            value={clavePropia}
            onChange={(e) => setClavePropia(e.target.value)}
          />

          <ol className="ingreso-pasos" start={2}>
            <li>
              <span className="ingreso-paso-num">2</span>
              <span>Escribí el código de 6 dígitos que esa clave está generando ahora.</span>
            </li>
          </ol>

          <CampoCodigo
            onCompleto={(codigo) => clavePropia.trim() && onConfirmar(codigo, clavePropia)}
            deshabilitado={enviando || !clavePropia.trim()}
            reinicio={mensaje}
          />
          {!clavePropia.trim() && <p className="ingreso-nota">Primero pegá la clave.</p>}
        </form>
      )}

      {mensaje && (
        <div className="aviso aviso--error ingreso-aviso">
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
          <span>{mensaje}</span>
        </div>
      )}
      {enviando && <p className="ingreso-nota">Verificando…</p>}
    </MarcoIngreso>
  )
}
