const MODULE_ID = 'carga'
const MODULE_TITLE = 'Carga'
const STORAGE_KEY = 'alpha-carga-jobs-v1'

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

function readJobs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.warn('[Alpha Avocat][carga] No fue posible recuperar historial de cargas.', error)
    return []
  }
}

function persistJobs(jobs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs.slice(0, 80)))
}

function buildJobFromInput(file, category, source = 'manual') {
  const now = new Date()
  return {
    id: (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
    category,
    source,
    createdAt: now.toISOString(),
    createdAtLabel: now.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' }),
    status: 'Completada'
  }
}

function formatBytes(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const level = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / (1024 ** level)
  return `${value.toFixed(level === 0 ? 0 : 1)} ${units[level]}`
}

function renderJobRows(jobs) {
  if (!jobs.length) {
    return '<tr><td colspan="6" class="muted">Sin cargas registradas todavía.</td></tr>'
  }

  return jobs.map((job, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(job.name)}</td>
      <td>${escapeHtml(job.category)}</td>
      <td>${escapeHtml(job.type)}</td>
      <td>${formatBytes(job.size)}</td>
      <td>${escapeHtml(job.createdAtLabel)}</td>
    </tr>
  `).join('')
}

function renderCarga(container, context = {}) {
  const jobs = readJobs()
  const totalSize = jobs.reduce((sum, job) => sum + (Number(job.size) || 0), 0)

  // Nota de migración: esta pantalla reemplaza el placeholder previo que mostraba
  // solo “Módulo Carga / carga iniciada correctamente” en lugar del flujo real de trabajo.
  container.innerHTML = `
    <section class="card" aria-labelledby="cargaTitle" style="max-width:1100px;margin:0 auto;display:grid;gap:18px;">
      <header style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;">
        <div>
          <h1 id="cargaTitle" style="margin:0 0 8px;">Módulo ${MODULE_TITLE}</h1>
          <p class="muted" style="margin:0;max-width:700px;">Registra y organiza cargas operativas por categoría para mantener trazabilidad documental del expediente sin pasar por vistas puente.</p>
        </div>
        <div class="panel" style="padding:12px 14px;min-width:230px;">
          <div><strong>Total de cargas:</strong> ${jobs.length}</div>
          <div><strong>Peso acumulado:</strong> ${formatBytes(totalSize)}</div>
        </div>
      </header>

      <section class="panel" style="padding:16px;border-radius:16px;display:grid;gap:12px;">
        <h2 style="margin:0;font-size:1.1rem;">Nueva carga</h2>
        <p class="muted" style="margin:0;">Selecciona una categoría y agrega uno o más archivos para registrarlos en el historial operativo.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;align-items:end;">
          <label style="display:grid;gap:6px;">
            <span>Categoría</span>
            <select id="cargaCategory" class="input">
              <option value="Expediente judicial">Expediente judicial</option>
              <option value="Respaldo cliente">Respaldo cliente</option>
              <option value="Evidencia multimedia">Evidencia multimedia</option>
              <option value="Documento administrativo">Documento administrativo</option>
            </select>
          </label>
          <label style="display:grid;gap:6px;">
            <span>Archivos</span>
            <input id="cargaFileInput" class="input" type="file" multiple>
          </label>
          <button id="cargaRegisterBtn" class="btn btn-3d btn-primary" type="button">Registrar carga</button>
        </div>
        <div id="cargaMessage" class="muted" aria-live="polite"></div>
      </section>

      <section class="panel" style="padding:16px;border-radius:16px;display:grid;gap:10px;overflow:auto;">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;">
          <h2 style="margin:0;font-size:1.1rem;">Historial de cargas</h2>
          <button id="cargaClearBtn" class="btn btn-3d" type="button">Limpiar historial</button>
        </div>
        <table style="width:100%;border-collapse:collapse;min-width:700px;">
          <thead>
            <tr>
              <th style="text-align:left;padding:8px 4px;">#</th>
              <th style="text-align:left;padding:8px 4px;">Archivo</th>
              <th style="text-align:left;padding:8px 4px;">Categoría</th>
              <th style="text-align:left;padding:8px 4px;">Tipo</th>
              <th style="text-align:left;padding:8px 4px;">Peso</th>
              <th style="text-align:left;padding:8px 4px;">Fecha</th>
            </tr>
          </thead>
          <tbody id="cargaJobsBody">${renderJobRows(jobs)}</tbody>
        </table>
      </section>
    </section>
  `

  const categoryEl = container.querySelector('#cargaCategory')
  const fileInputEl = container.querySelector('#cargaFileInput')
  const registerBtnEl = container.querySelector('#cargaRegisterBtn')
  const clearBtnEl = container.querySelector('#cargaClearBtn')
  const messageEl = container.querySelector('#cargaMessage')

  function setMessage(message, isError = false) {
    messageEl.textContent = message
    messageEl.style.color = isError ? '#7e1822' : 'var(--muted)'
  }

  registerBtnEl?.addEventListener('click', () => {
    const files = Array.from(fileInputEl?.files || [])
    if (!files.length) {
      setMessage('Selecciona al menos un archivo para registrar la carga.', true)
      return
    }

    const category = categoryEl?.value || 'Sin categoría'
    const updatedJobs = [...files.map((file) => buildJobFromInput(file, category)), ...readJobs()]
    persistJobs(updatedJobs)
    container.querySelector('#cargaJobsBody').innerHTML = renderJobRows(updatedJobs)
    fileInputEl.value = ''
    setMessage(`Carga completada: ${files.length} archivo(s) agregados al historial.`)
  })

  clearBtnEl?.addEventListener('click', () => {
    persistJobs([])
    container.querySelector('#cargaJobsBody').innerHTML = renderJobRows([])
    setMessage('Historial limpiado correctamente.')
  })

  if (context?.source) {
    console.info('[Alpha Avocat][carga] Módulo real abierto desde:', context.source)
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
