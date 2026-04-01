const MODULE_ID = 'carga'
const MODULE_TITLE = 'Carga'
const PERSISTENCE_KEY = 'alpha-pjud-massive-flow-v2'

const STEP_STATUS = {
  pending: 'Pendiente',
  running: 'En ejecución',
  success: 'Completado con éxito',
  warning: 'Completado con advertencia',
  failed: 'Fallido',
  retrying: 'Reintentando',
  blocked: 'Bloqueado por dependencia',
  paused: 'Pausado'
}

const FLOW_MODES = {
  assisted: {
    id: 'assisted',
    label: 'Modo asistido',
    description: 'El usuario inicia sesión manualmente en PJUD. Desde sesión activa, Alpha continúa automáticamente.'
  },
  automatic: {
    id: 'automatic',
    label: 'Modo automático completo (experimental)',
    description: 'Solo se habilita cuando exista capacidad real de automatizar login PJUD sin intervención manual.'
  }
}

const SESSION_STATE_LABELS = {
  unauthenticated: 'Sesión no iniciada',
  login_visible: 'Pantalla de login visible',
  authenticated: 'Sesión iniciada correctamente',
  expired: 'Sesión expirada',
  mis_causas_visible: 'Pantalla Mis Causas visible',
  cause_detail_visible: 'Pantalla detalle causa visible'
}

const MASSIVE_STEPS = [
  { id: 1, name: 'Detectar estado de sesión PJUD' },
  { id: 2, name: 'Abrir Mis Causas automáticamente (sesión activa)' },
  { id: 3, name: 'Leer filas y construir cola de causas' },
  { id: 4, name: 'Abrir automáticamente cada causa del lote' },
  { id: 5, name: 'Detectar Ebook / escritos / resoluciones / actuaciones' },
  { id: 6, name: 'Descargar automáticamente documentos pendientes' },
  { id: 7, name: 'Guardar en Expedientes Digitales sin duplicar' },
  { id: 8, name: 'Clasificar por causa y registrar trazabilidad' },
  { id: 9, name: 'Resumen final + estado de pausa/reanudación' }
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

function createMockCauses(total = 13) {
  return Array.from({ length: total }, (_, index) => {
    const id = index + 1
    return {
      id,
      rol: `C-${1200 + id}-2024`,
      tribunal: `Juzgado Civil ${((id - 1) % 3) + 1}`,
      caratula: `Demandante ${id} c/ Demandado ${id}`,
      hasDownloadIssue: id % 6 === 0,
      hasClassificationWarning: id % 5 === 0,
      triggersSessionExpiry: id % 7 === 0,
      documents: {
        detected: false,
        downloaded: false,
        saved: false,
        classified: false
      },
      downloadStatus: 'pending',
      classificationStatus: 'pending'
    }
  })
}

function createInitialAuditState() {
  return {
    currentStepId: null,
    isRunning: false,
    mode: FLOW_MODES.assisted.id,
    automaticModeAvailable: false,
    sessionState: 'unauthenticated',
    currentStatusMessage: 'Sesión no iniciada',
    pauseReason: '',
    pausedAtCauseIndex: null,
    lastValidUrl: 'https://oficinajudicialvirtual.pjud.cl/',
    currentCauseIndex: 0,
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
  if (['success', 'warning', 'failed', 'blocked', 'paused'].includes(status)) step.endedAt = new Date().toISOString()
}

function updateBatchCounters(state) {
  const processed = state.batch.success + state.batch.partial + state.batch.failed
  state.batch.processed = processed
  state.batch.pending = Math.max(0, state.batch.total - processed)
}

function serializeState(state) {
  return {
    mode: state.mode,
    automaticModeAvailable: state.automaticModeAvailable,
    sessionState: state.sessionState,
    currentStatusMessage: state.currentStatusMessage,
    pauseReason: state.pauseReason,
    pausedAtCauseIndex: state.pausedAtCauseIndex,
    lastValidUrl: state.lastValidUrl,
    currentCauseIndex: state.currentCauseIndex,
    steps: state.steps,
    batch: state.batch,
    causes: state.causes,
    processOutcome: state.processOutcome,
    currentSubaction: state.currentSubaction,
    auditLog: state.auditLog
  }
}

function persistState(state) {
  try {
    localStorage.setItem(PERSISTENCE_KEY, JSON.stringify(serializeState(state)))
  } catch (error) {
    console.warn('[Alpha Avocat][carga] No fue posible persistir estado local:', error)
  }
}

function restoreState() {
  try {
    const raw = localStorage.getItem(PERSISTENCE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (error) {
    console.warn('[Alpha Avocat][carga] No fue posible restaurar estado local:', error)
    return null
  }
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

  root.querySelector('#massiveMode').value = state.mode
  root.querySelector('#massiveSessionState').value = state.sessionState
  root.querySelector('#massiveSessionLabel').textContent = SESSION_STATE_LABELS[state.sessionState] || state.sessionState
  root.querySelector('#massiveStatusLine').textContent = state.currentStatusMessage
  root.querySelector('#massivePauseReason').textContent = state.pauseReason || 'Sin pausa activa'
  root.querySelector('#massiveLastUrl').textContent = state.lastValidUrl || 'Sin URL registrada'

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
  root.querySelector('#massiveCheckpoint').textContent = state.batch.total
    ? `Índice actual: ${state.currentCauseIndex + 1} / ${state.batch.total}`
    : 'Sin checkpoint todavía'

  root.querySelector('#massiveStepList').innerHTML = renderStepList(state)
  root.querySelector('#massiveAuditLog').innerHTML = renderLog(state)

  const startBtn = root.querySelector('#massiveStartBtn')
  const retryBtn = root.querySelector('#massiveRetryBtn')
  const resumeBtn = root.querySelector('#massiveResumeBtn')
  startBtn.disabled = state.isRunning
  retryBtn.disabled = state.isRunning || state.batch.failed === 0
  resumeBtn.disabled = state.isRunning || !state.pauseReason

  persistState(state)
}

function buildUI(container) {
  container.innerHTML = `
    <section class="card" aria-labelledby="cargaTitle" style="max-width:1200px;margin:0 auto;display:grid;gap:18px;">
      <header style="display:grid;gap:6px;">
        <h1 id="cargaTitle" style="margin:0;">Módulo ${MODULE_TITLE}</h1>
        <p class="muted" style="margin:0;">Flujo PJUD con estados explícitos de sesión, pausa/reanudación y checkpoint por causa.</p>
        <p class="muted" style="margin:0;">Por razones técnicas y de seguridad, el inicio de sesión en PJUD debe hacerlo el usuario manualmente. Desde sesión activa, Alpha continúa automáticamente.</p>
      </header>

      <section class="panel massive-control" style="padding:16px;border-radius:16px;display:grid;gap:12px;">
        <h2 style="margin:0;font-size:1.06rem;">Inicio de lote masivo</h2>
        <div class="massive-control__grid">
          <label style="display:grid;gap:6px;">
            <span>Modo de operación</span>
            <select id="massiveMode" class="input">
              <option value="assisted">${FLOW_MODES.assisted.label}</option>
              <option value="automatic">${FLOW_MODES.automatic.label}</option>
            </select>
            <small class="muted">${FLOW_MODES.assisted.description}</small>
          </label>
          <label style="display:grid;gap:6px;">
            <span>Estado detectado de sesión PJUD</span>
            <select id="massiveSessionState" class="input">
              ${Object.entries(SESSION_STATE_LABELS).map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}
            </select>
            <small class="muted">Estado actual: <strong id="massiveSessionLabel">Sesión no iniciada</strong></small>
          </label>
          <label style="display:grid;gap:6px;">
            <span>Total de causas del lote (simulado)</span>
            <input id="massiveCauseCount" class="input" type="number" min="1" max="200" value="13">
          </label>
          <div class="massive-control__actions">
            <button id="massiveStartBtn" class="btn btn-3d btn-primary" type="button">Iniciar flujo</button>
            <button id="massiveResumeBtn" class="btn btn-3d" type="button">Reanudar desde pausa</button>
            <button id="massiveRetryBtn" class="btn btn-3d" type="button">Reintentar causas fallidas</button>
          </div>
        </div>
      </section>

      <section class="panel massive-audit" style="padding:16px;border-radius:16px;display:grid;gap:16px;">
        <h2 style="margin:0;font-size:1.06rem;">Panel de auditoría del lote</h2>
        <div class="massive-audit__grid">
          <article class="massive-audit__card massive-audit__card--full">
            <h3>Estado operativo</h3>
            <p>Mensaje: <strong id="massiveStatusLine">Sesión no iniciada</strong></p>
            <p>Pausa: <strong id="massivePauseReason">Sin pausa activa</strong></p>
            <p>Última URL válida: <strong id="massiveLastUrl">https://oficinajudicialvirtual.pjud.cl/</strong></p>
            <p id="massiveCheckpoint">Sin checkpoint todavía</p>
          </article>

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
  const resumeFromPause = Boolean(options.resumeFromPause)

  state.isRunning = true
  state.currentCause = null
  state.currentSubaction = 'Preparando ejecución'
  state.processOutcome = retryOnlyFailed ? 'Reintentando lote parcial' : (resumeFromPause ? 'Reanudando flujo' : 'Ejecución en curso')
  refreshAuditUI(root, state)

  const setStatusMessage = (message) => {
    state.currentStatusMessage = message
    appendAuditLog(state, message)
    refreshAuditUI(root, state)
  }

  const setRunningStep = (stepId, startedMessage, detailMessage) => {
    state.currentStepId = stepId
    state.currentSubaction = startedMessage
    setStepStatus(state, stepId, 'running', detailMessage)
    appendAuditLog(state, `Paso ${stepId} iniciado: ${startedMessage}.`)
    refreshAuditUI(root, state)
  }

  const closeStep = (stepId, status, message, detail = message) => {
    setStepStatus(state, stepId, status, detail)
    appendAuditLog(state, `Paso ${stepId} ${status === 'failed' ? 'fallido' : 'actualizado'}: ${message}.`)
    refreshAuditUI(root, state)
  }

  const pauseBySessionExpiry = (causeIndex) => {
    state.isRunning = false
    state.sessionState = 'expired'
    state.pauseReason = 'La sesión PJUD expiró. Ingrese su clave para continuar.'
    state.pausedAtCauseIndex = causeIndex
    state.currentSubaction = 'pausado por intervención requerida'
    state.processOutcome = 'Pausado por expiración de sesión'
    setStepStatus(state, state.currentStepId || 4, 'paused', state.pauseReason)
    setStatusMessage('La sesión PJUD expiró. Ingrese su clave para continuar.')
    persistState(state)
  }

  try {
    const modeSelect = root.querySelector('#massiveMode')
    const sessionSelect = root.querySelector('#massiveSessionState')
    const countInput = root.querySelector('#massiveCauseCount')

    state.mode = modeSelect.value
    state.sessionState = sessionSelect.value

    if (state.mode === FLOW_MODES.automatic.id && !state.automaticModeAvailable) {
      state.mode = FLOW_MODES.assisted.id
      modeSelect.value = FLOW_MODES.assisted.id
      setStatusMessage('Modo automático completo no disponible: se utilizará modo asistido con login manual.')
    }

    if (!retryOnlyFailed && !resumeFromPause) {
      const selectedCount = Number.parseInt(countInput.value, 10)
      const totalCauses = Number.isFinite(selectedCount) && selectedCount > 0 ? selectedCount : 13
      state.steps = MASSIVE_STEPS.map((step) => ({ ...step, status: 'pending', detail: '', startedAt: null, endedAt: null, blockReason: '' }))
      state.causes = createMockCauses(totalCauses)
      state.batch = { total: state.causes.length, processed: 0, success: 0, partial: 0, failed: 0, pending: state.causes.length }
      state.pauseReason = ''
      state.pausedAtCauseIndex = null
      state.currentCauseIndex = 0
    }

    setRunningStep(1, 'evaluando estado de sesión', 'Detectando sesión no autenticada/autenticada/expirada')
    await delay(180)

    if (state.sessionState !== 'authenticated' && state.sessionState !== 'mis_causas_visible' && state.sessionState !== 'cause_detail_visible') {
      closeStep(1, 'warning', 'sesión no autenticada', 'Modo asistido: se requiere sesión PJUD iniciada por el usuario')
      state.isRunning = false
      state.processOutcome = 'Esperando intervención del usuario'
      state.pauseReason = 'Modo asistido: se requiere sesión PJUD iniciada por el usuario.'
      setStatusMessage('Esperando login manual en PJUD para continuar el flujo automático.')
      return
    }

    closeStep(1, 'success', 'sesión iniciada correctamente', `Estado detectado: ${SESSION_STATE_LABELS[state.sessionState]}`)
    state.pauseReason = ''

    setRunningStep(2, 'abriendo Mis Causas', 'Navegando automáticamente a Mis Causas')
    state.lastValidUrl = 'https://oficinajudicialvirtual.pjud.cl/home/index.php#/mis-causas'
    setStatusMessage('Abriendo Mis Causas')
    await delay(180)
    state.sessionState = 'mis_causas_visible'
    closeStep(2, 'success', 'Mis Causas abierta', 'Pantalla Mis Causas visible')

    setRunningStep(3, 'leyendo filas', `Construyendo cola de ${state.batch.total} causa(s)`)
    setStatusMessage('Leyendo filas')
    await delay(180)
    closeStep(3, 'success', 'cola construida', `${state.batch.total} causa(s) lista(s) para procesamiento`)

    setRunningStep(4, 'abriendo causas', 'Apertura automática de causas una a una')

    const startIndex = retryOnlyFailed
      ? 0
      : (resumeFromPause ? (state.pausedAtCauseIndex ?? state.currentCauseIndex) : state.currentCauseIndex)
    const queue = retryOnlyFailed
      ? state.causes.filter((cause) => cause.downloadStatus === 'failed')
      : state.causes

    for (let index = startIndex; index < queue.length; index += 1) {
      const cause = queue[index]
      state.currentCause = cause
      state.currentCauseIndex = index
      state.sessionState = 'cause_detail_visible'
      state.currentSubaction = `abriendo causa ${index + 1} de ${queue.length}`
      state.lastValidUrl = `https://oficinajudicialvirtual.pjud.cl/home/index.php#/causa/${encodeURIComponent(cause.rol)}`
      setStepStatus(state, 4, 'running', `abriendo causa ${index + 1} de ${queue.length}`)
      setStatusMessage(`Abriendo causa ${index + 1} de ${queue.length}`)
      await delay(110)

      if (!retryOnlyFailed && cause.triggersSessionExpiry && !resumeFromPause) {
        pauseBySessionExpiry(index)
        return
      }

      setRunningStep(5, 'detectando documentos', `Detectando documentos en ${cause.rol}`)
      setStatusMessage('Detectando documentos')
      await delay(90)
      cause.documents.detected = true
      closeStep(5, 'success', 'documentos detectados', `${cause.rol}: Ebook/escritos/resoluciones/actuaciones`) 

      setRunningStep(6, 'descargando documentos', `Descargando en ${cause.rol}`)
      setStatusMessage('Descargando')
      await delay(100)

      if (cause.downloadStatus === 'success') {
        closeStep(6, 'success', 'documentos ya descargados previamente', `${cause.rol}: descarga omitida para evitar duplicación`)
      } else if (cause.hasDownloadIssue) {
        cause.downloadStatus = 'failed'
        closeStep(6, 'warning', 'descarga parcial', `${cause.rol}: enlace documental no disponible`)
      } else {
        cause.downloadStatus = 'success'
        cause.documents.downloaded = true
        closeStep(6, 'success', 'descarga completada', `${cause.rol}: descarga realizada`) 
      }

      setRunningStep(7, 'guardando documentos', `Guardando en expediente ${cause.rol}`)
      setStatusMessage('Guardando')
      await delay(90)
      if (cause.downloadStatus === 'success') {
        cause.documents.saved = true
        closeStep(7, 'success', 'guardado completado', `${cause.rol}: guardado en expediente digital`) 
      } else {
        closeStep(7, 'warning', 'guardado omitido', `${cause.rol}: sin archivo descargado`) 
      }

      setRunningStep(8, 'clasificando documentos', `Clasificando en ${cause.rol}`)
      await delay(90)
      if (cause.downloadStatus !== 'success') {
        cause.classificationStatus = 'skipped'
        closeStep(8, 'warning', 'clasificación omitida', `${cause.rol}: no hay descarga válida`) 
      } else if (cause.hasClassificationWarning) {
        cause.classificationStatus = 'warning'
        cause.documents.classified = true
        closeStep(8, 'warning', 'clasificación con advertencia', `${cause.rol}: revisar clasificación final`) 
      } else {
        cause.classificationStatus = 'success'
        cause.documents.classified = true
        closeStep(8, 'success', 'clasificación exitosa', `${cause.rol}: clasificación completa`) 
      }

      state.sessionState = 'mis_causas_visible'
    }

    state.batch.success = state.causes.filter((cause) => cause.downloadStatus === 'success' && cause.classificationStatus === 'success').length
    state.batch.partial = state.causes.filter((cause) => cause.downloadStatus === 'success' && cause.classificationStatus === 'warning').length
    state.batch.failed = state.causes.filter((cause) => cause.downloadStatus === 'failed').length
    updateBatchCounters(state)

    setRunningStep(9, 'cerrando lote', 'Generando resumen final y disponibilidad de reintento')
    await delay(120)
    closeStep(9, state.batch.failed > 0 ? 'warning' : 'success', 'resumen generado', `Correctas ${state.batch.success}, parciales ${state.batch.partial}, fallidas ${state.batch.failed}`)

    state.currentSubaction = state.batch.failed > 0
      ? 'Finalizado con causas marcadas para reintento'
      : 'Finalizado sin observaciones'
    state.processOutcome = state.batch.failed > 0
      ? 'Descarga parcial (lote continúa)'
      : (state.batch.partial > 0 ? 'Completado con advertencias de clasificación' : 'Completado con éxito')
    state.pauseReason = ''
    state.pausedAtCauseIndex = null
    state.currentCauseIndex = Math.max(0, state.batch.total - 1)
    setStatusMessage('Proceso finalizado')
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

  const persisted = restoreState()
  const state = Object.assign(createInitialAuditState(), persisted || {})
  if (!Array.isArray(state.steps) || !state.steps.length) state.steps = createInitialAuditState().steps
  if (!Array.isArray(state.causes)) state.causes = []
  if (!Array.isArray(state.auditLog)) state.auditLog = []

  refreshAuditUI(container, state)

  const startBtn = container.querySelector('#massiveStartBtn')
  const retryBtn = container.querySelector('#massiveRetryBtn')
  const resumeBtn = container.querySelector('#massiveResumeBtn')
  const modeSelect = container.querySelector('#massiveMode')
  const sessionSelect = container.querySelector('#massiveSessionState')

  modeSelect.addEventListener('change', () => {
    state.mode = modeSelect.value
    if (state.mode === FLOW_MODES.automatic.id && !state.automaticModeAvailable) {
      state.mode = FLOW_MODES.assisted.id
      modeSelect.value = FLOW_MODES.assisted.id
      state.currentStatusMessage = 'Modo automático completo no disponible: se mantiene modo asistido.'
      appendAuditLog(state, state.currentStatusMessage)
    }
    refreshAuditUI(container, state)
  })

  sessionSelect.addEventListener('change', () => {
    state.sessionState = sessionSelect.value
    state.currentStatusMessage = SESSION_STATE_LABELS[state.sessionState]
    appendAuditLog(state, `Estado de sesión cambiado a: ${SESSION_STATE_LABELS[state.sessionState]}.`)
    refreshAuditUI(container, state)
  })

  startBtn?.addEventListener('click', () => {
    if (state.isRunning) return
    executeMassiveFlow(container, state, { retryOnlyFailed: false, resumeFromPause: false })
  })

  retryBtn?.addEventListener('click', () => {
    if (state.isRunning || state.batch.failed === 0) return
    setStepStatus(state, 6, 'retrying', 'Reintentando descarga de causas fallidas')
    appendAuditLog(state, `Reintento iniciado sobre ${state.batch.failed} causa(s) fallida(s).`)
    refreshAuditUI(container, state)
    executeMassiveFlow(container, state, { retryOnlyFailed: true, resumeFromPause: false })
  })

  resumeBtn?.addEventListener('click', () => {
    if (state.isRunning || !state.pauseReason) return
    state.pauseReason = ''
    state.sessionState = 'authenticated'
    appendAuditLog(state, 'Reanudación solicitada tras intervención de login manual.')
    executeMassiveFlow(container, state, { retryOnlyFailed: false, resumeFromPause: true })
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
