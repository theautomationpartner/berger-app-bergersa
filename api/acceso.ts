/**
 * Ingreso a la app: Lista Blanca y autenticador (TOTP).
 *
 * Un solo endpoint con cuatro acciones, que el frontend recorre como un asistente:
 *
 *   estado     → ¿qué le falta a este usuario para entrar? (configurar / código / nada)
 *   iniciar    → primera vez: genera el secreto y devuelve lo necesario para el QR
 *   confirmar  → primera vez: valida el primer código, activa el secreto y entrega los códigos de
 *                recuperación. Con `clave`, activa una clave que el usuario YA tenía (sólo ADMIN)
 *   verificar  → cada día: valida el código de 6 dígitos (o uno de recuperación)
 *
 * Las que terminan bien devuelven la sesión del día, que después exigen los proxies de datos.
 *
 * Hacia afuera, cualquier rechazo de acceso es el mismo `{ estado: 'sin_acceso' }`, sin importar
 * el motivo. El motivo real queda en el Registro de Accesos.
 */
import { MalConfigurado, NoAutorizado, verificarSesion, type SesionMonday } from './_guard'
import {
  AccesoDenegado,
  identidadHabilitada,
  puedeImportarClave,
  sesionAlcanza,
} from './_seguridad/acceso'
import {
  consumirCodigoRecuperacion,
  estaBloqueado,
  generarCodigosRecuperacion,
  guardarAutenticador,
  intentosVigentes,
  leerAutenticador,
  type EstadoAutenticador,
} from './_seguridad/autenticador'
import { configSeguridad, MAX_INTENTOS } from './_seguridad/config'
import {
  cifrar,
  descifrar,
  desdeBase32,
  ErrorDeConfiguracion,
  nuevoSecretoTotp,
  verificarTotp,
} from './_seguridad/cripto'
import { emailDeUsuario, type Perfil } from './_seguridad/listaBlanca'
import { modulosDelPerfil, type Modulo } from './_seguridad/modulos'
import { ipDe, registrar } from './_seguridad/registro'
import { emitirSesion, verificarSesionApp } from './_seguridad/sesionApp'

export const config = { runtime: 'edge' }

const EMISOR = 'BERGER S.A.'

type Accion = 'estado' | 'iniciar' | 'confirmar' | 'verificar'

interface Pedido {
  accion?: Accion
  codigo?: string
  /** `true` si `codigo` es un código de recuperación y no uno de 6 dígitos. */
  recuperacion?: boolean
  /** Clave de autenticador que el usuario ya tiene (1Password). Sólo ADMIN. */
  clave?: string
}

const json = (status: number, cuerpo: unknown): Response =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

/** El único rechazo que ve el usuario. Idéntico para todos los motivos. */
const sinAcceso = () => json(403, { estado: 'sin_acceso' })

/** Lo mínimo de un perfil que necesita la pantalla. Nada de la configuración de acceso. */
/**
 * Lo que la app sabe del perfil.
 *
 * Va el equipo además del nombre porque la venta lo necesita: un pedido se firma con el
 * concesionario que lo carga, y ese dato tiene que salir del servidor. Si lo eligiera la pantalla,
 * un comercial podría cargar un pedido a nombre de otro concesionario.
 */
const publico = (p: Perfil) => ({
  id: p.id,
  nombre: p.nombre,
  equipos: p.teams,
  equipoId: p.idTeam,
})

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json(405, { estado: 'error' })
  const ip = ipDe(req)

  let pedido: Pedido
  try {
    pedido = (await req.json()) as Pedido
  } catch {
    return json(400, { estado: 'error' })
  }

  /* 1. ¿Viene de monday, con un usuario real de la cuenta de BERGER? */
  let sesionMonday: SesionMonday
  try {
    sesionMonday = await verificarSesion(req.headers.get('authorization'))
  } catch (e) {
    if (e instanceof MalConfigurado) {
      console.error('[acceso] configuración:', e.message)
      return json(500, { estado: 'error' })
    }
    const rechazo = e instanceof NoAutorizado ? e : null
    await registrar('Acceso denegado', {
      usuarioId: rechazo?.usuarioId,
      cuentaId: rechazo?.cuentaId,
      ip,
      detalle: rechazo?.message ?? 'Token de sesión de monday inválido.',
    })
    return sinAcceso()
  }

  const usuarioId = String(sesionMonday.userId)

  try {
    const { appId } = configSeguridad()

    /* 2. ¿Está en la Lista Blanca, activo y con esta app? */
    let perfil: Perfil
    try {
      perfil = await identidadHabilitada(usuarioId)
    } catch (e) {
      if (!(e instanceof AccesoDenegado)) throw e
      await registrar('Acceso denegado', {
        usuarioId,
        email: await emailDeUsuario(usuarioId),
        cuentaId: sesionMonday.accountId,
        ip,
        detalle: e.detalle,
      })
      return sinAcceso()
    }

    const base = {
      usuarioId,
      perfil: perfil.nombre,
      email: perfil.email,
      cuentaId: sesionMonday.accountId,
      ip,
    }

    /* 2b. Qué módulos le corresponden. Es el único momento en que se comprueba el equipo de
       monday: de ahí en adelante viaja firmado en la sesión del día. Sin ningún módulo no hay
       nada que mostrarle, así que es un rechazo más —igual de genérico que los otros—. */
    const modulos = await modulosDelPerfil(perfil, usuarioId)
    if (modulos.length === 0) {
      await registrar('Acceso denegado', {
        ...base,
        detalle: 'Sin módulos: el equipo de la Lista Blanca no coincide con el de monday.',
      })
      return sinAcceso()
    }

    const nuevaSesion = (mfa: boolean) =>
      emitirSesion({ uid: usuarioId, pid: perfil.id, app: appId, mfa, mods: modulos })

    /* 3. ¿Ya entró hoy? */
    const tokenPrevio = req.headers.get('x-sesion-app')
    const previa = await verificarSesionApp(tokenPrevio, usuarioId, appId)
    if (previa && sesionAlcanza(previa, perfil)) {
      /* Se vuelve a emitir con los módulos de AHORA, conservando que ya pasó el autenticador.
         Reusar el token tal cual dejaba sin nada a quien tenía abierta una sesión emitida antes de
         que existieran los módulos: la pantalla de operaciones le quedaba vacía hasta el día
         siguiente. Recalcularlos no afloja nada —el perfil se acaba de releer— y cualquier cambio
         de equipo se aplica en el acto, sin obligar a pedir el código de nuevo. */
      return json(200, {
        estado: 'listo',
        perfil: publico(perfil),
        sesion: await emitirSesion({
          uid: usuarioId,
          pid: perfil.id,
          app: appId,
          mfa: previa.mfa,
          mods: modulos,
        }),
        modulos,
      })
    }

    /* 4. Autenticador desactivado por el admin: entra sin código, y queda registrado. */
    if (perfil.autenticadorDesactivado) {
      await registrar('Ingreso sin autenticador', { ...base, detalle: 'Autenticador desactivado en la Lista Blanca.' })
      return json(200, {
        estado: 'listo',
        perfil: publico(perfil),
        sesion: await nuevaSesion(false),
        modulos,
      })
    }

    // El autenticador es del USUARIO de monday, no de la fila: la cuenta que comparten los
    // administradores tiene uno solo, con el mismo código para todos.
    const autenticador = await leerAutenticador(usuarioId)

    switch (pedido.accion) {
      case 'estado':
        return json(200, {
          estado: autenticador?.secretoCifrado ? 'verificar' : 'configurar',
          perfil: publico(perfil),
          puedeImportar: puedeImportarClave(perfil),
        })

      /*
       * `return await` y no `return` a secas: devolver la promesa sin esperarla la saca del
       * alcance del `try`, y cualquier error de adentro —un secreto que no descifra, monday
       * caído— escapa del manejador. El usuario recibiría el error crudo del hosting en vez de
       * la respuesta controlada, y el motivo no quedaría en el log.
       */
      case 'iniciar':
        return await iniciar(perfil, usuarioId, autenticador)

      case 'confirmar':
        return await confirmar(perfil, usuarioId, autenticador, pedido, base, nuevaSesion, modulos)

      case 'verificar':
        return await verificar(perfil, usuarioId, autenticador, pedido, base, nuevaSesion, modulos)

      default:
        return json(400, { estado: 'error' })
    }
  } catch (e) {
    // Errores de configuración o de monday: se registran en el log del servidor y hacia afuera
    // se contesta sin detalles. Un stack trace en la respuesta es un mapa del sistema.
    console.error('[acceso]', e instanceof ErrorDeConfiguracion ? e.message : e)
    return json(500, { estado: 'error' })
  }
}

type Base = Parameters<typeof registrar>[1]
type EmitirSesion = (mfa: boolean) => Promise<string>

/** Datos de la fila del autenticador. El nombre es el de la fila de la Lista Blanca. */
const filaDe = (perfil: Perfil, usuarioId: string) => ({
  id: perfil.id,
  nombre: perfil.nombre,
  usuarioId,
})

/* ------------------------------------------------------------------ *
 * Primera vez: QR y confirmación
 * ------------------------------------------------------------------ */

async function iniciar(
  perfil: Perfil,
  usuarioId: string,
  autenticador: EstadoAutenticador | null,
): Promise<Response> {
  // Con un secreto ya confirmado NO se genera otro: si se pudiera, cualquiera con la sesión de
  // monday de esta persona podría registrar su propio celular. Resetearlo es tarea del admin
  // (borrando la fila en el tablero del autenticador).
  if (autenticador?.secretoCifrado) return json(409, { estado: 'verificar', perfil: publico(perfil) })

  const secreto = nuevoSecretoTotp()
  await guardarAutenticador(filaDe(perfil, usuarioId), autenticador, {
    pendienteCifrado: await cifrar(secreto),
  })

  const cuenta = perfil.nombreCompleto || perfil.nombre
  const etiqueta = encodeURIComponent(`${EMISOR}:${cuenta}`)
  const otpauth =
    `otpauth://totp/${etiqueta}?secret=${secreto}&issuer=${encodeURIComponent(EMISOR)}` +
    '&algorithm=SHA1&digits=6&period=30'

  return json(200, {
    estado: 'configurar',
    perfil: publico(perfil),
    otpauth,
    secreto,
    puedeImportar: puedeImportarClave(perfil),
  })
}

/**
 * Confirma el autenticador con el primer código.
 *
 * De dónde sale el secreto depende de si vino una `clave`:
 *
 * - Sin `clave`: es el que generó la app y quedó pendiente, esperando que el usuario escanee el QR.
 * - Con `clave`: es una que el usuario YA tenía —la del gestor de contraseñas del equipo—. Sólo
 *   para ADMIN, y el código tiene que coincidir igual: eso prueba que la clave se pegó completa y
 *   que es la que realmente está generando los códigos.
 */
async function confirmar(
  perfil: Perfil,
  usuarioId: string,
  autenticador: EstadoAutenticador | null,
  pedido: Pedido,
  base: Base,
  nuevaSesion: EmitirSesion,
  modulos: Modulo[],
): Promise<Response> {
  if (autenticador?.secretoCifrado) return json(409, { estado: 'verificar', perfil: publico(perfil) })

  const importada = typeof pedido.clave === 'string' && pedido.clave.trim() !== ''
  if (importada && !puedeImportarClave(perfil)) return sinAcceso()

  let secreto: string
  if (importada) {
    const limpia = (pedido.clave ?? '').replace(/[\s-]/g, '').toUpperCase()
    try {
      // Que descodifique en base32 y tenga largo suficiente. Un secreto corto sería trivial de
      // adivinar, y el error más común al pegar es que falte un pedazo.
      if (desdeBase32(limpia).length < 10) throw new Error('corta')
    } catch {
      return json(400, { error: 'clave_invalida' })
    }
    secreto = limpia
  } else {
    if (!autenticador?.pendienteCifrado) return json(409, { estado: 'configurar', perfil: publico(perfil) })
    secreto = await descifrar(autenticador.pendienteCifrado)
  }

  if (estaBloqueado(autenticador)) {
    await registrar('Bloqueado por intentos', { ...base, detalle: 'Al configurar el autenticador.' })
    return json(429, { error: 'bloqueado' })
  }

  const periodo = await verificarTotp(secreto, pedido.codigo ?? '')
  if (periodo === null) {
    return fallo(
      perfil,
      usuarioId,
      autenticador,
      base,
      importada ? 'Código incorrecto al importar una clave existente.' : 'Código incorrecto al configurar el autenticador.',
    )
  }

  const { codigos, hashes } = await generarCodigosRecuperacion()
  await guardarAutenticador(filaDe(perfil, usuarioId), autenticador, {
    // Sin clave importada, el secreto confirmado es el MISMO texto cifrado que estaba pendiente:
    // no hace falta descifrarlo y volver a cifrarlo para moverlo de columna.
    secretoCifrado: importada ? await cifrar(secreto) : (autenticador?.pendienteCifrado ?? ''),
    pendienteCifrado: '',
    recuperacion: hashes,
    ultimoPeriodo: periodo,
    intentos: [],
    configuradoHoy: true,
  })
  await registrar('Autenticador configurado', {
    ...base,
    detalle: importada ? 'Con una clave existente (gestor de contraseñas).' : 'Escaneando el QR.',
  })

  return json(200, {
    estado: 'listo',
    perfil: publico(perfil),
    sesion: await nuevaSesion(true),
    codigosRecuperacion: codigos,
    modulos,
  })
}

/* ------------------------------------------------------------------ *
 * Cada día: código de 6 dígitos o de recuperación
 * ------------------------------------------------------------------ */

async function verificar(
  perfil: Perfil,
  usuarioId: string,
  autenticador: EstadoAutenticador | null,
  pedido: Pedido,
  base: Base,
  nuevaSesion: EmitirSesion,
  modulos: Modulo[],
): Promise<Response> {
  if (!autenticador?.secretoCifrado) return json(409, { estado: 'configurar', perfil: publico(perfil) })

  if (estaBloqueado(autenticador)) {
    await registrar('Bloqueado por intentos', { ...base, detalle: 'Intentó ingresar estando bloqueado.' })
    return json(429, { error: 'bloqueado' })
  }

  const codigo = pedido.codigo ?? ''

  if (pedido.recuperacion) {
    const restantes = await consumirCodigoRecuperacion(autenticador, codigo)
    if (!restantes) {
      return fallo(perfil, usuarioId, autenticador, base, 'Código de recuperación incorrecto.')
    }

    await guardarAutenticador(filaDe(perfil, usuarioId), autenticador, {
      recuperacion: restantes,
      intentos: [],
    })
    await registrar('Código de recuperación usado', {
      ...base,
      detalle: `Le quedan ${restantes.length} códigos de recuperación.`,
    })
    return json(200, {
      estado: 'listo',
      perfil: publico(perfil),
      sesion: await nuevaSesion(true),
      recuperacionRestantes: restantes.length,
      modulos,
    })
  }

  const periodo = await verificarTotp(await descifrar(autenticador.secretoCifrado), codigo)
  if (periodo === null) return fallo(perfil, usuarioId, autenticador, base, 'Código incorrecto.')

  // Anti-reutilización: un código ya aceptado —o uno anterior— no vuelve a servir. Sin esto,
  // alguien que vea el código por encima del hombro tiene 30 segundos para usarlo también.
  //
  // Con la cuenta compartida esto tiene una consecuencia buscada: si dos personas entran con el
  // mismo código dentro de los mismos 30 segundos, la segunda tiene que esperar al siguiente.
  if (periodo <= autenticador.ultimoPeriodo) {
    return fallo(perfil, usuarioId, autenticador, base, 'Código ya utilizado.')
  }

  await guardarAutenticador(filaDe(perfil, usuarioId), autenticador, {
    ultimoPeriodo: periodo,
    intentos: [],
  })
  await registrar('Ingreso OK', base)
  return json(200, {
    estado: 'listo',
    perfil: publico(perfil),
    sesion: await nuevaSesion(true),
    modulos,
  })
}

/**
 * Código rechazado: suma el intento, lo registra y avisa si con éste quedó bloqueado.
 *
 * El motivo exacto —incorrecto, ya usado, de recuperación— queda en el registro; al usuario le
 * llega siempre "código incorrecto". Distinguir "ya usado" le diría a un atacante que acertó.
 */
async function fallo(
  perfil: Perfil,
  usuarioId: string,
  autenticador: EstadoAutenticador | null,
  base: Base,
  detalle: string,
): Promise<Response> {
  const intentos = [...intentosVigentes(autenticador), Date.now()]
  await guardarAutenticador(filaDe(perfil, usuarioId), autenticador, { intentos })
  await registrar('Código incorrecto', { ...base, detalle })

  if (intentos.length >= MAX_INTENTOS) {
    await registrar('Bloqueado por intentos', { ...base, detalle: `${intentos.length} intentos en 15 minutos.` })
    return json(429, { error: 'bloqueado' })
  }
  return json(400, { error: 'codigo_incorrecto', intentosRestantes: MAX_INTENTOS - intentos.length })
}
