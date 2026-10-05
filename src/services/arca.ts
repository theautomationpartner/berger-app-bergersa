/**
 * La consulta al padrón de ARCA, del lado del navegador.
 *
 * Con el CUIT trae razón social, condición de IVA y domicilio, así que quien da de alta carga sólo
 * lo que ARCA no sabe: la clasificación, la categoría y el concesionario.
 *
 * El navegador nunca habla con ARCA: en producción pasa por `api/arca.ts` y en desarrollo por el
 * proxy de Vite. En los dos casos la clave del servicio queda del lado del servidor.
 *
 * **Nunca tira.** Cualquier problema vuelve como `{ ok: false, mensaje }` listo para mostrar: una
 * consulta que falla no puede frenar un alta, porque los datos se pueden cargar a mano.
 */
import { sesionDelDia } from './acceso/sesionDelDia'
import { obtenerSessionToken } from './monday/sesion'

export interface DatosDeArca {
  cuit: string
  razonSocial: string
  /** El código: RESPONSABLE_INSCRIPTO, MONOTRIBUTO, EXENTO, CONSUMIDOR_FINAL, NO_ALCANZADO. */
  condicionIva: string
  /** El texto como lo escribe ARCA: "IVA RESPONSABLE INSCRIPTO". */
  condicionIvaTexto: string
  domicilio: string
  localidad: string
  provincia: string
  /** ARCA no respondió y el servicio devolvió lo último que sabía. */
  datoViejo: boolean
}

export type RespuestaArca = { ok: true; datos: DatosDeArca } | { ok: false; mensaje: string }

/**
 * Cómo se traduce la condición de ARCA a la etiqueta de la columna del tablero.
 *
 * Son dos vocabularios distintos: ARCA dice "IVA RESPONSABLE INSCRIPTO" y la columna dice
 * "Responsable Inscripto". Si una etiqueta no existe en el tablero, la escritura del item falla
 * ENTERA, así que lo que no esté en este mapa se deja sin elegir y lo completa la persona.
 */
const CONDICION: Record<string, string> = {
  RESPONSABLE_INSCRIPTO: 'Responsable Inscripto',
  MONOTRIBUTO: 'Responsable Monotributista',
  EXENTO: 'Exento',
  CONSUMIDOR_FINAL: 'Consumidor FInal',
}

/** La etiqueta del tablero para una condición de ARCA, o `''` si no hay equivalente. */
export const condicionFiscalDeArca = (codigo: string, disponibles: string[]): string => {
  const etiqueta = CONDICION[codigo.toUpperCase()] ?? ''
  return etiqueta && disponibles.includes(etiqueta) ? etiqueta : ''
}

export async function consultarArca(cuit: string): Promise<RespuestaArca> {
  const digitos = cuit.replace(/\D/g, '')
  if (digitos.length !== 11) return { ok: false, mensaje: 'El CUIT tiene que tener 11 números.' }

  try {
    /* En desarrollo el proxy de Vite va directo al servicio con un GET; en producción, al
       endpoint propio, que además comprueba quién pregunta. */
    const res = import.meta.env.DEV
      ? await fetch(`/arca-api/${digitos}`)
      : await fetch('/api/arca', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await obtenerSessionToken()}`,
            ...(sesionDelDia() ? { 'X-Sesion-App': sesionDelDia()! } : {}),
          },
          body: JSON.stringify({ cuit: digitos }),
        })

    const cuerpo = (await res.json().catch(() => ({}))) as Record<string, unknown>

    if (import.meta.env.DEV) {
      if (!res.ok) {
        return {
          ok: false,
          mensaje:
            res.status === 404
              ? 'ARCA no encontró ese CUIT. Revisalo, o cargá los datos a mano.'
              : 'No se pudo consultar ARCA. Cargá los datos a mano.',
        }
      }
      const t = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
      return {
        ok: true,
        datos: {
          cuit: t(cuerpo.cuit) || digitos,
          razonSocial: t(cuerpo.razon_social),
          condicionIva: t(cuerpo.condicion_iva),
          condicionIvaTexto: t(cuerpo.condicion_iva_texto),
          domicilio: t(cuerpo.domicilio),
          localidad: t(cuerpo.localidad),
          provincia: t(cuerpo.provincia),
          datoViejo: cuerpo.dato_viejo === true,
        },
      }
    }

    if (cuerpo.ok === true) return { ok: true, datos: cuerpo.datos as DatosDeArca }
    return {
      ok: false,
      mensaje: String(cuerpo.mensaje ?? 'No se pudo consultar ARCA. Cargá los datos a mano.'),
    }
  } catch {
    return { ok: false, mensaje: 'No se pudo consultar ARCA. Cargá los datos a mano.' }
  }
}
