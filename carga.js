const MODULE_ID = 'carga'
const MODULE_TITLE = 'Carga manual'

function resolveContainer(containerOrSelector = '#cargaModuleRoot') {
  if (containerOrSelector instanceof HTMLElement) return containerOrSelector
  if (typeof containerOrSelector === 'string') return document.querySelector(containerOrSelector)
  return null
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const MANUAL_FLOW_STEPS = [
  {
    title: 'Descargar Excel manualmente',
    detail: 'Obtén el archivo desde la fuente externa bajo responsabilidad del usuario. Alpha Avocat no abre sesiones ni automatiza navegación externa.'
  },
  {
    title: 'Cargar Excel depurado',
    detail: 'Usa el módulo Causas para subir un Excel de un tribunal por archivo, revisar vista previa y procesar solo datos validados.'
  },
  {
    title: 'Poblar expedientes controladamente',
    detail: 'Las causas se organizan por Tribunal y Rol en Expedientes Digitales, sin sincronizaciones masivas ni descargas automáticas.'
  },
  {
    title: 'Trabajar documentos y Producción',
    detail: 'Carga documentos manuales, consulta el Índice General y genera escritos desde Producción con información interna.'
  }
]

function renderManualFlow() {
  return MANUAL_FLOW_STEPS.map((step, index) => `
    <article class="manual-flow-step">
      <div class="manual-flow-index">${index + 1}</div>
      <div>
        <h3>${escapeHtml(step.title)}</h3>
        <p>${escapeHtml(step.detail)}</p>
      </div>
    </article>
  `).join('')
}

export function mountCargaModule({ container = '#cargaModuleRoot', context = {} } = {}) {
  const root = resolveContainer(container)
  if (!root) return { ok: false, error: new Error('No se encontró el contenedor del módulo Carga.') }

  root.innerHTML = `
    <section class="card" style="max-width:1040px;margin:0 auto;display:grid;gap:16px;">
      <div>
        <p class="eyebrow">${escapeHtml(MODULE_TITLE)}</p>
        <h1>Actualización manual mediante Excel</h1>
        <p class="muted">Alpha Avocat opera sin dependencia estructural del Poder Judicial: no sincroniza, no navega sitios externos, no ejecuta crawlers y no descarga documentos automáticamente.</p>
      </div>

      <div class="helper-box">
        Flujo vigente: descarga manual del Excel → carga manual y validada → poblamiento controlado de causas → trabajo interno en Expedientes Digitales.
      </div>

      <div class="manual-flow-grid">
        ${renderManualFlow()}
      </div>

      <div class="actions" style="display:flex;gap:10px;flex-wrap:wrap;">
        <a class="btn btn-primary" href="./causas.html">Abrir Causas y cargar Excel</a>
        <a class="btn" href="./expedientes-digitales.html#indice-general">Abrir Índice General</a>
        <a class="btn" href="./produccion.html">Ir a Producción</a>
      </div>

      <div class="helper-box">
        Contexto de apertura: ${escapeHtml(context?.source || 'direct-link')}. Este módulo conserva solo carga manual, control documental interno e índice por tribunal/rol.
      </div>
    </section>
  `

  return { ok: true, moduleId: MODULE_ID }
}

export function init(options = {}) {
  return mountCargaModule(options)
}

export default {
  id: MODULE_ID,
  title: MODULE_TITLE,
  init,
  mount: mountCargaModule
}
