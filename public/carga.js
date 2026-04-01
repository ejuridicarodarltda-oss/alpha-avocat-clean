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
  { id: 1, name: 'Importar lista fuente de causas' },
  { id: 2, name: 'Normalizar datos por causa (competencia, tribunal, ROL/RIT, año)' },
  { id: 3, name: 'Resolver estrategia PJUD por competencia y filtros reales' },
  { id: 4, name: 'Abrir causa validada en PJUD (carátula + tribunal)' },
  { id: 5, name: 'Descargar a almacenamiento temporal del sistema' },
  { id: 6, name: 'Crear/actualizar causa madre en Fabocat' },
  { id: 7, name: 'Clasificar automáticamente la causa madre' },
  { id: 8, name: 'Mover documentos al expediente digital canónico' },
  { id: 9, name: 'Publicar en visor solo si validación interna está completa' },
  { id: 10, name: 'Resumen del lote, trazabilidad y reintento controlado' }
]

const DEFAULT_STEP_DETAIL = {
  4: 'Abriendo causa validada por tribunal y carátula',
  5: 'Descargando contenido a almacenamiento temporal interno',
  6: 'Creando o actualizando causa madre en Fabocat',
  7: 'Clasificando causa madre automáticamente',
  8: 'Moviendo documentos al expediente digital correcto',
  9: 'Validación interna previa a publicación'
}

const PJUD_SESSION_LABEL = {
  not_authenticated: 'no autenticado',
  waiting_manual_login: 'esperando login manual',
  active: 'sesión iniciada',
  expired: 'sesión expirada',
  mis_causas_visible: 'mis causas visible',
  detalle_causa_visible: 'detalle de causa visible'
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
      pending: 0,
      autoClassified: 0,
      pendingClassification: 0,
      withObservation: 0
    },
    causes: [],
    currentCause: null,
    queue: [],
    queueCursor: 0,
    currentSubaction: 'Sin actividad',
    processOutcome: 'Sin ejecución',
    auditLog: [],
    pjud: {
      sessionState: 'not_authenticated',
      paused: false,
      pauseReason: '',
      resumeFromCauseId: null
    },
    finalWarningReason: 'Sin advertencias'
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

function getPjudSessionStateLabel(sessionState) {
  return PJUD_SESSION_LABEL[sessionState] || sessionState
}

function inferPjudSessionState() {
  const candidate = window.__PJUD_SESSION_STATE__
    || window.localStorage?.getItem('pjud.session.state')
    || 'not_authenticated'
  if (PJUD_SESSION_LABEL[candidate]) return candidate
  return 'not_authenticated'
}

function refreshPjudSessionState(state, { force = false } = {}) {
  const inferred = inferPjudSessionState()
  if (force || state.pjud.sessionState !== inferred) {
    state.pjud.sessionState = inferred
  }
  return state.pjud.sessionState
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
  root.querySelector('#massivePjudState').textContent = getPjudSessionStateLabel(state.pjud.sessionState)
  root.querySelector('#massivePauseReason').textContent = state.pjud.paused
    ? state.pjud.pauseReason
    : 'Sin pausa activa'

  root.querySelector('#massiveBatchTotal').textContent = String(state.batch.total)
  root.querySelector('#massiveBatchProcessed').textContent = String(state.batch.processed)
  root.querySelector('#massiveBatchSuccess').textContent = String(state.batch.success)
  root.querySelector('#massiveBatchPartial').textContent = String(state.batch.partial)
  root.querySelector('#massiveBatchFailed').textContent = String(state.batch.failed)
  root.querySelector('#massiveBatchPending').textContent = String(state.batch.pending)
  root.querySelector('#massiveBatchAutoClassified').textContent = String(state.batch.autoClassified || 0)
  root.querySelector('#massiveBatchPendingClassification').textContent = String(state.batch.pendingClassification || 0)
  root.querySelector('#massiveBatchWithObservation').textContent = String(state.batch.withObservation || 0)
  root.querySelector('#massiveFinalWarningReason').textContent = state.finalWarningReason || 'Sin advertencias'

  root.querySelector('#massiveStepList').innerHTML = renderStepList(state)
  root.querySelector('#massiveAuditLog').innerHTML = renderLog(state)

  const startBtn = root.querySelector('#massiveStartBtn')
  const retryBtn = root.querySelector('#massiveRetryBtn')
  const resumeBtn = root.querySelector('#massiveResumeBtn')
  startBtn.disabled = state.isRunning
  retryBtn.disabled = state.isRunning || state.batch.failed === 0
  resumeBtn.disabled = state.isRunning || !state.pjud.paused
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
            <button id="massiveResumeBtn" class="btn btn-3d" type="button">Reanudar lote pausado</button>
          </div>
          <small class="muted">Estado real PJUD: no autenticado · esperando login manual · sesión iniciada · sesión expirada · mis causas visible · detalle de causa visible.</small>
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
            <p>Estado sesión PJUD: <strong id="massivePjudState"></strong></p>
            <p>Pausa: <strong id="massivePauseReason"></strong></p>
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
              <li>Clasificadas automáticamente: <strong id="massiveBatchAutoClassified">0</strong></li>
              <li>Pendientes de clasificación: <strong id="massiveBatchPendingClassification">0</strong></li>
              <li>Con observación: <strong id="massiveBatchWithObservation">0</strong></li>
              <li>Motivo advertencia final: <strong id="massiveFinalWarningReason">Sin advertencias</strong></li>
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
  const resumePaused = Boolean(options.resumePaused)

  const inputEl = root.querySelector('#massiveCauseCount')
  const excelInputEl = root.querySelector('#massiveExcelInput')
  const selectedCount = Number.parseInt(inputEl.value, 10)
  const totalCauses = Number.isFinite(selectedCount) && selectedCount > 0 ? selectedCount : 13
  const excelFile = excelInputEl?.files?.[0]

  state.isRunning = true
  if (!resumePaused) {
    state.currentStepId = null
    state.currentCause = null
  }
  state.currentSubaction = resumePaused ? 'Reanudando lote' : 'Preparando ejecución'
  state.processOutcome = retryOnlyFailed
    ? 'Reintentando lote parcial'
    : (resumePaused ? 'Reanudando lote pausado' : 'Ejecución en curso')

  if (!retryOnlyFailed && !resumePaused) {
    state.steps = MASSIVE_STEPS.map((step) => ({ ...step, status: 'pending', detail: '', startedAt: null, endedAt: null, blockReason: '' }))
    state.causes = createMockCauses(totalCauses)
    state.batch = {
      total: state.causes.length,
      processed: 0,
      success: 0,
      partial: 0,
      failed: 0,
      pending: state.causes.length,
      autoClassified: 0,
      pendingClassification: 0,
      withObservation: 0
    }
    state.finalWarningReason = 'Sin advertencias'
    appendAuditLog(state, `Excel cargado correctamente: ${excelFile?.name || 'sin archivo seleccionado (modo simulado)'}.`)
  }
  refreshPjudSessionState(state, { force: true })
  if (state.pjud.sessionState === 'not_authenticated') {
    state.pjud.sessionState = 'waiting_manual_login'
    window.localStorage?.setItem('pjud.session.state', state.pjud.sessionState)
  }
  state.pjud.paused = false
  state.pjud.pauseReason = ''

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
    if (!resumePaused) {
      setRunningStep(1, 'importando lista base del lote', `Archivo: ${excelFile?.name || 'no informado'}`)
    }
    await delay(260)
    if (!resumePaused) {
      closeStep(1, 'success', 'superado con éxito', `Lista fuente cargada: ${excelFile?.name || 'simulada'}`)
    }

    setRunningStep(2, 'normalizando atributos judiciales por causa', 'Persistiendo competencia, tribunal, identificador y año')
    await delay(320)
    closeStep(2, 'success', 'superado con éxito', 'Normalización estructural completada')

    setRunningStep(3, 'resolviendo estrategia de búsqueda PJUD', `Aplicando filtros por competencia para ${state.batch.total} causas`)
    await delay(380)
    closeStep(3, 'success', 'superado con éxito', `Estrategia PJUD resuelta: ${state.batch.total} causas detectadas`)

    setRunningStep(4, 'abriendo causas validadas en PJUD', `${DEFAULT_STEP_DETAIL[4]} 1 de ${state.batch.total}`)
    await delay(300)
    closeStep(4, 'success', 'superado con éxito', `Validación de carátula/tribunal completada para ${state.batch.total} causas`)

    const queue = retryOnlyFailed
      ? state.causes.filter((cause) => cause.downloadStatus === 'failed')
      : [...state.causes]
    state.queue = queue
    if (!resumePaused) {
      state.queueCursor = 0
    }

    setRunningStep(5, 'descargando en carpeta temporal controlada', `${DEFAULT_STEP_DETAIL[5]} 1 de ${queue.length || state.batch.total}`)

    for (let index = state.queueCursor; index < queue.length; index += 1) {
      const cause = queue[index]
      refreshPjudSessionState(state, { force: true })
      if (state.pjud.sessionState === 'not_authenticated' || state.pjud.sessionState === 'waiting_manual_login') {
        state.pjud.paused = true
        state.pjud.pauseReason = 'esperando login manual'
        state.pjud.resumeFromCauseId = cause.id
        state.queueCursor = index
        state.currentCause = cause
        state.currentSubaction = 'esperando login manual'
        state.processOutcome = 'Pausado: esperando login manual'
        appendAuditLog(state, `Pausa de lote: esperando login manual en ${cause.rol} (${index + 1} de ${queue.length}).`)
        return
      }
      if (state.pjud.sessionState === 'expired') {
        state.pjud.paused = true
        state.pjud.pauseReason = 'sesión expirada'
        state.pjud.resumeFromCauseId = cause.id
        state.queueCursor = index
        state.currentCause = cause
        state.currentSubaction = 'sesión expirada'
        state.processOutcome = 'Pausado: sesión expirada'
        appendAuditLog(state, `Sesión PJUD expirada. Lote pausado en ${cause.rol} (${index + 1} de ${queue.length}).`)
        return
      }
      state.currentCause = cause
      state.currentSubaction = `abriendo causa ${index + 1} de ${queue.length}`
      setStepStatus(state, 5, 'running', `${DEFAULT_STEP_DETAIL[5]} ${index + 1} de ${queue.length}: ${cause.rol}`)
      appendAuditLog(state, `abriendo causa ${index + 1} de ${queue.length}: ${cause.rol}.`)
      refreshAuditUI(root, state)
      await delay(200)
      if (cause.downloadStatus === 'success') {
        appendAuditLog(state, `Descarga omitida (ya completada): ${cause.rol}.`)
        continue
      }
      cause.downloadStatus = cause.hasDownloadIssue ? 'failed' : 'success'
      if (cause.downloadStatus === 'success') {
        appendAuditLog(state, `descarga completada: ${cause.rol}.`)
      } else {
        appendAuditLog(state, `descarga fallida: ${cause.rol}.`)
      }
      state.queueCursor = index + 1
    }

    closeStep(5, 'success', 'superado con éxito', `Descarga temporal completada para ${queue.length} causas`)

    if (!queue.length) {
      state.currentStepId = 6
      setStepStatus(state, 6, 'blocked', 'Paso bloqueado por dependencia', 'Paso 6 bloqueado: no existen causas válidas en cola')
      appendAuditLog(state, 'Paso 6 bloqueado: no existen causas válidas en cola.')
      closeStep(10, 'warning', 'completado con advertencia', 'No hubo causas para procesar en descarga')
      state.processOutcome = 'Completado con advertencia'
      state.isRunning = false
      refreshAuditUI(root, state)
      return
    }

    setRunningStep(6, 'creando o actualizando causa madre', `${DEFAULT_STEP_DETAIL[6]} 1 de ${queue.length}`)

    for (let index = 0; index < queue.length; index += 1) {
      const cause = queue[index]
      if (cause.saveStatus === 'success') continue
      state.currentCause = cause
      state.currentSubaction = 'sincronizando causa madre'
      setStepStatus(state, 6, 'running', `${DEFAULT_STEP_DETAIL[6]} ${index + 1} de ${queue.length}: ${cause.rol}`)
      refreshAuditUI(root, state)
      await delay(210)
      if (cause.downloadStatus === 'failed') {
        appendAuditLog(state, `Paso 6 fallido en causa ${cause.rol}: no fue posible crear/actualizar la causa madre.`)
      } else {
        cause.saveStatus = 'success'
      }
    }

    const failedDownloads = queue.filter((cause) => cause.downloadStatus === 'failed').length
    if (failedDownloads > 0) {
      closeStep(6, 'warning', 'completado con advertencia', `Sincronización parcial: ${failedDownloads} causa(s) con error`) 
    } else {
      closeStep(6, 'success', 'superado con éxito', 'Causa madre actualizada sin errores')
    }

    setRunningStep(7, 'clasificando causa madre por reglas automáticas', `${DEFAULT_STEP_DETAIL[7]} 1 de ${queue.length}`)

    for (let index = 0; index < queue.length; index += 1) {
      const cause = queue[index]
      state.currentCause = cause
      state.currentSubaction = 'asignando materia canónica'
      setStepStatus(state, 7, 'running', `${DEFAULT_STEP_DETAIL[7]} ${index + 1} de ${queue.length}: ${cause.rol}`)
      refreshAuditUI(root, state)
      await delay(200)
      if (!cause.classificationStatus) {
        cause.saveStatus = cause.downloadStatus === 'failed' ? 'skipped' : 'success'
      }
    }

    closeStep(7, failedDownloads > 0 ? 'warning' : 'success', failedDownloads > 0 ? 'completado con advertencia' : 'superado con éxito', failedDownloads > 0 ? `Clasificación parcial: ${failedDownloads} causa(s) en pendiente de validación` : 'Clasificación canónica completada')

    setRunningStep(8, 'moviendo documentos al expediente canónico', `${DEFAULT_STEP_DETAIL[8]} 1 de ${queue.length}`)

    let warningClassifications = 0
    for (let index = 0; index < queue.length; index += 1) {
      const cause = queue[index]
      state.currentCause = cause
      state.currentSubaction = 'moviendo documento clasificado'
      setStepStatus(state, 8, 'running', `${DEFAULT_STEP_DETAIL[8]} ${index + 1} de ${queue.length}: ${cause.rol}`)
      refreshAuditUI(root, state)
      await delay(170)

      if (cause.classificationStatus === 'success' || cause.classificationStatus === 'warning') continue
      if (cause.hasClassificationWarning && cause.downloadStatus !== 'failed') {
        cause.classificationStatus = 'warning'
        cause.classificationReason = 'materia principal detectada con observación de consistencia'
        cause.primaryMatter = 'Civil'
        cause.incompatibleMatterDuplication = false
        warningClassifications += 1
        appendAuditLog(state, `clasificación pendiente: ${cause.rol}.`)
      } else if (cause.downloadStatus === 'failed') {
        cause.classificationStatus = 'skipped'
        cause.classificationReason = 'no clasificable por descarga fallida'
        cause.primaryMatter = null
        cause.incompatibleMatterDuplication = false
        appendAuditLog(state, `clasificación pendiente: ${cause.rol} (descarga fallida).`)
      } else {
        cause.classificationStatus = 'success'
        cause.classificationReason = 'clasificación automática válida'
        cause.primaryMatter = 'Civil'
        cause.incompatibleMatterDuplication = false
        appendAuditLog(state, `clasificación completada: ${cause.rol}.`)
      }
    }

    if (warningClassifications > 0) {
      closeStep(8, 'warning', 'completado con advertencia', `Movimiento con advertencia: ${warningClassifications} causa(s)`) 
    } else {
      closeStep(8, 'success', 'superado con éxito', 'Movimiento al expediente digital completado')
    }

    state.batch.success = state.causes.filter((cause) => cause.downloadStatus === 'success' && cause.classificationStatus === 'success').length
    state.batch.partial = state.causes.filter((cause) => cause.downloadStatus === 'success' && cause.classificationStatus === 'warning').length
    state.batch.failed = state.causes.filter((cause) => cause.downloadStatus === 'failed').length
    updateBatchCounters(state)

    setRunningStep(9, 'validando consistencia antes de publicar', `${DEFAULT_STEP_DETAIL[9]} para ${queue.length} causas`)
    await delay(250)
    const invalidPrimaryMatter = state.causes.filter((cause) => cause.downloadStatus === 'success' && !cause.primaryMatter).length
    const duplicatedIncompatible = state.causes.filter((cause) => cause.incompatibleMatterDuplication === true).length
    const pendingClassification = state.causes.filter((cause) => cause.classificationStatus === 'skipped').length
    const withObservation = state.causes.filter((cause) => cause.classificationStatus === 'warning').length
    const autoClassified = state.causes.filter((cause) => cause.classificationStatus === 'success').length

    state.batch.autoClassified = autoClassified
    state.batch.pendingClassification = pendingClassification
    state.batch.withObservation = withObservation

    const validationWarnings = []
    if (invalidPrimaryMatter > 0) validationWarnings.push(`${invalidPrimaryMatter} sin materia principal`)
    if (duplicatedIncompatible > 0) validationWarnings.push(`${duplicatedIncompatible} duplicada(s) en materias incompatibles`)
    if (pendingClassification > 0) validationWarnings.push(`${pendingClassification} en "Pendiente de clasificación"`)

    if (validationWarnings.length > 0) {
      state.finalWarningReason = `Validación Fabocat: ${validationWarnings.join('; ')}`
      closeStep(9, 'warning', 'completado con advertencia', state.finalWarningReason)
    } else {
      state.finalWarningReason = 'Sin advertencias'
      closeStep(9, 'success', 'superado con éxito', 'Validación Fabocat completada: materia principal única y sin duplicidades incompatibles')
    }

    setRunningStep(10, 'consolidando resumen del lote', 'Registrando trazabilidad, estado de publicación y reintentos')
    await delay(150)

    const status10 = state.batch.failed > 0 || state.batch.partial > 0 || state.finalWarningReason !== 'Sin advertencias' ? 'warning' : 'success'
    const summaryMessage = status10 === 'success'
      ? 'superado con éxito'
      : `completado con advertencia: ${state.batch.failed} fallida(s), ${state.batch.partial} parcial(es), motivo: ${state.finalWarningReason}`
    closeStep(10, status10, summaryMessage, `Resumen: ${state.batch.success} correctas, ${state.batch.partial} parciales, ${state.batch.failed} fallidas, ${state.batch.autoClassified} auto-clasificadas, ${state.batch.pendingClassification} pendientes de clasificación, ${state.batch.withObservation} con observación. Motivo final: ${state.finalWarningReason}`)

    state.queueCursor = state.queue.length
    state.currentSubaction = state.batch.failed > 0
      ? 'Finalizado con causas marcadas para reintento'
      : 'Finalizado sin observaciones'
    state.processOutcome = state.batch.failed > 0
      ? 'Descarga parcial (lote continúa)'
      : (state.batch.partial > 0 ? 'Completado con advertencias de clasificación' : 'Completado con éxito')
    appendAuditLog(state, `Lote finalizado. Correctas: ${state.batch.success}, parciales: ${state.batch.partial}, fallidas: ${state.batch.failed}, auto-clasificadas: ${state.batch.autoClassified}, pendientes clasificación: ${state.batch.pendingClassification}, con observación: ${state.batch.withObservation}. Motivo advertencia final: ${state.finalWarningReason}.`)
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
  refreshPjudSessionState(state, { force: true })
  refreshAuditUI(container, state)

  const startBtn = container.querySelector('#massiveStartBtn')
  const retryBtn = container.querySelector('#massiveRetryBtn')
  const resumeBtn = container.querySelector('#massiveResumeBtn')

  const setPjudState = (sessionState, message) => {
    window.__PJUD_SESSION_STATE__ = sessionState
    window.localStorage?.setItem('pjud.session.state', sessionState)
    refreshPjudSessionState(state, { force: true })
    appendAuditLog(state, message || `Estado PJUD actualizado: ${getPjudSessionStateLabel(sessionState)}.`)
    refreshAuditUI(container, state)
  }

  startBtn?.addEventListener('click', () => {
    if (state.isRunning) return
    if (state.pjud.sessionState === 'not_authenticated') {
      setPjudState('waiting_manual_login', 'Estado PJUD: esperando login manual.')
    }
    executeMassiveFlow(container, state, { retryOnlyFailed: false })
  })

  retryBtn?.addEventListener('click', () => {
    if (state.isRunning || state.batch.failed === 0) return
    setStepStatus(state, 5, 'retrying', 'Reintentando descarga temporal de causas fallidas')
    appendAuditLog(state, `Reintento iniciado sobre ${state.batch.failed} causa(s) fallida(s).`)
    refreshAuditUI(container, state)
    executeMassiveFlow(container, state, { retryOnlyFailed: true })
  })

  resumeBtn?.addEventListener('click', () => {
    if (state.isRunning || !state.pjud.paused) return
    setPjudState('active', 'sesión iniciada. reanudando lote.')
    appendAuditLog(state, `Reanudación solicitada desde causa pendiente ${state.currentCause?.rol || 'sin referencia'}.`)
    executeMassiveFlow(container, state, { retryOnlyFailed: false, resumePaused: true })
  })

  container.addEventListener('keydown', (event) => {
    if (!event.altKey) return
    if (event.key.toLowerCase() === 'l') setPjudState('waiting_manual_login', 'Estado PJUD: esperando login manual.')
    if (event.key.toLowerCase() === 's') setPjudState('active', 'Estado PJUD: sesión iniciada.')
    if (event.key.toLowerCase() === 'e') setPjudState('expired', 'Estado PJUD: sesión expirada.')
    if (event.key.toLowerCase() === 'm') setPjudState('mis_causas_visible', 'Estado PJUD: mis causas visible.')
    if (event.key.toLowerCase() === 'd') setPjudState('detalle_causa_visible', 'Estado PJUD: detalle de causa visible.')
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
