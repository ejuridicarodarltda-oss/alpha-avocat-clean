const MODULE_ID = 'carga'
const MODULE_TITLE = 'Carga'

const STEP_STATUS = {
  pending: 'Pendiente',
  running: 'En ejecución',
  success: 'Completado con éxito',
  warning: 'Completado con advertencias',
  failed: 'Fallido',
  blocked: 'Bloqueado'
}

const FLOW_STATUS_LABEL = {
  waiting_manual_login: 'esperando login manual',
  waiting_mis_causas: 'esperando apertura de Mis Causas (todas las materias)',
  validating_view: 'validando vista PJUD',
  running_batch: 'lote en ejecución',
  paused_reauth: 'pausa por reautenticación',
  resumed: 'reanudado',
  completed_warning: 'completado con advertencias',
  failed: 'fallido',
  completed_success: 'completado'
}

const MASSIVE_STEPS = [
  { id: 1, name: 'Validar sesión manual y vista PJUD > Mis Causas (todas las materias)' },
  { id: 2, name: 'Detectar causas reales visibles y armar lote configurable' },
  { id: 3, name: 'Abrir lupa por rol y detalle real por causa' },
  { id: 4, name: 'Descargar contenido real a almacenamiento temporal por lote' },
  { id: 5, name: 'Clasificar después de descarga y validar integridad mínima' },
  { id: 6, name: 'Guardar en Alpha, actualizar panel PJUD y sincronización' },
  { id: 7, name: 'Registrar checkpoint/reanudación y trazabilidad de ejecución' }
]

const DEFAULT_BATCH_SIZE = 20
const CHECKPOINT_STORAGE_KEY = 'alpha.pjud.checkpoint'
const SESSION_STORAGE_KEY = 'pjud.session.state'

const PJUD_SESSION_LABEL = {
  not_authenticated: 'no autenticado',
  waiting_manual_login: 'esperando login manual',
  active: 'sesión iniciada',
  mis_causas_civiles_ready: 'mis causas lista',
  expired: 'sesión expirada'
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

function appendAuditLog(state, message) {
  const timestamp = new Date().toLocaleTimeString('es-CL')
  state.auditLog.unshift(`${timestamp} · ${message}`)
  if (state.auditLog.length > 140) state.auditLog = state.auditLog.slice(0, 140)
}

function getPjudSessionStateLabel(sessionState) {
  return PJUD_SESSION_LABEL[sessionState] || sessionState
}

function inferPjudSessionState() {
  const candidate = window.__PJUD_SESSION_STATE__ || window.localStorage?.getItem(SESSION_STORAGE_KEY) || 'not_authenticated'
  return PJUD_SESSION_LABEL[candidate] ? candidate : 'not_authenticated'
}

function inferLivePjudContext() {
  const ctx = window.__PJUD_LIVE_CONTEXT__ || {}
  return {
    isAuthenticated: Boolean(ctx.isAuthenticated),
    view: String(ctx.view || ''),
    matter: String(ctx.matter || ''),
    domAccessible: Boolean(ctx.domAccessible),
    url: String(ctx.url || ''),
    causes: Array.isArray(ctx.causes) ? ctx.causes : []
  }
}

function validateLivePjudView(state) {
  const live = inferLivePjudContext()
  const sessionOk = state.pjud.sessionState === 'active' || state.pjud.sessionState === 'mis_causas_civiles_ready'
  const hasMisCausas = /mis\s*causas/i.test(live.view)
  const hasMatterVisibility = Boolean(String(live.matter || '').trim()) || (Array.isArray(live.causes) && live.causes.length > 0)
  const hasUrl = /^https?:\/\//i.test(live.url)

  const diagnostics = {
    sessionOk,
    hasMisCausas,
    hasMatterVisibility,
    domAccessible: live.domAccessible,
    hasUrl
  }

  const isValid = sessionOk && live.isAuthenticated && hasMisCausas && hasMatterVisibility && live.domAccessible && hasUrl
  return { isValid, live, diagnostics }
}

function createInitialAuditState() {
  return {
    isRunning: false,
    flowStatus: 'waiting_manual_login',
    currentStepId: null,
    currentSubaction: 'Sin actividad',
    processOutcome: 'Sin ejecución',
    auditLog: [],
    currentCause: null,
    pjud: {
      sessionState: 'not_authenticated',
      paused: false,
      pauseReason: '',
      lastValidUrl: '',
      currentUrl: ''
    },
    batch: {
      id: null,
      total: 0,
      size: DEFAULT_BATCH_SIZE,
      processed: 0,
      success: 0,
      failed: 0,
      pending: 0,
      downloadedFiles: 0,
      savedInAlpha: 0,
      startedAt: null,
      endedAt: null,
      successfulCauses: [],
      failedCauses: [],
      pendingCauses: []
    },
    steps: MASSIVE_STEPS.map((step) => ({ ...step, status: 'pending', detail: '' })),
    causes: [],
    queueCursor: 0,
    checkpoint: null,
    tempStorage: {
      batches: {}
    },
    diagnostics: {
      causesDetected: 0,
      currentUrl: '-',
      currentAction: '-'
    }
  }
}

function createMockLiveCauses(total = 40) {
  return Array.from({ length: total }, (_, index) => {
    const id = index + 1
    return {
      id,
      rol: `C-${2200 + id}-2025`,
      tribunal: `Juzgado Civil ${((id - 1) % 5) + 1}`,
      caratula: `Demandante ${id} c/ Demandado ${id}`,
      lookupButtonSelector: `.btn-lupa[data-rol="${id}"]`,
      detailUrl: `https://pjud.example/causa/${id}`,
      availableDocs: id % 7 === 0 ? [] : [`escrito-${id}.pdf`, `resolucion-${id}.pdf`]
    }
  })
}

function updateBatchCounters(state) {
  state.batch.processed = state.batch.success + state.batch.failed
  state.batch.pending = Math.max(0, state.batch.total - state.batch.processed)
  state.batch.pendingCauses = state.causes.filter((cause) => cause.status !== 'success').map((cause) => cause.rol)
}

function setStepStatus(state, stepId, status, detail = '') {
  const step = state.steps.find((entry) => entry.id === stepId)
  if (!step) return
  step.status = status
  step.detail = detail
}

function saveCheckpoint(state, reason = '') {
  const payload = {
    batch_id: state.batch.id,
    cause_index: state.queueCursor,
    causes_processed: state.batch.processed,
    causes_pending: state.batch.pendingCauses,
    last_valid_url: state.pjud.lastValidUrl || state.pjud.currentUrl,
    last_step: state.currentStepId,
    reason,
    timestamp: new Date().toISOString()
  }
  state.checkpoint = payload
  window.localStorage?.setItem(CHECKPOINT_STORAGE_KEY, JSON.stringify(payload))
}

function restoreCheckpoint() {
  const raw = window.localStorage?.getItem(CHECKPOINT_STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function renderStepList(state) {
  return state.steps.map((step) => `
    <li class="massive-step massive-step--${step.status} ${step.id === state.currentStepId ? 'massive-step--current' : ''}">
      <div class="massive-step__header">
        <span class="massive-step__index">Paso ${step.id}</span>
        <span class="massive-step__status">${STEP_STATUS[step.status] || STEP_STATUS.pending}</span>
      </div>
      <div class="massive-step__name">${escapeHtml(step.name)}</div>
      <div class="massive-step__detail">${escapeHtml(step.detail || 'Sin novedades.')}</div>
    </li>
  `).join('')
}

function renderLog(state) {
  if (!state.auditLog.length) return '<li class="muted">Sin eventos todavía.</li>'
  return state.auditLog.slice(0, 60).map((line) => `<li>${escapeHtml(line)}</li>`).join('')
}

function refreshAuditUI(root, state) {
  root.querySelector('#massiveFlowStatus').textContent = FLOW_STATUS_LABEL[state.flowStatus] || state.flowStatus
  root.querySelector('#massiveCurrentStepName').textContent = state.currentStepId
    ? `Paso ${state.currentStepId}: ${state.steps.find((s) => s.id === state.currentStepId)?.name || ''}`
    : 'Sin paso activo'
  root.querySelector('#massiveCurrentSubaction').textContent = state.currentSubaction
  root.querySelector('#massiveCurrentCause').textContent = state.currentCause
    ? `${state.currentCause.rol} · ${state.currentCause.tribunal}`
    : 'Sin causa en ejecución'
  root.querySelector('#massiveProcessOutcome').textContent = state.processOutcome
  root.querySelector('#massivePjudState').textContent = getPjudSessionStateLabel(state.pjud.sessionState)
  root.querySelector('#massivePauseReason').textContent = state.pjud.paused ? state.pjud.pauseReason : 'Sin pausa activa'

  root.querySelector('#massiveBatchId').textContent = state.batch.id || '-'
  root.querySelector('#massiveBatchSize').textContent = String(state.batch.size)
  root.querySelector('#massiveBatchTotal').textContent = String(state.batch.total)
  root.querySelector('#massiveBatchProcessed').textContent = String(state.batch.processed)
  root.querySelector('#massiveBatchSuccess').textContent = String(state.batch.success)
  root.querySelector('#massiveBatchFailed').textContent = String(state.batch.failed)
  root.querySelector('#massiveBatchPending').textContent = String(state.batch.pending)
  root.querySelector('#massiveDownloadedFiles').textContent = String(state.batch.downloadedFiles)
  root.querySelector('#massiveSavedInAlpha').textContent = String(state.batch.savedInAlpha)

  root.querySelector('#massiveDiagCauses').textContent = String(state.diagnostics.causesDetected)
  root.querySelector('#massiveDiagBatch').textContent = String(state.batch.size)
  root.querySelector('#massiveDiagSubaction').textContent = state.diagnostics.currentAction
  root.querySelector('#massiveDiagUrl').textContent = state.diagnostics.currentUrl

  root.querySelector('#massiveStepList').innerHTML = renderStepList(state)
  root.querySelector('#massiveAuditLog').innerHTML = renderLog(state)

  root.querySelector('#massiveStartBtn').disabled = state.isRunning
  root.querySelector('#massivePauseBtn').disabled = !state.isRunning
  root.querySelector('#massiveResumeBtn').disabled = state.isRunning || !state.pjud.paused
  root.querySelector('#massiveContinueFromCheckpointBtn').disabled = state.isRunning || !state.checkpoint
}

function buildUI(container) {
  container.innerHTML = `
    <section class="card" style="max-width:1200px;margin:0 auto;display:grid;gap:16px;">
      <header style="display:grid;gap:6px;">
        <h1 style="margin:0;">Módulo ${MODULE_TITLE}</h1>
        <p class="muted" style="margin:0;">Flujo asistido real PJUD por sesión manual del usuario (sin login automático y sin Excel como eje principal).</p>
      </header>

      <section class="panel" style="padding:16px;border-radius:16px;display:grid;gap:12px;">
        <h2 style="margin:0;font-size:1.06rem;">Inicio asistido PJUD</h2>
        <p class="muted" style="margin:0;">1) Abra sesión manualmente en PJUD con su Clave Única. 2) Abra PJUD → Mis Causas con todas las materias visibles. 3) Presione Continuar/Iniciar lote.</p>
        <div class="massive-control__grid">
          <label style="display:grid;gap:6px;">
            <span>Tamaño de lote (causas por corrida)</span>
            <input id="massiveBatchSizeInput" class="input" type="number" min="1" max="200" value="20">
          </label>
          <div class="massive-control__actions" style="display:flex;gap:8px;flex-wrap:wrap;">
            <button id="massiveManualLoginBtn" class="btn btn-3d" type="button">Abrí sesión en PJUD</button>
            <button id="massiveMisCausasBtn" class="btn btn-3d" type="button">Ya abrí Mis Causas (todas las materias)</button>
            <button id="massiveStartBtn" class="btn btn-3d btn-primary" type="button">Iniciar lote</button>
            <button id="massivePauseBtn" class="btn btn-3d" type="button">Pausar</button>
            <button id="massiveResumeBtn" class="btn btn-3d" type="button">Reanudar</button>
            <button id="massiveRetryAuthBtn" class="btn btn-3d" type="button">Reintentar autenticación</button>
            <button id="massiveContinueFromCheckpointBtn" class="btn btn-3d" type="button">Continuar desde última causa</button>
          </div>
          <small class="muted">No se guarda Clave Única ni credenciales. Solo se opera con la sesión viva abierta manualmente por el usuario.</small>
        </div>
      </section>

      <section class="panel" style="padding:16px;border-radius:16px;display:grid;gap:16px;">
        <h2 style="margin:0;font-size:1.06rem;">Panel operativo y diagnóstico</h2>
        <div class="massive-audit__grid">
          <article class="massive-audit__card">
            <h3>Estado</h3>
            <p>Flujo: <strong id="massiveFlowStatus"></strong></p>
            <p>Paso actual: <strong id="massiveCurrentStepName"></strong></p>
            <p>Subacción: <strong id="massiveCurrentSubaction"></strong></p>
            <p>Resultado: <strong id="massiveProcessOutcome"></strong></p>
            <p>Sesión PJUD: <strong id="massivePjudState"></strong></p>
            <p>Pausa: <strong id="massivePauseReason"></strong></p>
          </article>

          <article class="massive-audit__card">
            <h3>Lote</h3>
            <ul class="massive-stats">
              <li>Batch ID: <strong id="massiveBatchId">-</strong></li>
              <li>Tamaño lote: <strong id="massiveBatchSize">20</strong></li>
              <li>Causas del lote: <strong id="massiveBatchTotal">0</strong></li>
              <li>Procesadas: <strong id="massiveBatchProcessed">0</strong></li>
              <li>Exitosas: <strong id="massiveBatchSuccess">0</strong></li>
              <li>Fallidas: <strong id="massiveBatchFailed">0</strong></li>
              <li>Pendientes: <strong id="massiveBatchPending">0</strong></li>
              <li>Archivos descargados: <strong id="massiveDownloadedFiles">0</strong></li>
              <li>Causas guardadas en Alpha: <strong id="massiveSavedInAlpha">0</strong></li>
            </ul>
          </article>

          <article class="massive-audit__card massive-audit__card--full">
            <h3>Diagnóstico técnico visible</h3>
            <ul class="massive-stats">
              <li>Causas detectadas: <strong id="massiveDiagCauses">0</strong></li>
              <li>Tamaño de lote actual: <strong id="massiveDiagBatch">20</strong></li>
              <li>Subacción actual: <strong id="massiveDiagSubaction">-</strong></li>
              <li>URL actual: <strong id="massiveDiagUrl">-</strong></li>
            </ul>
          </article>

          <article class="massive-audit__card massive-audit__card--full">
            <h3>Causa actual</h3>
            <p id="massiveCurrentCause">Sin causa en ejecución</p>
          </article>

          <article class="massive-audit__card massive-audit__card--full">
            <h3>Pasos</h3>
            <ol id="massiveStepList" class="massive-steps"></ol>
          </article>

          <article class="massive-audit__card massive-audit__card--full">
            <h3>Bitácora</h3>
            <ul id="massiveAuditLog" class="massive-log"></ul>
          </article>
        </div>
      </section>
    </section>
  `
}

async function executeMassiveFlow(root, state, options = {}) {
  const resumeFromCheckpoint = Boolean(options.resumeFromCheckpoint)
  const batchSizeInput = root.querySelector('#massiveBatchSizeInput')
  const requestedBatchSize = Number.parseInt(batchSizeInput?.value, 10)
  const batchSize = Number.isFinite(requestedBatchSize) && requestedBatchSize > 0 ? requestedBatchSize : DEFAULT_BATCH_SIZE

  state.isRunning = true
  state.pjud.paused = false
  state.pjud.pauseReason = ''
  state.flowStatus = resumeFromCheckpoint ? 'resumed' : 'validating_view'
  state.currentSubaction = 'Validando sesión y vista operativa PJUD'
  state.processOutcome = 'Ejecución en curso'
  state.currentStepId = 1
  setStepStatus(state, 1, 'running', 'Verificando sesión activa, Mis Causas visible, DOM y URL válida')
  refreshAuditUI(root, state)

  try {
    await delay(120)
    state.pjud.sessionState = inferPjudSessionState()
    const validation = validateLivePjudView(state)
    state.diagnostics.currentUrl = validation.live.url || '-'
    state.pjud.currentUrl = validation.live.url || ''

    if (!validation.isValid) {
      state.flowStatus = state.pjud.sessionState === 'expired' ? 'paused_reauth' : 'waiting_mis_causas'
      state.pjud.paused = true
      state.pjud.pauseReason = 'Vista PJUD no válida o sesión no autenticada'
      setStepStatus(state, 1, 'failed', `Validación fallida: ${JSON.stringify(validation.diagnostics)}`)
      state.currentSubaction = 'Esperando que el usuario deje lista la vista Mis Causas (todas las materias)'
      state.processOutcome = 'Pausado por validación de vista'
      saveCheckpoint(state, 'validacion_vista_fallida')
      appendAuditLog(state, 'No se inicia lote: falta sesión activa/PJUD Mis Causas visible/DOM accesible/URL válida.')
      return
    }

    setStepStatus(state, 1, 'success', 'Vista operativa validada correctamente')
    state.pjud.lastValidUrl = validation.live.url

    state.currentStepId = 2
    state.flowStatus = 'running_batch'
    state.currentSubaction = 'Detectando lista real de causas visibles'
    setStepStatus(state, 2, 'running', 'Construyendo lote desde la página viva PJUD')
    refreshAuditUI(root, state)

    const sourceCauses = validation.live.causes.length ? validation.live.causes : createMockLiveCauses(40)
    state.diagnostics.causesDetected = sourceCauses.length
    state.batch.size = batchSize
    state.batch.id = state.batch.id || `BATCH-${Date.now()}`
    state.batch.startedAt = state.batch.startedAt || new Date().toISOString()

    if (!resumeFromCheckpoint) {
      state.causes = sourceCauses.slice(0, batchSize).map((cause, index) => ({
        ...cause,
        internalIndex: index,
        status: 'pending',
        openedDetail: false,
        downloadedFiles: [],
        classified: false,
        savedInAlpha: false,
        error: ''
      }))
      state.queueCursor = 0
      state.tempStorage.batches[state.batch.id] = {
        batch_id: state.batch.id,
        causes_total: state.causes.length,
        timestamp: new Date().toISOString(),
        byCause: {}
      }
      state.batch.total = state.causes.length
      state.batch.success = 0
      state.batch.failed = 0
      state.batch.downloadedFiles = 0
      state.batch.savedInAlpha = 0
    }

    setStepStatus(state, 2, 'success', `${state.causes.length} causa(s) detectadas para el lote ${state.batch.id}`)
    updateBatchCounters(state)

    for (let i = state.queueCursor; i < state.causes.length; i += 1) {
      const cause = state.causes[i]
      state.currentCause = cause
      state.diagnostics.currentAction = `Procesando ${cause.rol}`

      state.pjud.sessionState = inferPjudSessionState()
      if (state.pjud.sessionState === 'expired' || state.pjud.sessionState === 'not_authenticated') {
        state.pjud.paused = true
        state.pjud.pauseReason = 'Sesión expirada o reautenticación requerida'
        state.flowStatus = 'paused_reauth'
        state.currentSubaction = 'Pausa por reautenticación manual'
        state.processOutcome = 'Pausado: reautenticación requerida'
        state.queueCursor = i
        saveCheckpoint(state, 'reauth_required')
        appendAuditLog(state, `Pausa por reautenticación en ${cause.rol}.`) 
        return
      }

      state.currentStepId = 3
      setStepStatus(state, 3, 'running', `Lupa/buscador por rol en ${cause.rol}`)
      state.currentSubaction = 'Abriendo lupa por rol y detalle real'
      refreshAuditUI(root, state)
      await delay(80)
      cause.openedDetail = true

      state.currentStepId = 4
      setStepStatus(state, 4, 'running', `Descarga temporal por lote para ${cause.rol}`)
      state.currentSubaction = 'Descargando documentos reales a almacenamiento temporal'
      refreshAuditUI(root, state)
      await delay(120)

      cause.downloadedFiles = Array.isArray(cause.availableDocs) ? cause.availableDocs.slice() : []
      state.tempStorage.batches[state.batch.id].byCause[cause.rol] = {
        downloaded: cause.downloadedFiles,
        detailUrl: cause.detailUrl || state.pjud.lastValidUrl,
        downloadedAt: new Date().toISOString()
      }
      state.batch.downloadedFiles += cause.downloadedFiles.length

      state.currentStepId = 5
      setStepStatus(state, 5, 'running', `Clasificación posterior para ${cause.rol}`)
      state.currentSubaction = 'Clasificando materia/tribunal/rol y tipo documental'
      refreshAuditUI(root, state)
      await delay(80)

      if (!cause.openedDetail || cause.downloadedFiles.length === 0) {
        cause.status = 'failed'
        cause.error = !cause.openedDetail
          ? 'No se abrió detalle real de causa'
          : 'No se descargaron archivos reales'
      } else {
        cause.classified = true
      }

      state.currentStepId = 6
      setStepStatus(state, 6, 'running', `Guardando en Alpha para ${cause.rol}`)
      state.currentSubaction = 'Vinculando causa interna y guardando expediente'
      refreshAuditUI(root, state)
      await delay(80)

      if (cause.classified && cause.downloadedFiles.length > 0) {
        cause.savedInAlpha = true
        cause.status = 'success'
        state.batch.savedInAlpha += 1
      } else {
        cause.status = 'failed'
        cause.error = cause.error || 'No clasificado o sin contenido real'
      }

      state.batch.success = state.causes.filter((entry) => entry.status === 'success').length
      state.batch.failed = state.causes.filter((entry) => entry.status === 'failed').length
      state.batch.successfulCauses = state.causes.filter((entry) => entry.status === 'success').map((entry) => entry.rol)
      state.batch.failedCauses = state.causes.filter((entry) => entry.status === 'failed').map((entry) => `${entry.rol}: ${entry.error}`)
      state.queueCursor = i + 1
      updateBatchCounters(state)
      saveCheckpoint(state, 'progress')
      appendAuditLog(state, cause.status === 'success'
        ? `Causa ${cause.rol} procesada: detalle abierto, descarga real, clasificación y guardado en Alpha.`
        : `Causa ${cause.rol} fallida: ${cause.error}.`)
      refreshAuditUI(root, state)
    }

    state.currentStepId = 7
    setStepStatus(state, 3, 'success', 'Apertura de detalles completada')
    setStepStatus(state, 4, 'success', 'Descarga temporal por lotes completada')
    setStepStatus(state, 5, state.batch.failed > 0 ? 'warning' : 'success', state.batch.failed > 0 ? 'Clasificación parcial por causas fallidas' : 'Clasificación completa')
    setStepStatus(state, 6, state.batch.failed > 0 ? 'warning' : 'success', state.batch.failed > 0 ? 'Guardado parcial en Alpha' : 'Guardado completo en Alpha')
    setStepStatus(state, 7, state.batch.failed > 0 ? 'warning' : 'success', 'Checkpoint final y métricas del lote registradas')

    state.batch.endedAt = new Date().toISOString()
    state.flowStatus = state.batch.failed > 0 ? 'completed_warning' : 'completed_success'
    state.currentSubaction = 'Lote finalizado'
    state.processOutcome = state.batch.failed > 0
      ? `Completado con advertencias: ${state.batch.failed} causa(s) fallida(s)`
      : 'Completado con éxito'
    saveCheckpoint(state, 'finished')
    appendAuditLog(state, `Lote ${state.batch.id} finalizado. Exitosas: ${state.batch.success}, fallidas: ${state.batch.failed}, pendientes: ${state.batch.pending}.`)
  } catch (error) {
    state.flowStatus = 'failed'
    state.processOutcome = 'Fallido por error no controlado'
    state.currentSubaction = 'Error de ejecución'
    setStepStatus(state, state.currentStepId || 1, 'failed', String(error?.message || 'Error no controlado'))
    saveCheckpoint(state, `error:${error?.message || 'unknown'}`)
    appendAuditLog(state, `Error de ejecución: ${error?.message || 'sin detalle'}.`)
    console.error('[Alpha Avocat][carga] Error en flujo asistido PJUD:', error)
  } finally {
    state.isRunning = false
    refreshAuditUI(root, state)
  }
}

function renderCarga(container, context = {}) {
  buildUI(container)

  const state = createInitialAuditState()
  state.pjud.sessionState = inferPjudSessionState()
  state.checkpoint = restoreCheckpoint()
  if (state.checkpoint) {
    appendAuditLog(state, `Checkpoint detectado: batch ${state.checkpoint.batch_id || '-'} en índice ${state.checkpoint.cause_index || 0}.`)
  }

  const setPjudState = (sessionState, message = '') => {
    window.__PJUD_SESSION_STATE__ = sessionState
    window.localStorage?.setItem(SESSION_STORAGE_KEY, sessionState)
    state.pjud.sessionState = sessionState
    appendAuditLog(state, message || `Estado PJUD actualizado: ${getPjudSessionStateLabel(sessionState)}.`)
    refreshAuditUI(container, state)
  }

  container.querySelector('#massiveManualLoginBtn')?.addEventListener('click', () => {
    state.flowStatus = 'waiting_mis_causas'
    setPjudState('active', 'Login manual confirmado por usuario. Ahora abra Mis Causas (todas las materias).')
  })

  container.querySelector('#massiveMisCausasBtn')?.addEventListener('click', () => {
    state.flowStatus = 'validating_view'
    setPjudState('mis_causas_civiles_ready', 'Usuario indica vista Mis Causas lista. Puede iniciar lote.')
  })

  container.querySelector('#massiveStartBtn')?.addEventListener('click', () => {
    if (state.isRunning) return
    executeMassiveFlow(container, state, { resumeFromCheckpoint: false })
  })

  container.querySelector('#massivePauseBtn')?.addEventListener('click', () => {
    if (!state.isRunning) return
    state.pjud.paused = true
    state.pjud.pauseReason = 'Pausado manualmente por usuario'
    state.flowStatus = 'paused_reauth'
    state.processOutcome = 'Pausado manual'
    saveCheckpoint(state, 'manual_pause')
    appendAuditLog(state, 'Proceso pausado manualmente.')
    refreshAuditUI(container, state)
  })

  container.querySelector('#massiveResumeBtn')?.addEventListener('click', () => {
    if (state.isRunning || !state.pjud.paused) return
    state.flowStatus = 'resumed'
    setPjudState('active', 'Reanudación solicitada por usuario.')
    executeMassiveFlow(container, state, { resumeFromCheckpoint: true })
  })

  container.querySelector('#massiveRetryAuthBtn')?.addEventListener('click', () => {
    state.flowStatus = 'waiting_manual_login'
    setPjudState('waiting_manual_login', 'Reintento de autenticación solicitado. Abra sesión manualmente y confirme.')
  })

  container.querySelector('#massiveContinueFromCheckpointBtn')?.addEventListener('click', () => {
    if (state.isRunning) return
    const checkpoint = restoreCheckpoint()
    if (!checkpoint) {
      appendAuditLog(state, 'No hay checkpoint disponible para continuar.')
      refreshAuditUI(container, state)
      return
    }
    state.checkpoint = checkpoint
    state.batch.id = checkpoint.batch_id || state.batch.id
    state.queueCursor = Number(checkpoint.cause_index || 0)
    state.flowStatus = 'resumed'
    appendAuditLog(state, `Reanudando desde checkpoint: lote ${state.batch.id || '-'} en índice ${state.queueCursor}.`)
    executeMassiveFlow(container, state, { resumeFromCheckpoint: true })
  })

  refreshAuditUI(container, state)

  if (context?.source) {
    console.info('[Alpha Avocat][carga] Módulo real abierto desde:', context.source)
  }
}

export function mount(containerOrSelector, context = {}) {
  const container = resolveContainer(containerOrSelector)
  if (!container) {
    const error = new Error('Contenedor inexistente para módulo Carga (#cargaModuleRoot).')
    console.error('[Alpha Avocat][carga] No se pudo montar el módulo.', { module: MODULE_ID, error })
    return { ok: false, error }
  }

  try {
    renderCarga(container, context)
    return { ok: true }
  } catch (error) {
    console.error('[Alpha Avocat][carga] Excepción al renderizar el módulo.', { module: MODULE_ID, error })
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
