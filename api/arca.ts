/**
 * `POST /api/arca` — los datos fiscales de un CUIT, para el alta de cuentas.
 *
 * Es el servicio de TAP (`arca.theautomationpartner.com`): con un CUIT devuelve razón social,
 * condición de IVA y domicilio, así que quien da de alta sólo carga lo que ARCA no sabe.
 *
 * ── Por qué pasa por acá y no se consulta desde el navegador ──
 * La clave del servicio va en una cabecera. Todo lo que corre en el navegador —incluidas las
 * variables `VITE_…`, que Vite copia adentro del código— lo puede leer cualquiera que abra la app.
 * Por eso la clave vive sólo en `process.env.ARCA_API_KEY` y esta función es la única que la toca:
 * no se devuelve, no se registra y no aparece en ningún mensaje de error.
 *
 * Y es un endpoint de datos como todos: pasa por el mismo portón que `/api/monday`, así que sólo
 * contesta a quien entró desde monday, está en la Lista Blanca y pasó el autenticador. Sin eso,
 * cualquiera podría gastar nuestra clave a través de esta función.
 */
import { porton } from './_seguridad/porton'

export const config = { runtime: 'edge' }

const SERVICIO = 'https://arca.theautomationpartner.com/api/padron/'

/** ARCA a veces tarda; más que esto y conviene cargarlo a mano. */
const ESPERA_MS = 8000

const json = (status: number, cuerpo: unknown): Response =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json(405, { ok: false, mensaje: 'Método no permitido.' })

  const paso = await porton(req)
  if (paso.rechazo) return paso.rechazo
  /* El alta de cuentas es del módulo de ventas: nadie más necesita consultar un CUIT. */
  if (!paso.modulos.includes('ventas')) {
    return json(403, { ok: false, mensaje: 'No tenés acceso a esta consulta.' })
  }

  let cuit = ''
  try {
    cuit = String(((await req.json()) as { cuit?: unknown }).cuit ?? '').replace(/\D/g, '')
  } catch {
    return json(400, { ok: false, mensaje: 'Pedido mal armado.' })
  }
  if (cuit.length !== 11) {
    return json(400, { ok: false, mensaje: 'El CUIT tiene que tener 11 números.' })
  }

  const clave = process.env.ARCA_API_KEY?.trim()
  if (!clave) {
    return json(200, {
      ok: false,
      mensaje: 'La consulta a ARCA no está configurada. Cargá los datos a mano.',
    })
  }

  const corte = new AbortController()
  const reloj = setTimeout(() => corte.abort(), ESPERA_MS)
  try {
    const res = await fetch(SERVICIO + cuit, {
      headers: { 'x-api-key': clave },
      signal: corte.signal,
    })
    const cuerpo = (await res.json().catch(() => ({}))) as Record<string, unknown>

    if (!res.ok) {
      /* El 401 es NUESTRO problema —la clave— y no del usuario: no se le explica la clave. */
      const mensaje =
        res.status === 401
          ? 'La consulta a ARCA no está disponible ahora. Cargá los datos a mano.'
          : res.status === 429
            ? 'Se hicieron muchas consultas a ARCA recién. Probá en un rato o cargá los datos a mano.'
            : res.status === 404
              ? 'ARCA no encontró ese CUIT. Revisalo, o cargá los datos a mano.'
              : texto(cuerpo.mensaje) || 'ARCA no devolvió los datos. Cargá los datos a mano.'
      return json(200, { ok: false, mensaje })
    }

    return json(200, {
      ok: true,
      datos: {
        cuit: texto(cuerpo.cuit) || cuit,
        razonSocial: texto(cuerpo.razon_social),
        condicionIva: texto(cuerpo.condicion_iva),
        condicionIvaTexto: texto(cuerpo.condicion_iva_texto),
        domicilio: texto(cuerpo.domicilio),
        localidad: texto(cuerpo.localidad),
        provincia: texto(cuerpo.provincia),
        /* ARCA no contestó y el servicio devolvió lo último que sabía: se avisa, porque un dato
           viejo puede ser de antes de una mudanza o de un cambio de condición. */
        datoViejo: cuerpo.dato_viejo === true,
      },
    })
  } catch (e) {
    const tarde = (e as Error).name === 'AbortError'
    return json(200, {
      ok: false,
      mensaje: tarde
        ? 'ARCA está tardando en contestar. Cargá los datos a mano o probá de nuevo.'
        : 'No se pudo consultar ARCA. Cargá los datos a mano.',
    })
  } finally {
    clearTimeout(reloj)
  }
}
