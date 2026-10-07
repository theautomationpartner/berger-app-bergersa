/**
 * Cliente del endpoint de ingreso (`/api/acceso`).
 *
 * El navegador no decide nada: pregunta qué falta y muestra la pantalla que corresponde. Toda la
 * lógica —Lista Blanca, perfiles, autenticador, límites— vive en el servidor, que es el único
 * lugar donde no se puede saltear.
 */
import type { ModuloApp } from '@/services/monday/operaciones'
import { sesionDelDia } from './sesionDelDia'

export interface PerfilIngreso {
  id: string
  nombre: string
  /** Los equipos de su fila de la Lista Blanca: "Administracion", "Concesionario 1"… */
  equipos?: string[]
  /** El id de ese equipo en monday. Lo decide el servidor, no la pantalla. */
  equipoId?: string
}

/** Lo que devuelve el servidor, ya traducido a un paso de la pantalla. */
export type RespuestaIngreso =
  | { estado: 'sin_acceso' }
  | { estado: 'error' }
  | {
      estado: 'configurar'
      perfil: PerfilIngreso
      otpauth?: string
      secreto?: string
      /** Sólo los ADMIN pueden usar una clave que ya tienen en vez del QR. */
      puedeImportar?: boolean
    }
  | { estado: 'verificar'; perfil: PerfilIngreso }
  | {
      estado: 'listo'
      perfil: PerfilIngreso
      sesion: string
      codigosRecuperacion?: string[]
      recuperacionRestantes?: number
      /**
       * Módulos habilitados. Los decide el servidor: acá sólo sirven para no dibujar pantallas que
       * el servidor después va a rechazar. Esconder un módulo no es lo que lo protege.
       */
      modulos?: ModuloApp[]
    }
  | { estado: 'codigo_incorrecto'; intentosRestantes?: number }
  | { estado: 'clave_invalida' }
  | { estado: 'bloqueado' }

export interface PedidoIngreso {
  accion: 'estado' | 'iniciar' | 'confirmar' | 'verificar'
  codigo?: string
  recuperacion?: boolean
  /** Clave de autenticador que el usuario ya tiene (gestor de contraseñas). Sólo ADMIN. */
  clave?: string
}

export interface ClienteIngreso {
  pedir: (pedido: PedidoIngreso) => Promise<RespuestaIngreso>
}

/** Cliente real: habla con el servidor con la sesión de monday y la del día. */
export const clienteIngreso: ClienteIngreso = {
  async pedir(pedido) {
    const { obtenerSessionToken } = await import('@/services/monday/sesion')

    let res: Response
    try {
      const sesion = sesionDelDia()
      res = await fetch('/api/acceso', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await obtenerSessionToken()}`,
          ...(sesion ? { 'X-Sesion-App': sesion } : {}),
        },
        body: JSON.stringify(pedido),
      })
    } catch {
      return { estado: 'error' }
    }

    const cuerpo = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (res.status === 403) return { estado: 'sin_acceso' }
    if (res.status === 429) return { estado: 'bloqueado' }
    if (cuerpo.error === 'clave_invalida') return { estado: 'clave_invalida' }
    if (cuerpo.error === 'codigo_incorrecto') {
      return {
        estado: 'codigo_incorrecto',
        intentosRestantes: cuerpo.intentosRestantes as number | undefined,
      }
    }
    // 409: el estado cambió entre dos pasos (por ejemplo, ya estaba configurado). La respuesta
    // trae el estado correcto, así que se sigue desde ahí.
    if ((res.ok || res.status === 409) && typeof cuerpo.estado === 'string') {
      return cuerpo as unknown as RespuestaIngreso
    }
    return { estado: 'error' }
  },
}
