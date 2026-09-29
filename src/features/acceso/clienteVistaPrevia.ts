/**
 * Cliente de mentira del ingreso, SÓLO para ver las pantallas en localhost.
 *
 * En desarrollo no corren las funciones de `api/` —Vite no las ejecuta— y fuera de monday no hay
 * sesión, así que el ingreso real no se puede recorrer en local. Con `?vista-previa` en la URL se
 * usa este cliente, que simula las respuestas del servidor para revisar el diseño.
 *
 * No verifica nada ni genera secretos reales: el QR es de una clave al azar que no se guarda. Se
 * importa sólo dentro de una rama `import.meta.env.DEV`, así que no llega al build de producción.
 *
 * Para probar los mensajes, `000000` es siempre un código incorrecto. Con
 * `?vista-previa=verificar` arranca en la pantalla del código del día, como un día cualquiera.
 */
import { MODULOS_APP } from '@/services/monday/operaciones'
import type { ClienteIngreso, RespuestaIngreso } from '@/services/acceso/cliente'

const PERFIL = { id: '1', nombre: 'Camila TAP' }

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const azar = (n: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => ALFABETO[b % 32]).join('')

const pausa = () => new Promise((r) => setTimeout(r, 450))

/** `?vista-previa=verificar` muestra el día a día; sin valor, la primera vez. */
const yaConfigurado = new URLSearchParams(window.location.search).get('vista-previa') === 'verificar'

export const clienteVistaPrevia: ClienteIngreso = {
  async pedir(pedido): Promise<RespuestaIngreso> {
    await pausa()

    switch (pedido.accion) {
      case 'estado':
        return yaConfigurado
          ? { estado: 'verificar', perfil: PERFIL }
          : { estado: 'configurar', perfil: PERFIL, puedeImportar: true }

      case 'iniciar': {
        const secreto = azar(32)
        const etiqueta = encodeURIComponent(PERFIL.nombre)
        return {
          estado: 'configurar',
          perfil: PERFIL,
          secreto,
          otpauth: `otpauth://totp/BERGER%20S.A.%3A${etiqueta}?secret=${secreto}&issuer=BERGER%20S.A.`,
          puedeImportar: true,
        }
      }

      case 'confirmar':
        if (pedido.clave && pedido.clave.replace(/[\s-]/g, '').length < 16) {
          return { estado: 'clave_invalida' }
        }
        if (pedido.codigo === '000000') return { estado: 'codigo_incorrecto', intentosRestantes: 2 }
        return {
          estado: 'listo',
          modulos: [...MODULOS_APP],
          perfil: PERFIL,
          sesion: 'vista-previa',
          codigosRecuperacion: Array.from({ length: 10 }, () => `${azar(5)}-${azar(5)}`),
        }

      case 'verificar':
        if (pedido.codigo === '000000') return { estado: 'codigo_incorrecto', intentosRestantes: 4 }
        return {
          estado: 'listo',
          modulos: [...MODULOS_APP],
          perfil: PERFIL,
          sesion: 'vista-previa',
          ...(pedido.recuperacion ? { recuperacionRestantes: 9 } : {}),
        }
    }
  },
}
