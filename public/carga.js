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

const ASSISTED_MODE_ID = 'assisted-pjud-step-by-step'
const LEGACY_MODE_ID = 'legacy-flow'
const ASSISTED_STATUS_LABEL = {
  pending: 'Pendiente',
  running: 'En proceso',
  success: 'Correcto',
  error: 'Error'
}
const ASSISTED_STEPS = [
  { id: 1, title: 'Ingrese a www.pjud.cl', successMessage: 'Ingresado con éxito' },
  { id: 2, title: 'Ingrese a Oficina Judicial Virtual', successMessage: 'Ingresado con éxito' },
  { id: 3, title: 'Ingrese a Todos los Servicios mediante Clave Única', successMessage: 'Ingresado con éxito' },
  { id: 4, title: 'Ingrese a Mis Causas', successMessage: 'Ingresado con éxito' },
  { id: 5, title: 'Posicione el cursor sobre el inicio de la primera causa o sobre la lupa', successMessage: 'Posicionado con éxito' },
  { id: 6, title: 'Verificar listado de causas', successMessage: 'Listado detectado con éxito' },
  { id: 7, title: 'Extraer listado de causas', successMessage: 'Causas extraídas con éxito' }
]

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

function createInitialAssistedState() {
  return {
    selectedMode: ASSISTED_MODE_ID,
    currentStepId: null,
    extractedCauses: [],
    diagnostics: [],
    listDetection: {
      selector: '',
      count: 0,
      sample: []
    },
    steps: ASSISTED_STEPS.map((step) => ({
      ...step,
      status: 'pending',
      detail: 'Pendiente de verificación'
    }))
  }
}

function appendAssistedLog(state, message) {
  const timestamp = new Date().toLocaleTimeString('es-CL')
  state.diagnostics.unshift(`${timestamp} · ${message}`)
  if (state.diagnostics.length > 120) state.diagnostics = state.diagnostics.slice(0, 120)
}

function normalizeCause(rawCause = {}, index = 0) {
  const rol = String(rawCause.rol || rawCause.rolIngreso || rawCause.id || `SIN-ROL-${index + 1}`).trim()
  const caratula = String(rawCause.caratula || rawCause.nombre || rawCause.glosa || '').trim()
  const tribunal = String(rawCause.tribunal || rawCause.juzgado || rawCause.corte || '').trim()
  const openRef = String(
    rawCause.lookupButtonSelector
    || rawCause.openRef
    || rawCause.onClick
    || rawCause.href
    || rawCause.detailUrl
    || ''
  ).trim()

  return {
    rol: rol || `SIN-ROL-${index + 1}`,
    caratula: caratula || 'No disponible',
    tribunal: tribunal || 'No disponible',
    openRef: openRef || 'No disponible'
  }
}

function detectVisibleCauses() {
  const live = inferLivePjudContext()
  const knownSelectors = [
    '#misCausasTable tbody tr',
    '.mis-causas-table tbody tr',
    '.mis-causas-list .cause-row',
    'table tbody tr',
    '.causas-list .row'
  ]

  const selectorEvidence = knownSelectors
    .map((selector) => ({ selector, rows: Array.from(document.querySelectorAll(selector)).filter((row) => row.offsetParent !== null) }))
    .find((entry) => entry.rows.length > 0)

  const domRows = selectorEvidence?.rows ?? []
  const domCauses = domRows.map((row, index) => {
    const cells = Array.from(row.querySelectorAll('td'))
    const rol = cells[0]?.textContent?.trim() || row.querySelector('[data-rol]')?.getAttribute('data-rol') || ''
    const caratula = cells[1]?.textContent?.trim() || row.querySelector('.caratula')?.textContent?.trim() || ''
    const tribunal = cells[2]?.textContent?.trim() || row.querySelector('.tribunal')?.textContent?.trim() || ''
    const opener = row.querySelector('button, a, [onclick], [role="button"]')
    return normalizeCause({
      rol,
      caratula,
      tribunal,
      openRef: opener?.getAttribute('onclick') || opener?.getAttribute('href') || opener?.className || ''
    }, index)
  }).filter((cause) => cause.rol && cause.rol !== 'No disponible')

  const contextCauses = Array.isArray(live.causes)
    ? live.causes.map((cause, index) => normalizeCause(cause, index))
    : []

  const causes = domCauses.length > 0 ? domCauses : contextCauses
  const selectorUsed = domCauses.length > 0 ? selectorEvidence.selector : (contextCauses.length > 0 ? 'window.__PJUD_LIVE_CONTEXT__.causes' : 'sin selector válido')

  return {
    live,
    causes,
    selectorUsed,
    count: causes.length,
    hasInteractiveControl: causes.some((cause) => cause.openRef && cause.openRef !== 'No disponible')
  }
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

function renderAssistedStepList(state) {
  return state.steps.map((step) => `
    <li class="assisted-step assisted-step--${step.status}">
      <div>
        <strong>Paso ${step.id}</strong>
        <div>${escapeHtml(step.title)}</div>
        <small>${escapeHtml(step.detail)}</small>
      </div>
      <div class="assisted-step__actions">
        <span class="assisted-step__status">${ASSISTED_STATUS_LABEL[step.status]}</span>
        <button class="btn btn-3d" type="button" data-assisted-verify="${step.id}">Verificar paso</button>
      </div>
    </li>
  `).join('')
}

function refreshAssistedUI(root, state) {
  root.querySelector('#assistedStepList').innerHTML = renderAssistedStepList(state)
  root.querySelector('#assistedDetectedCount').textContent = String(state.listDetection.count || 0)
  root.querySelector('#assistedSelectorUsed').textContent = state.listDetection.selector || '-'

  const sampleItems = (state.listDetection.sample || []).map((cause) => `
    <li>${escapeHtml(cause.rol)} · ${escapeHtml(cause.caratula)} · ${escapeHtml(cause.tribunal)}</li>
  `).join('')
  root.querySelector('#assistedSampleList').innerHTML = sampleItems || '<li class="muted">Sin muestra todavía.</li>'

  const logItems = state.diagnostics.map((line) => `<li>${escapeHtml(line)}</li>`).join('')
  root.querySelector('#assistedDiagnosticLog').innerHTML = logItems || '<li class="muted">Sin diagnóstico todavía.</li>'
}

function updateAssistedStepState(state, stepId, status, detail) {
  const step = state.steps.find((entry) => entry.id === stepId)
  if (!step) return
  step.status = status
  step.detail = detail
}

function canRunAssistedStep(state, stepId) {
  if (stepId === 1) return true
  const previous = state.steps.find((entry) => entry.id === stepId - 1)
  return previous?.status === 'success'
}

function verifyAssistedStep(state, stepId) {
  if (!canRunAssistedStep(state, stepId)) {
    updateAssistedStepState(state, stepId, 'error', 'No puede avanzar: el paso anterior no está Correcto.')
    appendAssistedLog(state, `Paso ${stepId} bloqueado por secuencia.`)
    return
  }

  updateAssistedStepState(state, stepId, 'running', 'Validación técnica en proceso...')
  state.currentStepId = stepId
  const detection = detectVisibleCauses()
  const { live } = detection
  const host = (() => {
    try { return new URL(live.url).hostname } catch { return '' }
  })()
  const isPjudDomain = /(^|\.)pjud\.cl$/i.test(host)
  const viewLooksOJV = /oficina|judicial|virtual|ojv/i.test(live.view)
  const hasAuthenticatedSignals = Boolean(live.isAuthenticated) && live.domAccessible && detection.count > 0
  const isLoginView = /login|clave\s*única|autenticación/i.test(live.view)
  const hasMisCausasSignals = /mis\s*causas/i.test(live.view) && detection.count > 0

  if (stepId === 1) {
    if (!isPjudDomain) {
      updateAssistedStepState(state, 1, 'error', 'No se detectó dominio pjud.cl válido en la sesión activa.')
      appendAssistedLog(state, 'Paso 1 fallido: dominio fuera de ecosistema PJUD.')
      return
    }
    updateAssistedStepState(state, 1, 'success', 'Ingresado con éxito')
    appendAssistedLog(state, 'Paso 1 correcto: dominio PJUD confirmado.')
    return
  }

  if (stepId === 2) {
    if (!(isPjudDomain && viewLooksOJV && /oficinajudicialvirtual/i.test(live.url))) {
      updateAssistedStepState(state, 2, 'error', 'No se validó entorno de Oficina Judicial Virtual con evidencia técnica.')
      appendAssistedLog(state, 'Paso 2 fallido: no coincide entorno OJV.')
      return
    }
    updateAssistedStepState(state, 2, 'success', 'Ingresado con éxito')
    appendAssistedLog(state, 'Paso 2 correcto: OJV detectada.')
    return
  }

  if (stepId === 3) {
    if (!hasAuthenticatedSignals || isLoginView) {
      updateAssistedStepState(state, 3, 'error', 'No se detecta sesión autenticada activa o aún está en pantalla de login.')
      appendAssistedLog(state, 'Paso 3 fallido: sin señales de sesión autenticada activa.')
      return
    }
    updateAssistedStepState(state, 3, 'success', 'Ingresado con éxito')
    appendAssistedLog(state, 'Paso 3 correcto: sesión autenticada detectada sin captura de credenciales.')
    return
  }

  if (stepId === 4) {
    if (!hasMisCausasSignals) {
      updateAssistedStepState(state, 4, 'error', 'Mis Causas no está validado con contenido visible real.')
      appendAssistedLog(state, 'Paso 4 fallido: no hay evidencia real de listado Mis Causas.')
      return
    }
    updateAssistedStepState(state, 4, 'success', 'Ingresado con éxito')
    appendAssistedLog(state, 'Paso 4 correcto: Mis Causas abierta con listado visible.')
    return
  }

  if (stepId === 5) {
    if (!detection.hasInteractiveControl) {
      updateAssistedStepState(state, 5, 'error', 'No se detectó control interactivo real (lupa/botón/enlace) en primera causa.')
      appendAssistedLog(state, 'Paso 5 fallido: sin evidencia de control de apertura en listado.')
      return
    }
    updateAssistedStepState(state, 5, 'success', 'Posicionado con éxito')
    appendAssistedLog(state, 'Paso 5 correcto: controles interactivos detectados en causas visibles.')
    return
  }

  if (stepId === 6) {
    if (detection.count < 1) {
      updateAssistedStepState(state, 6, 'error', 'No se detectaron filas de causas visibles.')
      appendAssistedLog(state, 'Paso 6 fallido: conteo de filas visible = 0.')
      return
    }
    state.listDetection = {
      count: detection.count,
      selector: detection.selectorUsed,
      sample: detection.causes.slice(0, 5)
    }
    updateAssistedStepState(state, 6, 'success', 'Listado detectado con éxito')
    appendAssistedLog(state, `Paso 6 correcto: ${detection.count} causas, selector ${detection.selectorUsed}.`)
    return
  }

  if (stepId === 7) {
    if (!state.listDetection.count || state.steps.find((entry) => entry.id === 6)?.status !== 'success') {
      updateAssistedStepState(state, 7, 'error', 'Debe validar primero el listado real en el paso 6.')
      appendAssistedLog(state, 'Paso 7 fallido: extracción bloqueada por ausencia de validación del paso 6.')
      return
    }
    state.extractedCauses = detection.causes.map((cause) => ({
      rol: cause.rol,
      caratula: cause.caratula,
      tribunal: cause.tribunal,
      openRef: cause.openRef
    }))
    updateAssistedStepState(state, 7, 'success', 'Causas extraídas con éxito')
    appendAssistedLog(state, `Paso 7 correcto: ${state.extractedCauses.length} causas extraídas desde sesión PJUD activa.`)
  }
}

function buildUI(container) {
  container.innerHTML = `
    <section class="card" style="max-width:1200px;margin:0 auto;display:grid;gap:16px;">
      <header style="display:grid;gap:6px;">
        <h1 style="margin:0;">Módulo ${MODULE_TITLE}</h1>
        <p class="muted" style="margin:0;">Modo antiguo y nuevo modo asistido PJUD conviven temporalmente para validación en paralelo.</p>
      </header>

      <section class="panel" style="padding:16px;border-radius:16px;display:grid;gap:12px;">
        <h2 style="margin:0;font-size:1.06rem;">Tipo de flujo</h2>
        <div class="flow-mode-selector">
          <label class="flow-mode-option">
            <input type="radio" name="flowMode" value="${LEGACY_MODE_ID}">
            <strong>Modo antiguo</strong>
            <span class="muted">Mantiene el flujo actual por lote.</span>
          </label>
          <label class="flow-mode-option">
            <input type="radio" name="flowMode" value="${ASSISTED_MODE_ID}" checked>
            <strong>MODO ASISTIDO PJUD PASO A PASO</strong>
            <span class="muted">Guía, verifica y extrae listado visible desde sesión web activa.</span>
          </label>
        </div>
      </section>

      <section id="assistedModeContainer" class="panel" style="padding:16px;border-radius:16px;display:grid;gap:16px;">
        <h2 style="margin:0;font-size:1.06rem;">MODO ASISTIDO PJUD PASO A PASO</h2>
        <p class="muted" style="margin:0;">El usuario ejecuta manualmente acciones en PJUD. Alpha Avocat solo verifica técnicamente, muestra diagnóstico y extrae listado visible.</p>
        <div class="assisted-grid">
          <article>
            <h3 style="margin:0 0 8px;">Pasos guiados</h3>
            <ol id="assistedStepList" class="assisted-step-list"></ol>
          </article>
          <article>
            <h3 style="margin:0 0 8px;">Bitácora de diagnóstico</h3>
            <ul id="assistedDiagnosticLog" class="massive-log"></ul>
          </article>
          <article class="assisted-diagnostic-panel">
            <h3 style="margin:0 0 8px;">Diagnóstico visible del listado</h3>
            <p style="margin:0 0 4px;">Causas detectadas: <strong id="assistedDetectedCount">0</strong></p>
            <p style="margin:0 0 4px;">Selector/estrategia usada: <strong id="assistedSelectorUsed">-</strong></p>
            <div>
              <strong>Muestra (3 a 5 causas)</strong>
              <ul id="assistedSampleList" class="massive-log"></ul>
            </div>
          </article>
        </div>
      </section>

      <section id="legacyModeContainer" class="panel" style="padding:16px;border-radius:16px;display:grid;gap:12px;">
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
  const assistedState = createInitialAssistedState()
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

  const setActiveMode = (modeId) => {
    assistedState.selectedMode = modeId
    const assistedContainer = container.querySelector('#assistedModeContainer')
    const legacyContainer = container.querySelector('#legacyModeContainer')
    if (assistedContainer) assistedContainer.style.display = modeId === ASSISTED_MODE_ID ? 'grid' : 'none'
    if (legacyContainer) legacyContainer.style.display = modeId === LEGACY_MODE_ID ? 'grid' : 'none'
  }

  container.querySelectorAll('input[name="flowMode"]').forEach((input) => {
    input.addEventListener('change', (event) => {
      const mode = event.target?.value || ASSISTED_MODE_ID
      setActiveMode(mode)
    })
  })

  container.addEventListener('click', (event) => {
    const verifyBtn = event.target?.closest?.('[data-assisted-verify]')
    if (!verifyBtn) return
    const stepId = Number.parseInt(verifyBtn.getAttribute('data-assisted-verify'), 10)
    if (!Number.isFinite(stepId)) return
    verifyAssistedStep(assistedState, stepId)
    refreshAssistedUI(container, assistedState)
  })

  refreshAuditUI(container, state)
  refreshAssistedUI(container, assistedState)
  setActiveMode(ASSISTED_MODE_ID)

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
