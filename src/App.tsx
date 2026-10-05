import { useState } from 'react'
import { BarraMarca } from '@/components/ui/BarraMarca'
import { PantallaSinAcceso, PantallaVerificando } from '@/components/ui/PantallaSinAcceso'
import { clienteVistaPrevia } from '@/features/acceso/clienteVistaPrevia'
import { Ingreso, type SesionIngreso } from '@/features/acceso/Ingreso'
import { ActualizarDespachos } from '@/features/aduana/ActualizarDespachos'
import { ActualizarContenedores } from '@/features/aduana/ActualizarContenedores'
import { ActualizarOpBerger } from '@/features/aduana/ActualizarOpBerger'
import { RegistroUsuario } from '@/features/usuarios/RegistroUsuario'
import { ActualizarTurnos } from '@/features/aduana/ActualizarTurnos'
import { DashboardDespachos } from '@/features/aduana/DashboardDespachos'
import { DespachoAnticipado } from '@/features/anticipado/DespachoAnticipado'
import { ConfirmarProponerFecha } from '@/features/fechas/ConfirmarProponerFecha'
import { EnviarConfirmacion } from '@/features/fechas/EnviarConfirmacion'
import { DashboardDrafts } from '@/features/drafts/DashboardDrafts'
import { EnviarPlanificacion } from '@/features/drafts/EnviarPlanificacion'
import { PlanificarPeriodo } from '@/features/drafts/PlanificarPeriodo'
import { Migas, type Miga } from '@/features/inicio/Migas'
import { Buscador } from '@/features/inicio/Buscador'
import { PanelLateral } from '@/features/inicio/PanelLateral'
import { AltaCuentasContactos } from '@/features/ventas/AltaCuentasContactos'
import { Actividades } from '@/features/ventas/Actividades'
import { PanelOpciones } from '@/features/inicio/PanelOpciones'
import { DespachoVista } from '@/features/vista/DespachoVista'
import { useAccesoMonday } from '@/hooks/useAccesoMonday'
import {
  aduanaDeModulos,
  areasDeModulos,
  AREAS,
  MODALIDADES_DESPACHO,
  OPERACIONES_ADUANA,
  OPERACIONES_DRAFTS,
  OPERACIONES_FECHAS,
  OPERACIONES_PRINCIPALES,
  principalesDeArea,
  SECCIONES_ADUANA,
  puedeEnAduana,
} from '@/lib/navegacion'
import { destinosDe, RUTA_INICIO, type Destino, type Ruta } from '@/lib/catalogo'
import { clienteIngreso } from '@/services/acceso/cliente'
import { MODULOS_APP } from '@/services/monday/operaciones'
import { mondayHabilitado } from '@/services/monday/sdk'
import type { AreaApp } from '@/types'

const TITULO = 'Importación Berger S.A.'
const SUBTITULO = 'Tractores · BERGER S.A.'

/**
 * En desarrollo, `?vista-previa` en la URL recorre las pantallas del ingreso con un servidor
 * simulado. Sin eso, en localhost se entra directo: ahí no corren las funciones de `api/`.
 * `import.meta.env.DEV` es `false` literal en el build de producción, así que esta rama —y el
 * cliente simulado— desaparecen del bundle publicado.
 */
const VISTA_PREVIA_INGRESO =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('vista-previa')

/**
 * Vista de tablero de BERGER S.A. — Importación Berger S.A. (operaciones sobre el inventario de
 * tractores).
 *
 * Tres barreras, en orden, y ninguna dibuja la app hasta que pasa:
 *
 *   1. monday   — ¿se abrió dentro del monday de BERGER?            (navegador, `useAccesoMonday`)
 *   2. ingreso  — ¿está en la Lista Blanca y pasó el autenticador? (servidor, `Ingreso`)
 *   3. datos    — cada pedido vuelve a comprobar las dos anteriores (servidor, `api/_seguridad`)
 *
 * Las dos primeras deciden QUÉ PANTALLA se ve. La que decide si se puede leer o escribir un dato
 * es la tercera, y está en el servidor: esconder la interfaz sin eso sería una cortina, no una
 * puerta.
 */
export function App() {
  const { acceso, usuarioId } = useAccesoMonday()

  if (acceso === 'verificando') return <PantallaVerificando />
  if (acceso === 'fuera-de-monday') return <PantallaSinAcceso motivo="fuera-de-monday" />
  if (acceso === 'sin-acceso') return <PantallaSinAcceso motivo="sin-acceso" />

  if (import.meta.env.DEV && !VISTA_PREVIA_INGRESO) {
    return (
      <AppAdentro
        sesion={{
          perfil: { id: 'desarrollo', nombre: 'Desarrollo local' },
          modulos: [...MODULOS_APP],
          salir: () => {},
          recuperacionRestantes: null,
        }}
      />
    )
  }

  return (
    <Ingreso
      cliente={import.meta.env.DEV ? clienteVistaPrevia : clienteIngreso}
      usuarioId={usuarioId}
    >
      {(sesion) => <AppAdentro sesion={sesion} />}
    </Ingreso>
  )
}

/**
 * La app propiamente dicha, una vez adentro.
 *
 * La navegación tiene tres niveles —operación principal, operación y etapa— y cada uno se elige en
 * su propia pantalla. El estado de cada nivel se descarta al volver al anterior: la operación se
 * desmonta entera, y con ella cualquier selección a medio hacer.
 *
 * Qué operaciones principales existen depende de los módulos que el servidor le dio a este perfil:
 * la gente de BERGER ve DESPACHO, el despachante de aduana ve sólo DESPACHANTE DE ADUANA, y
 * Administración ve las dos.
 */
function AppAdentro({ sesion }: { sesion: SesionIngreso }) {
  /* Un solo objeto y no cinco estados sueltos: así el buscador y el panel lateral pueden saltar
     a cualquier pantalla con un `setRuta`, sin tener que acordarse de limpiar los otros cuatro. */
  const [ruta, setRuta] = useState<Ruta>(RUTA_INICIO)
  const [lateralAbierto, setLateralAbierto] = useState(false)

  const {
    area,
    principal,
    modalidad,
    aduana: operacionAduana,
    drafts: operacionDrafts,
    fechas: operacionFechas,
  } = ruta

  const areas = areasDeModulos(sesion.modulos)
  const operacionesAduana = aduanaDeModulos(sesion.modulos)
  const destinos = destinosDe(sesion.modulos)

  const irA = (d: Destino) => setRuta(d.ruta)
  const irAlArea = (id: AreaApp) => setRuta({ ...RUTA_INICIO, area: id })
  const elegirPrincipal = (id: (typeof OPERACIONES_PRINCIPALES)[number]['id']) =>
    setRuta((v) => ({ ...RUTA_INICIO, area: v.area, principal: id }))

  const barra = (
    <BarraMarca
      titulo={TITULO}
      subtitulo={SUBTITULO}
      perfil={sesion.perfil.nombre}
      onSalir={import.meta.env.DEV && !VISTA_PREVIA_INGRESO ? undefined : sesion.salir}
    />
  )

  /* Único caso de desarrollo: la app corre en localhost sin token en `.env.local`. */
  if (!mondayHabilitado()) {
    return (
      <div className="app">
        {barra}
        <div className="scroll">
          <div className="view">
            <div className="aviso aviso--error">
              <i className="fa-solid fa-key" aria-hidden="true" />
              <span>
                Falta el token de Monday. Copiá <code>.env.example</code> a <code>.env.local</code>,
                completá <code>VITE_MONDAY_TOKEN</code> y reiniciá <code>npm run dev</code>.
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const irAlInicio = () => setRuta(RUTA_INICIO)
  const volverAlArea = () => setRuta((v) => ({ ...RUTA_INICIO, area: v.area }))
  const volverAlPrincipal = () =>
    setRuta((v) => ({ ...RUTA_INICIO, area: v.area, principal: v.principal }))

  /**
   * Un paso atrás: al panel del nivel anterior.
   *
   * La miga de pan ya decía dónde estaba parado el usuario, pero para volver había que apuntarle a
   * un renglón de texto chico. Dentro del iframe de monday el "atrás" del navegador no sirve, y en
   * el celular directamente no existe, así que sin un botón la única salida era recargar la app.
   */
  const volverAtras = () => {
    if (operacionAduana || operacionDrafts || operacionFechas || modalidad)
      return volverAlPrincipal()
    if (principal) return volverAlArea()
    irAlInicio()
  }

  const defArea = AREAS.find((a) => a.id === area)
  const defPrincipal = OPERACIONES_PRINCIPALES.find((o) => o.id === principal)
  const defSegundo =
    MODALIDADES_DESPACHO.find((m) => m.id === modalidad) ??
    OPERACIONES_ADUANA.find((o) => o.id === operacionAduana) ??
    OPERACIONES_DRAFTS.find((o) => o.id === operacionDrafts) ??
    OPERACIONES_FECHAS.find((o) => o.id === operacionFechas)

  const migas: Miga[] = [{ rotulo: 'Operaciones', onIr: irAlInicio }]
  if (defArea) migas.push({ rotulo: defArea.corto, onIr: volverAlArea })
  if (defPrincipal) migas.push({ rotulo: defPrincipal.corto, onIr: volverAlPrincipal })
  if (defSegundo) migas.push({ rotulo: defSegundo.corto })

  /* El destino actual, para marcarlo en el panel lateral. */
  const idActual = destinos.find(
    (d) =>
      d.ruta.principal === principal &&
      d.ruta.modalidad === modalidad &&
      d.ruta.aduana === operacionAduana &&
      d.ruta.drafts === operacionDrafts &&
      d.ruta.fechas === operacionFechas,
  )?.id

  return (
    <div className="app">
      {barra}

      {/* Entró con un código de recuperación: probablemente perdió el celular. Se le avisa cuántos
          le quedan y qué hacer, en vez de dejarlo descubrirlo el día que se le terminan. */}
      {sesion.recuperacionRestantes != null && (
        <div className="aviso aviso--alerta aviso--banda">
          <i className="fa-solid fa-life-ring" aria-hidden="true" />
          <span>
            Entraste con un código de recuperación. Te{' '}
            {sesion.recuperacionRestantes === 1
              ? 'queda 1'
              : `quedan ${sesion.recuperacionRestantes}`}
            . Si perdiste el celular, pedile a un administrador que te reinicie la verificación.
          </span>
        </div>
      )}

      <div className="navbar">
        <div className="view navbar-in">
          <button
            type="button"
            className="navbar-btn"
            aria-label="Abrir el menú de operaciones"
            onClick={() => setLateralAbierto(true)}
          >
            <i className="fa-solid fa-bars" aria-hidden="true" />
            <span className="navbar-btn-txt">Operaciones</span>
          </button>

          {/* "Atrás" sólo existe si hay a dónde volver: un botón que no hace nada es peor que no
              tenerlo, porque hay que probarlo para descubrirlo. */}
          {area && (
            <button type="button" className="navbar-btn" onClick={volverAtras}>
              <i className="fa-solid fa-arrow-left" aria-hidden="true" />
              <span className="navbar-btn-txt">Atrás</span>
            </button>
          )}
          {area && (
            <button type="button" className="navbar-btn" onClick={irAlInicio}>
              <i className="fa-solid fa-house" aria-hidden="true" />
              <span className="navbar-btn-txt">Inicio</span>
            </button>
          )}

          <Migas migas={migas} />
        </div>
      </div>

      <PanelLateral
        abierto={lateralAbierto}
        onCerrar={() => setLateralAbierto(false)}
        destinos={destinos}
        onIr={irA}
        actual={idActual}
      />

      {area === null && (
        <div className="scroll">
          <div className="view">
            <div className="panel-head">
              <h1 className="panel-tit">¿Qué vas a hacer?</h1>
              <p className="panel-det">
                Elegí el área, o buscá directamente la operación que necesitás.
              </p>
            </div>

            <Buscador destinos={destinos} onIr={irA} />

            <div className="panel-opciones panel-opciones--areas">
              {areas.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="panel-opcion panel-opcion--area"
                  onClick={() => irAlArea(a.id)}
                >
                  <span className="panel-opcion-ic">
                    <i className={a.icono} aria-hidden="true" />
                  </span>
                  <span className="panel-opcion-txt">
                    <span className="panel-opcion-tit">{a.titulo}</span>
                    <span className="panel-opcion-det">{a.detalle}</span>
                  </span>
                  <i className="fa-solid fa-chevron-right panel-opcion-flecha" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {area !== null && principal === null && (
        <PanelOpciones
          titulo={defArea?.titulo ?? ''}
          detalle={defArea?.detalle ?? ''}
          opciones={principalesDeArea(sesion.modulos, area)}
          onElegir={elegirPrincipal}
        />
      )}

      {principal === 'despacho' && modalidad === null && (
        <PanelOpciones
          titulo="Despacho"
          detalle="Elegí cómo se despachan los tractores."
          opciones={MODALIDADES_DESPACHO}
          onElegir={(id) => setRuta((v) => ({ ...v, modalidad: id }))}
        />
      )}

      {principal === 'despacho' && modalidad === 'anticipado' && <DespachoAnticipado />}
      {principal === 'despacho' && modalidad === 'vista' && <DespachoVista />}

      {principal === 'fechas' && operacionFechas === null && (
        <PanelOpciones
          titulo="Fechas de producción"
          detalle="El ida y vuelta con el proveedor por la fecha de cada tractor."
          opciones={OPERACIONES_FECHAS}
          onElegir={(id) => setRuta((v) => ({ ...v, fechas: id }))}
        />
      )}

      {principal === 'usuarios' && <RegistroUsuario />}

      {principal === 'clientes' && <AltaCuentasContactos />}

      {principal === 'actividades' && <Actividades />}

      {principal === 'fechas' && operacionFechas === 'confirmar' && <ConfirmarProponerFecha />}
      {principal === 'fechas' && operacionFechas === 'enviar' && <EnviarConfirmacion />}

      {principal === 'drafts' && operacionDrafts === null && (
        <PanelOpciones
          titulo="Planificación de drafts"
          detalle="Lo que pasa antes de que el tractor exista: qué se pide y para cuándo."
          opciones={OPERACIONES_DRAFTS}
          onElegir={(id) => setRuta((v) => ({ ...v, drafts: id }))}
        />
      )}

      {principal === 'drafts' && operacionDrafts === 'planificar' && <PlanificarPeriodo />}
      {principal === 'drafts' && operacionDrafts === 'enviar' && <EnviarPlanificacion />}
      {principal === 'drafts' && operacionDrafts === 'dashboard' && <DashboardDrafts />}

      {principal === 'aduana' && operacionAduana === null && (
        <PanelOpciones
          titulo="Despacho de aduana"
          detalle="Seguimiento de las OP que ya salieron del circuito de despacho."
          opciones={operacionesAduana}
          secciones={SECCIONES_ADUANA}
          onElegir={(id) => setRuta((v) => ({ ...v, aduana: id }))}
        />
      )}

      {principal === 'aduana' &&
        operacionAduana === 'actualizar' &&
        puedeEnAduana(sesion.modulos, 'actualizar') && <ActualizarDespachos />}
      {principal === 'aduana' &&
        operacionAduana === 'berger' &&
        puedeEnAduana(sesion.modulos, 'berger') && <ActualizarOpBerger />}
      {principal === 'aduana' &&
        operacionAduana === 'turnos' &&
        puedeEnAduana(sesion.modulos, 'turnos') && <ActualizarTurnos />}
      {principal === 'aduana' &&
        operacionAduana === 'contenedores' &&
        puedeEnAduana(sesion.modulos, 'contenedores') && <ActualizarContenedores />}
      {principal === 'aduana' &&
        operacionAduana === 'dashboard' &&
        puedeEnAduana(sesion.modulos, 'dashboard') && <DashboardDespachos />}
    </div>
  )
}
