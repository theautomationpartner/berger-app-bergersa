import type { ModuloApp } from '@/services/monday/operaciones'
import type { ReactNode } from 'react'
import { PantallaSinAcceso } from '@/components/ui/PantallaSinAcceso'
import type { ClienteIngreso, PerfilIngreso } from '@/services/acceso/cliente'
import { CodigosRecuperacion } from './CodigosRecuperacion'
import { ConfigurarAutenticador } from './ConfigurarAutenticador'
import { MarcoIngreso } from './MarcoIngreso'
import { useIngreso } from './useIngreso'
import { VerificarCodigo } from './VerificarCodigo'

export interface SesionIngreso {
  perfil: PerfilIngreso
  /** Módulos de la app que este perfil tiene habilitados, según el servidor. */
  modulos: ModuloApp[]
  salir: () => void
  /** Si entró con un código de recuperación, cuántos le quedan. `null` si no. */
  recuperacionRestantes: number | null
}

interface Props {
  cliente: ClienteIngreso
  /** Usuario de monday. Hasta que no se conoce, no se pregunta nada. */
  usuarioId: string | null
  children: (sesion: SesionIngreso) => ReactNode
}

/**
 * Compuerta de la app: hasta que el servidor no confirma Lista Blanca, perfil y autenticador, lo
 * único que existe en pantalla es el ingreso. La app —y con ella cualquier consulta al tablero—
 * recién se monta cuando el paso es `listo`.
 */
export function Ingreso({ cliente, usuarioId, children }: Props) {
  const ingreso = useIngreso(cliente, usuarioId)
  const { paso } = ingreso

  switch (paso.tipo) {
    case 'cargando':
      return (
        <div className="ingreso">
          <span className="spin" aria-hidden="true" />
          <p className="ingreso-pie">Verificando el acceso…</p>
        </div>
      )

    case 'sin_acceso':
      return <PantallaSinAcceso motivo="sin-acceso" />

    case 'error':
      return (
        <MarcoIngreso
          titulo="No se pudo verificar el acceso"
          bajada="Hubo un problema de conexión. Probá de nuevo en unos minutos."
        >
          <button
            type="button"
            className="btn btn--marca ingreso-accion"
            onClick={ingreso.reintentar}
          >
            <i className="fa-solid fa-rotate" aria-hidden="true" /> Reintentar
          </button>
        </MarcoIngreso>
      )

    case 'configurar':
      return (
        <ConfigurarAutenticador
          perfil={paso.perfil}
          otpauth={paso.otpauth}
          secreto={paso.secreto}
          puedeImportar={paso.puedeImportar}
          mensaje={ingreso.mensaje}
          enviando={ingreso.enviando}
          onConfirmar={(codigo, clave) => void ingreso.confirmar(codigo, clave)}
        />
      )

    case 'codigos':
      return <CodigosRecuperacion codigos={paso.codigos} onEntrar={ingreso.entrar} />

    case 'verificar':
      return (
        <VerificarCodigo
          perfil={paso.perfil}
          mensaje={ingreso.mensaje}
          enviando={ingreso.enviando}
          onVerificar={(codigo, recuperacion) => void ingreso.verificar(codigo, recuperacion)}
        />
      )

    case 'listo':
      return (
        <>
          {children({
            perfil: paso.perfil,
            modulos: paso.modulos,
            salir: ingreso.salir,
            recuperacionRestantes: ingreso.recuperacionRestantes,
          })}
        </>
      )
  }
}
