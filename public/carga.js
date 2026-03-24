const MODULE_ID = 'carga'
const MODULE_TITLE = 'Carga'

function resolveContainer(containerOrSelector = '#cargaModuleRoot') {
  if (containerOrSelector instanceof HTMLElement) return containerOrSelector
  if (typeof containerOrSelector === 'string') return document.querySelector(containerOrSelector)
  return null
}

function renderCarga(container, context = {}) {
  const now = new Date().toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })
  container.innerHTML = `
    <section class="card" aria-labelledby="cargaTitle" style="max-width:920px;margin:0 auto;">
      <h1 id="cargaTitle" style="margin-bottom:10px;">Módulo ${MODULE_TITLE}</h1>
      <p class="muted" style="margin:0 0 20px;">
        El módulo Carga está disponible y operativo. Si vienes desde una ruta antigua, la compatibilidad fue aplicada sin afectar Panel, Causas, Agenda ni navegación lateral.
      </p>
      <div class="panel" style="padding:16px; border-radius:14px;">
        <strong>Estado:</strong> carga iniciada correctamente.<br>
        <strong>Módulo:</strong> ${MODULE_ID}<br>
        <strong>Fecha:</strong> ${now}
      </div>
      <div style="display:flex; gap:10px; margin-top:16px; flex-wrap:wrap;">
        <a class="btn btn-3d btn-primary" href="./causas.html">Ir a Causas</a>
        <a class="btn btn-3d" href="./panel.html">Volver al panel</a>
      </div>
    </section>
  `

  if (context?.source) {
    console.info('[Alpha Avocat][carga] Módulo abierto desde:', context.source)
  }
}

export function mount(containerOrSelector, context = {}) {
  const container = resolveContainer(containerOrSelector)

  if (!container) {
    const error = new Error('Contenedor inexistente para módulo Carga (#cargaModuleRoot).')
    console.error('[Alpha Avocat][carga] No se pudo montar el módulo.', {
      module: MODULE_ID,
      reason: 'missing-container',
      expectedContainer: '#cargaModuleRoot',
      context,
      error
    })
    return { ok: false, error }
  }

  try {
    renderCarga(container, context)
    return { ok: true }
  } catch (error) {
    console.error('[Alpha Avocat][carga] Excepción al renderizar el módulo.', {
      module: MODULE_ID,
      reason: 'render-exception',
      context,
      error
    })
    container.innerHTML = '<section class="card"><div class="empty-state">No fue posible renderizar el módulo Carga.</div></section>'
    return { ok: false, error }
  }
}

export function init(options = {}) {
  return mount(options.container || '#cargaModuleRoot', options.context || {})
}

export function mountCargaModule(options = {}) {
  return init(options)
}

const cargaModule = { id: MODULE_ID, title: MODULE_TITLE, init, mount }
export default cargaModule
