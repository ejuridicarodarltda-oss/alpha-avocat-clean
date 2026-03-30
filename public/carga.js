const MODULE_ID = 'carga'
const MODULE_TITLE = 'Carga'

const STEP_STATUS = {
  pending: 'Pendiente',
  running: 'En ejecución',
  success: 'Completado con éxito',
  warning: 'Completado con advertencia',
  failed: 'Fallido',
  retrying: 'Reintentando',
  blocked: 'Bloqueado por dependencia'
}

const MASSIVE_STEPS = [
  { id: 1, name: 'Conectar con PJUD' },
  { id: 2, name: 'Abrir Mis Causas / usar sesión activa' },
  { id: 3, name: 'Resolver rutas reales de causas/documentos' },
  { id: 4, name: 'Recorrer automáticamente las causas del lote' },
  { id: 5, name: 'Detectar contenido documental disponible' },
  { id: 6, name: 'Descargar automáticamente el contenido real desde PJUD' },
  { id: 7, name: 'Guardar automáticamente en Expedientes Digitales' },
  { id: 8, name: 'Clasificar automáticamente dentro de la causa correcta' },
  { id: 9, name: 'Mostrar resumen del lote y permitir reintento' }
]

const DEFAULT_STEP_DETAIL = {
  4: 'Preparando procesamiento del lote',
  5: 'Recorriendo causa',
  6: 'Descargando contenido de la causa',
  7: 'Guardando contenido descargado de la causa',
  8: 'Clasificando documentos de la causa'
}

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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createInitialAuditState() {
  return {
    currentStepId: null,
    isRunning: false,
    selectedFileName: '',
    steps: MASSIVE_STEPS.map((step) => ({
      ...step,
      status: 'pending',
      detail: '',
      startedAt: null,
      endedAt: null,
      blockReason: ''
    })),
    batch: {
      total: 0,
      processed: 0,
      success: 0,
      partial: 0,
      failed: 0,
      pending: 0
    },
    causes: [],
    currentCause: null,
    currentSubaction: 'Sin actividad',
    processOutcome: 'Sin ejecución',
    auditLog: []
  }
}

function createMockCauses(total = 13) {
  return Array.from({ length: total }, (_, index) => {
    const id = index + 1
    return {
      id,
      rol: `C-${1200 + id}-2024`,
      tribunal: `Juzgado Civil ${((id - 1) % 3) + 1}`,
      caratula: `Demandante ${id} c/ Demandado ${id}`,
      hasDownloadIssue: id % 6 === 0,
      hasClassificationWarning: id % 5 === 0
    }
  })
}

function getCurrentStep(state) {
  return state.steps.find((step) => step.id === state.currentStepId) || null
}

function appendAuditLog(state, message) {
  const timestamp = new Date().toLocaleTimeString('es-CL')
  state.auditLog.unshift(`${timestamp} · ${message}`)
  if (state.auditLog.length > 120) state.auditLog = state.auditLog.slice(0, 120)
}

function setStepStatus(state, stepId, status, detail = '', blockReason = '') {
  const step = state.steps.find((item) => item.id === stepId)
  if (!step) return
  step.status = status
  step.detail = detail
  step.blockReason = blockReason
  if (status === 'running') step.startedAt = new Date().toISOString()
  if (['success', 'warning', 'failed', 'blocked'].includes(status)) step.endedAt = new Date().toISOString()
}

function updateBatchCounters(state) {
  const processed = state.batch.success + state.batch.partial + state.batch.failed
  state.batch.processed = processed
  state.batch.pending = Math.max(0, state.batch.total - processed)
}

function renderStepList(state) {
  return state.steps.map((step) => {
    const isCurrent = step.id === state.currentStepId
    const statusLabel = STEP_STATUS[step.status] || STEP_STATUS.pending
    const detail = step.blockReason || step.detail
    return `
      <li class="massive-step massive-step--${step.status} ${isCurrent ? 'massive-step--current' : ''}">
        <div class="massive-step__header">
          <span class="massive-step__index">Paso ${step.id}</span>
          <span class="massive-step__status">${statusLabel}</span>
        </div>
        <div class="massive-step__name">${escapeHtml(step.name)}</div>
        <div class="massive-step__detail">${escapeHtml(detail || 'Sin novedades de ejecución todavía.')}</div>
      </li>
    `
  }).join('')
}

function renderLog(state) {
  if (!state.auditLog.length) {
    return '<li class="muted">Sin eventos registrados todavía.</li>'
  }

  return state.auditLog.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')
}

function refreshAuditUI(root, state) {
  const currentStep = getCurrentStep(state)
  const currentStepName = currentStep ? `Paso ${currentStep.id}: ${currentStep.name}` : 'Sin paso activo'
  const currentStepStatus = currentStep ? (STEP_STATUS[currentStep.status] || STEP_STATUS.pending) : 'Pendiente'

  root.querySelector('#massiveCurrentStepName').textContent = currentStepName
  root.querySelector('#massiveCurrentStepStatus').textContent = currentStepStatus
  root.querySelector('#massiveCurrentSubaction').textContent = state.currentSubaction || 'Sin subacción activa'
  root.querySelector('#massiveCurrentCause').textContent = state.currentCause
    ? `${state.currentCause.rol} · ${state.currentCause.tribunal} · ${state.currentCause.caratula}`
    : 'Sin causa en ejecución'
  root.querySelector('#massiveProcessOutcome').textContent = state.processOutcome

  root.querySelector('#massiveBatchTotal').textContent = String(state.batch.total)
  root.querySelector('#massiveBatchProcessed').textContent = String(state.batch.processed)
  root.querySelector('#massiveBatchSuccess').textContent = String(state.batch.success)
  root.querySelector('#massiveBatchPartial').textContent = String(state.batch.partial)
  root.querySelector('#massiveBatchFailed').textContent = String(state.batch.failed)
  root.querySelector('#massiveBatchPending').textContent = String(state.batch.pending)

  root.querySelector('#massiveStepList').innerHTML = renderStepList(state)
  root.querySelector('#massiveAuditLog').innerHTML = renderLog(state)

  const startBtn = root.querySelector('#massiveStartBtn')
  const retryBtn = root.querySelector('#massiveRetryBtn')
  startBtn.disabled = state.isRunning
  retryBtn.disabled = state.isRunning || state.batch.failed === 0
}

function buildUI(container) {
  container.innerHTML = `
    <section class="card" aria-labelledby="cargaTitle" style="max-width:1200px;margin:0 auto;display:grid;gap:18px;">
      <header style="display:grid;gap:6px;">
        <h1 id="cargaTitle" style="margin:0;">Módulo ${MODULE_TITLE}</h1>
        <p class="muted" style="margin:0;">DESCARGA AUTOMÁTICA MASIVA DESDE PJUD · flujo auditado con paso actual, estado por paso, subacción y bitácora cronológica.</p>
      </header>

      <section class="panel massive-control" style="padding:16px;border-radius:16px;display:grid;gap:12px;">
        <h2 style="margin:0;font-size:1.06rem;">Inicio de lote masivo</h2>
        <div class="massive-control__grid">
          <label style="display:grid;gap:6px;">
            <span>Opcional: importar manifiesto Excel del lote</span>
            <input id="massiveExcelInput" class="input" type="file" accept=".xlsx,.xls,.csv">
            <small class="muted">Usar Excel solo como índice auxiliar del lote (no como origen del contenido).</small>
          </label>
          <label style="display:grid;gap:6px;">
            <span>Total de causas del lote (simulado)</span>
            <input id="massiveCauseCount" class="input" type="number" min="1" max="200" value="13">
          </label>
          <div class="massive-control__actions">
            <button id="massiveStartBtn" class="btn btn-3d btn-primary" type="button">Iniciar secuencia automática</button>
            <button id="massiveRetryBtn" class="btn btn-3d" type="button">Reintentar causas fallidas</button>
          </div>
        </div>
      </section>

      <section class="panel massive-audit" style="padding:16px;border-radius:16px;display:grid;gap:16px;">
        <h2 style="margin:0;font-size:1.06rem;">Panel de auditoría del lote</h2>
        <div class="massive-audit__grid">
          <article class="massive-audit__card">
            <h3>Paso actual</h3>
            <p id="massiveCurrentStepName" class="massive-highlight"></p>
            <p>Estado: <strong id="massiveCurrentStepStatus"></strong></p>
            <p>Subacción: <strong id="massiveCurrentSubaction"></strong></p>
            <p>Resultado global: <strong id="massiveProcessOutcome"></strong></p>
          </article>

          <article class="massive-audit__card">
            <h3>Lote</h3>
            <ul class="massive-stats">
              <li>Total de causas: <strong id="massiveBatchTotal">0</strong></li>
              <li>Procesadas: <strong id="massiveBatchProcessed">0</strong></li>
              <li>Correctas: <strong id="massiveBatchSuccess">0</strong></li>
              <li>Parciales: <strong id="massiveBatchPartial">0</strong></li>
              <li>Fallidas: <strong id="massiveBatchFailed">0</strong></li>
              <li>Pendientes: <strong id="massiveBatchPending">0</strong></li>
            </ul>
          </article>

          <article class="massive-audit__card massive-audit__card--full">
            <h3>Causa actual</h3>
            <p id="massiveCurrentCause">Sin causa en ejecución</p>
          </article>

          <article class="massive-audit__card massive-audit__card--full">
            <h3>Estado de todos los pasos</h3>
            <ol id="massiveStepList" class="massive-steps"></ol>
          </article>

          <article class="massive-audit__card massive-audit__card--full">
            <h3>Bitácora breve cronológica</h3>
            <ul id="massiveAuditLog" class="massive-log"></ul>
          </article>
        </div>
      </section>
    </section>
  `
}

async function executeMassiveFlow(root, state, options = {}) {
  const retryOnlyFailed = Boolean(options.retryOnlyFailed)

  const inputEl = root.querySelector('#massiveCauseCount')
  const excelInputEl = root.querySelector('#massiveExcelInput')
  const selectedCount = Number.parseInt(inputEl.value, 10)
  const totalCauses = Number.isFinite(selectedCount) && selectedCount > 0 ? selectedCount : 13
  const excelFile = excelInputEl?.files?.[0]

  state.isRunning = true
  state.currentStepId = null
  state.currentCause = null
  state.currentSubaction = 'Preparando ejecución'
  state.processOutcome = retryOnlyFailed ? 'Reintentando lote parcial' : 'Ejecución en curso'

  if (!retryOnlyFailed) {
    state.steps = MASSIVE_STEPS.map((step) => ({ ...step, status: 'pending', detail: '', startedAt: null, endedAt: null, blockReason: '' }))
    state.causes = createMockCauses(totalCauses)
    state.batch = { total: state.causes.length, processed: 0, success: 0, partial: 0, failed: 0, pending: state.causes.length }
    appendAuditLog(state, `Excel cargado correctamente: ${excelFile?.name || 'sin archivo seleccionado (modo simulado)'}.`)
  }

  refreshAuditUI(root, state)

  const setRunningStep = (stepId, startedMessage, detailMessage) => {
    state.currentStepId = stepId
    state.currentSubaction = startedMessage
    setStepStatus(state, stepId, 'running', detailMessage)
    appendAuditLog(state, `Paso ${stepId} iniciado: ${startedMessage}.`)
    refreshAuditUI(root, state)
  }

  const closeStep = (stepId, status, message, detail = message) => {
    setStepStatus(state, stepId, status, detail)
    appendAuditLog(state, `Paso ${stepId} ${status === 'failed' ? 'fallido' : 'superado'}: ${message}.`)
    refreshAuditUI(root, state)
  }

  try {
    setRunningStep(1, 'seleccionando archivo base del lote', `Archivo: ${excelFile?.name || 'no informado'}`)
    await delay(260)
    closeStep(1, 'success', 'superado con éxito', `Archivo seleccionado: ${excelFile?.name || 'simulado'}`)

    setRunningStep(2, 'validando sesión PJUD', 'Conectando con PJUD')
    await delay(320)
    closeStep(2, 'success', 'superado con éxito', 'Sesión PJUD validada')

    setRunningStep(3, 'leyendo y validando lote', `Leyendo ${state.batch.total} causas del lote`)
    await delay(380)
    closeStep(3, 'success', 'superado con éxito', `Lote validado: ${state.batch.total} causas detectadas`)

    setRunningStep(4, 'procesando lote masivo', `${DEFAULT_STEP_DETAIL[4]} 1 de ${state.batch.total}`)
    await delay(300)
    closeStep(4, 'success', 'superado con éxito', `Preparación completada para ${state.batch.total} causas`)

    const queue = retryOnlyFailed
      ? state.causes.filter((cause) => cause.downloadStatus === 'failed')
      : [...state.causes]

    setRunningStep(5, 'recorriendo causas del lote', `${DEFAULT_STEP_DETAIL[5]} 1 de ${queue.length || state.batch.total}`)

    for (let index = 0; index < queue.length; index += 1) {
      const cause = queue[index]
      state.currentCause = cause
      state.currentSubaction = 'abriendo causa'
      setStepStatus(state, 5, 'running', `${DEFAULT_STEP_DETAIL[5]} ${index + 1} de ${queue.length}: ${cause.rol}`)
      appendAuditLog(state, `Paso 5 en ejecución: recorriendo causa ${index + 1} de ${queue.length} (${cause.rol}).`)
      refreshAuditUI(root, state)
      await delay(200)
    }

    closeStep(5, 'success', 'superado con éxito', `Se recorrieron ${queue.length} causas del lote`)

    if (!queue.length) {
      state.currentStepId = 6
      setStepStatus(state, 6, 'blocked', 'Paso bloqueado por dependencia', 'Paso 6 bloqueado: no existen causas válidas en cola')
      appendAuditLog(state, 'Paso 6 bloqueado: no existen causas válidas en cola.')
      closeStep(9, 'warning', 'completado con advertencia', 'No hubo causas para procesar en descarga')
      state.processOutcome = 'Completado con advertencia'
      state.isRunning = false
      refreshAuditUI(root, state)
      return
    }

    setRunningStep(6, 'descargando contenido disponible', `${DEFAULT_STEP_DETAIL[6]} 1 de ${queue.length}`)

    for (let index = 0; index < queue.length; index += 1) {
      const cause = queue[index]
      state.currentCause = cause
      state.currentSubaction = 'descargando resolución'
      setStepStatus(state, 6, 'running', `${DEFAULT_STEP_DETAIL[6]} ${index + 1} de ${queue.length}: ${cause.rol}`)
      refreshAuditUI(root, state)
      await delay(210)

      if (cause.hasDownloadIssue) {
        cause.downloadStatus = 'failed'
        appendAuditLog(state, `Paso 6 fallido en causa ${cause.rol}: no se encontró enlace válido.`)
      } else {
        cause.downloadStatus = 'success'
      }
    }

    const failedDownloads = queue.filter((cause) => cause.downloadStatus === 'failed').length
    if (failedDownloads > 0) {
      closeStep(6, 'warning', 'completado con advertencia', `Descarga parcial: ${failedDownloads} causa(s) con error`) 
    } else {
      closeStep(6, 'success', 'superado con éxito', 'Descarga de contenido finalizada sin errores')
    }

    setRunningStep(7, 'guardando contenido en Expedientes Digitales', `${DEFAULT_STEP_DETAIL[7]} 1 de ${queue.length}`)

    for (let index = 0; index < queue.length; index += 1) {
      const cause = queue[index]
      state.currentCause = cause
      state.currentSubaction = 'guardando archivo'
      setStepStatus(state, 7, 'running', `${DEFAULT_STEP_DETAIL[7]} ${index + 1} de ${queue.length}: ${cause.rol}`)
      refreshAuditUI(root, state)
      await delay(200)
      cause.saveStatus = cause.downloadStatus === 'failed' ? 'skipped' : 'success'
    }

    closeStep(7, failedDownloads > 0 ? 'warning' : 'success', failedDownloads > 0 ? 'completado con advertencia' : 'superado con éxito', failedDownloads > 0 ? `Guardado parcial: ${failedDownloads} causa(s) sin archivo` : 'Guardado completado en Expedientes Digitales')

    setRunningStep(8, 'clasificando documentos por causa', `${DEFAULT_STEP_DETAIL[8]} 1 de ${queue.length}`)

    let warningClassifications = 0
    for (let index = 0; index < queue.length; index += 1) {
      const cause = queue[index]
      state.currentCause = cause
      state.currentSubaction = 'clasificando documento'
      setStepStatus(state, 8, 'running', `${DEFAULT_STEP_DETAIL[8]} ${index + 1} de ${queue.length}: ${cause.rol}`)
      refreshAuditUI(root, state)
      await delay(170)

      if (cause.hasClassificationWarning && cause.downloadStatus !== 'failed') {
        cause.classificationStatus = 'warning'
        warningClassifications += 1
      } else if (cause.downloadStatus === 'failed') {
        cause.classificationStatus = 'skipped'
      } else {
        cause.classificationStatus = 'success'
      }
    }

    if (warningClassifications > 0) {
      closeStep(8, 'warning', 'completado con advertencia', `Clasificación con advertencia: ${warningClassifications} causa(s)`) 
    } else {
      closeStep(8, 'success', 'superado con éxito', 'Clasificación completada')
    }

    state.batch.success = state.causes.filter((cause) => cause.downloadStatus === 'success' && cause.classificationStatus === 'success').length
    state.batch.partial = state.causes.filter((cause) => cause.downloadStatus === 'success' && cause.classificationStatus === 'warning').length
    state.batch.failed = state.causes.filter((cause) => cause.downloadStatus === 'failed').length
    updateBatchCounters(state)

    setRunningStep(9, 'consolidando resumen del lote', 'Registrando resultado del lote y estado de reintento')
    await delay(250)

    const status9 = state.batch.failed > 0 || state.batch.partial > 0 ? 'warning' : 'success'
    const summaryMessage = status9 === 'success'
      ? 'superado con éxito'
      : `completado con advertencia: ${state.batch.failed} fallida(s), ${state.batch.partial} parcial(es)`
    closeStep(9, status9, summaryMessage, `Resumen: ${state.batch.success} correctas, ${state.batch.partial} parciales, ${state.batch.failed} fallidas`)

    state.currentSubaction = state.batch.failed > 0
      ? 'Finalizado con causas marcadas para reintento'
      : 'Finalizado sin observaciones'
    state.processOutcome = state.batch.failed > 0
      ? 'Descarga parcial (lote continúa)'
      : (state.batch.partial > 0 ? 'Completado con advertencias de clasificación' : 'Completado con éxito')
    appendAuditLog(state, `Lote finalizado. Correctas: ${state.batch.success}, parciales: ${state.batch.partial}, fallidas: ${state.batch.failed}.`)
  } catch (error) {
    const stepId = state.currentStepId || 1
    state.processOutcome = 'Error total del lote'
    state.currentSubaction = 'proceso interrumpido'
    setStepStatus(state, stepId, 'failed', String(error?.message || 'Error no controlado'))
    appendAuditLog(state, `Paso ${stepId} fallido por error no controlado: ${error?.message || 'sin detalle'}.`)
    console.error('[Alpha Avocat][carga] Error en secuencia masiva:', error)
  } finally {
    state.isRunning = false
    refreshAuditUI(root, state)
  }
}

function renderCarga(container, context = {}) {
  buildUI(container)

  const state = createInitialAuditState()
  refreshAuditUI(container, state)

  const startBtn = container.querySelector('#massiveStartBtn')
  const retryBtn = container.querySelector('#massiveRetryBtn')

  startBtn?.addEventListener('click', () => {
    if (state.isRunning) return
    executeMassiveFlow(container, state, { retryOnlyFailed: false })
  })

  retryBtn?.addEventListener('click', () => {
    if (state.isRunning || state.batch.failed === 0) return
    setStepStatus(state, 6, 'retrying', 'Reintentando descarga de causas fallidas')
    appendAuditLog(state, `Reintento iniciado sobre ${state.batch.failed} causa(s) fallida(s).`)
    refreshAuditUI(container, state)
    executeMassiveFlow(container, state, { retryOnlyFailed: true })
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
