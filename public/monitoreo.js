import { supabase, requireAuth } from './app.js'
import { loadWorkspace } from './causas-services.js'

const MONITORING_STORAGE_KEY = 'alpha_avocat_monitoreo_v1'
export const MONITORING_ALERTS_STORAGE_KEY = 'alpha_avocat_monitoreo_alertas_v1'
const CASES_TABLE = 'cases'

const ROUTE_OPTIONS = [
  'demanda directa', 'inicio por medida prejudicial', 'inicio por medida prejudicial probatoria', 'inicio por medida prejudicial preparatoria',
  'inicio por medida prejudicial precautoria', 'inicio por requerimiento', 'inicio por denuncia', 'inicio por solicitud administrativa o judicial',
  'comparece', 'no comparece', 'contesta', 'no contesta', 'se allana', 'opone excepciones', 'opone excepciones dilatorias', 'opone excepciones perentorias',
  'interpone recurso', 'no interpone recurso', 'paga', 'no paga', 'cumple', 'no cumple', 'rinde prueba', 'no rinde prueba', 'subsana', 'no subsana',
  'se transforma a otro procedimiento', 'termina por sentencia', 'termina por acuerdo', 'termina por pago', 'termina por restitución', 'termina por inadmisibilidad',
  'termina por archivo', 'termina por ejecución', 'termina por abandono', 'termina por nueva audiencia', 'termina por remisión a otra vía procedimental'
]

const PROCEDURE_GROUPS = [
  { category: 'Civil / CPC / Código Civil', items: ['medidas prejudiciales preparatorias','medidas prejudiciales probatorias','medidas prejudiciales precautorias','medidas precautorias dentro del juicio','juicio ordinario de mayor cuantía','juicio ordinario de menor cuantía','juicio de mínima cuantía','procedimiento incidental','procedimiento sumario','juicio ejecutivo de obligación de dar','juicio ejecutivo de obligación de hacer','juicio ejecutivo de obligación de no hacer','cumplimiento incidental de sentencia','juicios sobre cuentas','juicios sobre pago de ciertos honorarios','interdictos posesorios','querella de amparo','querella de restitución','querella de restablecimiento','denuncia de obra nueva','denuncia de obra ruinosa','interdictos especiales','actos judiciales no contenciosos'] },
  { category: 'Recursos civiles y disciplinarios', items: ['recurso de reposición','aclaración, rectificación, agregación o enmienda','recurso de apelación','casación en la forma','casación en el fondo','recurso de revisión','queja disciplinaria','recurso de queja'] },
  { category: 'Familia', items: ['procedimiento ordinario o común ante tribunales de familia','procedimiento de aplicación judicial de medidas de protección de derechos de NNA','procedimiento por actos de violencia intrafamiliar','actos judiciales no contenciosos de competencia de familia','procedimiento contravencional ante tribunales de familia'] },
  { category: 'Penal', items: ['procedimiento ordinario con juicio oral','procedimiento simplificado','procedimiento monitorio penal','procedimiento por delito de acción privada','procedimiento abreviado','querella de capítulos','recurso de nulidad penal'] },
  { category: 'Laboral', items: ['procedimiento de aplicación general','procedimiento de tutela laboral','procedimiento monitorio laboral','procedimiento de cumplimiento de la sentencia','procedimiento de ejecución de títulos ejecutivos laborales','procedimiento de cobranza judicial de cotizaciones','recurso de nulidad laboral'] },
  { category: 'Insolvencia y reemprendimiento', items: ['acuerdo de reorganización extrajudicial','procedimiento concursal de reorganización de la empresa deudora','procedimiento concursal de liquidación de la empresa deudora','liquidación voluntaria','liquidación forzosa','procedimiento concursal de renegociación de la persona deudora','procedimiento concursal de liquidación simplificada','procedimiento concursal de reorganización simplificada'] },
  { category: 'Constitucional y administrativo especial', items: ['recurso de amparo','recurso de protección','requerimiento de inaplicabilidad por inconstitucionalidad','reclamación de ilegalidad de decreto municipal'] }
]

const PROCEDURE_KEYWORDS = [
  { procedure: 'juicio ordinario de mayor cuantía', keywords: ['ordinario', 'demanda', 'réplica', 'dúplica', 'prueba'] },
  { procedure: 'procedimiento sumario', keywords: ['sumario', 'audiencia única'] },
  { procedure: 'juicio ejecutivo de obligación de dar', keywords: ['ejecutivo', 'mandamiento', 'requerimiento de pago', 'embargo'] },
  { procedure: 'procedimiento ordinario o común ante tribunales de familia', keywords: ['familia', 'cuidado personal', 'alimentos', 'relación directa'] },
  { procedure: 'procedimiento por actos de violencia intrafamiliar', keywords: ['vif', 'violencia intrafamiliar', 'medidas cautelares'] },
  { procedure: 'procedimiento ordinario con juicio oral', keywords: ['formalización', 'acusación', 'juicio oral', 'garantía'] },
  { procedure: 'procedimiento simplificado', keywords: ['simplificado', 'monitorio penal'] },
  { procedure: 'procedimiento de aplicación general', keywords: ['laboral', 'despido', 'cotizaciones', 'tutela laboral'] },
  { procedure: 'recurso de protección', keywords: ['corte de apelaciones', 'protección', 'arbitrario', 'ilegal'] },
  { procedure: 'recurso de amparo', keywords: ['amparo', 'libertad personal'] }
]

const MILESTONE_LIBRARY = [
  { key: 'demanda', label: 'Demanda ingresada', trigger: ['demanda', 'requerimiento'], next: 'Notificación de demanda', defaultDeadlineDays: 0 },
  { key: 'notificacion', label: 'Notificación de demanda', trigger: ['notificación', 'notificada'], next: 'Contestación', defaultDeadlineDays: 15 },
  { key: 'contestacion', label: 'Contestación', trigger: ['contestación', 'contesta'], next: 'Réplica/Dúplica', defaultDeadlineDays: 6 },
  { key: 'prueba', label: 'Auto de prueba / etapa probatoria', trigger: ['prueba', 'término probatorio', 'auto de prueba'], next: 'Observaciones a la prueba', defaultDeadlineDays: 10 },
  { key: 'sentencia', label: 'Sentencia definitiva', trigger: ['sentencia', 'fallo'], next: 'Recursos', defaultDeadlineDays: 10 },
  { key: 'recurso', label: 'Interposición de recurso', trigger: ['apelación', 'casación', 'recurso'], next: 'Tramitación de recurso', defaultDeadlineDays: 5 },
  { key: 'cumplimiento', label: 'Cumplimiento/ejecución', trigger: ['cumplimiento', 'ejecución', 'liquidación'], next: 'Cierre de causa', defaultDeadlineDays: 0 }
]

function parseJSON(value, fallback) {
  try { return JSON.parse(value) } catch { return fallback }
}

function loadMonitoringState() {
  return parseJSON(localStorage.getItem(MONITORING_STORAGE_KEY) || '{}', {})
}

function saveMonitoringState(state) {
  localStorage.setItem(MONITORING_STORAGE_KEY, JSON.stringify(state))
}

function normalize(value = '') {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function toDate(value) {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatDate(value) {
  const parsed = toDate(value)
  return parsed ? parsed.toLocaleDateString('es-CL') : 'Sin fecha'
}

function scoreProcedureMatch(caseRecord, detail, procedureRule) {
  const blob = normalize([
    caseRecord.subject, caseRecord.materia, caseRecord.court, caseRecord.caratula, caseRecord.pjud_caratulado,
    ...(detail.documents || []).map((doc) => `${doc.name} ${doc.category} ${doc.observation}`),
    ...(detail.movements || []).map((mv) => `${mv.title || ''} ${mv.description || ''}`)
  ].join(' | '))

  const hits = procedureRule.keywords.filter((keyword) => blob.includes(normalize(keyword))).length
  const score = hits / procedureRule.keywords.length
  return { score, hits }
}

function detectProcedure(caseRecord, detail, manualProcedure = '') {
  if (manualProcedure) {
    return { procedure: manualProcedure, confidence: 1, status: 'validado por usuario', conflict: false }
  }

  let best = { procedure: 'procedimiento pendiente de validación', confidence: 0, status: 'pendiente de validación', conflict: false }
  let second = 0

  PROCEDURE_KEYWORDS.forEach((rule) => {
    const result = scoreProcedureMatch(caseRecord, detail, rule)
    if (result.score > best.confidence) {
      second = best.confidence
      best = {
        procedure: rule.procedure,
        confidence: result.score,
        status: result.score >= 0.5 ? 'identificado automáticamente' : 'procedimiento probable',
        conflict: false
      }
    } else if (result.score > second) {
      second = result.score
    }
  })

  if (best.confidence === 0) return { procedure: 'procedimiento pendiente de validación', confidence: 0, status: 'pendiente de validación', conflict: false }
  if (best.confidence < 0.5) best.status = 'procedimiento probable'
  if (best.confidence - second <= 0.2 && best.confidence > 0) best.conflict = true
  return best
}

function detectMilestones(caseRecord, detail) {
  const events = []
  const documents = detail.documents || []
  const movements = detail.movements || []
  const text = normalize([
    caseRecord.notes,
    ...documents.map((doc) => `${doc.name} ${doc.category} ${doc.observation}`),
    ...movements.map((mv) => `${mv.title || ''} ${mv.description || ''}`)
  ].join(' | '))

  MILESTONE_LIBRARY.forEach((item) => {
    const matched = item.trigger.some((keyword) => text.includes(normalize(keyword)))
    if (matched) {
      events.push({
        key: item.key,
        label: item.label,
        next: item.next,
        deadlineDays: item.defaultDeadlineDays,
        detected: true
      })
    }
  })

  if (!events.length) {
    events.push({ key: 'inicio', label: 'Inicio y revisión de expediente', next: 'Clasificación de procedimiento', deadlineDays: 2, detected: false })
  }

  const current = events[events.length - 1]
  return {
    all: events,
    current,
    next: current.next || 'Revisión manual de ruta procesal'
  }
}

function computeDeadlines(caseRecord, milestones, customDeadlines = []) {
  const today = new Date()
  const notificationDate = toDate(caseRecord.pjud_fecha_ubicacion || caseRecord.updated_at || caseRecord.created_at) || today
  const generated = milestones.all.slice(-2).map((milestone, index) => {
    const due = new Date(notificationDate)
    due.setDate(due.getDate() + (milestone.deadlineDays || 0) + (index * 2))
    return {
      id: `auto-${milestone.key}-${index}`,
      type: milestone.label,
      dueDate: due.toISOString(),
      legalBasis: 'Base legal interna del sistema (editable por usuario)',
      action: `Preparar actuación vinculada a ${milestone.next || milestone.label}`,
      status: due < today ? 'vencido' : 'corriendo'
    }
  })

  return [...generated, ...(Array.isArray(customDeadlines) ? customDeadlines : [])]
}

function buildMonitoringAlerts({ caseRecord, procedureInfo, milestones, deadlines, suggestions, manualAlerts = [] }) {
  const now = new Date()
  const alerts = []

  deadlines.forEach((deadline) => {
    const dueDate = toDate(deadline.dueDate)
    if (!dueDate) return
    const diffDays = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    let type = 'plazo corriendo'
    let urgency = 'media'
    if (diffDays < 0) {
      type = 'plazo vencido'
      urgency = 'alta'
    } else if (diffDays <= 2) {
      type = 'plazo próximo a vencer'
      urgency = 'alta'
    } else if (diffDays <= 5) {
      type = 'plazo iniciado'
      urgency = 'media'
    }

    alerts.push({
      id: `monitor-${caseRecord.id}-${deadline.id}`,
      caseId: caseRecord.id,
      caseRef: caseRecord.rol_rit || caseRecord.pjud_rit || caseRecord.id,
      title: `${type.toUpperCase()} · ${deadline.type}`,
      summary: `${caseRecord.subject || 'Causa'}: ${deadline.action || 'Revisar actuación'} (${formatDate(deadline.dueDate)}).`,
      category: 'Plazos judiciales',
      urgency,
      source: 'Monitoreo',
      foundation: deadline.legalBasis || 'Monitoreo de flujo procesal',
      deadline: deadline.dueDate,
      createdAt: new Date().toISOString(),
      status: deadline.status || (diffDays < 0 ? 'pendiente' : 'activa'),
      validationUser: '',
      trace: {
        procedure: procedureInfo.procedure,
        milestone: milestones.current.label,
        nextMilestone: milestones.next
      }
    })
  })

  if (procedureInfo.conflict) {
    alerts.push({
      id: `monitor-${caseRecord.id}-conflict`,
      caseId: caseRecord.id,
      caseRef: caseRecord.rol_rit || caseRecord.id,
      title: 'Necesidad de revisar clasificación del procedimiento',
      summary: 'Se detectó conflicto entre señales de escritos/resoluciones y clasificación automática.',
      category: 'Alertas urgentes',
      urgency: 'alta',
      source: 'Monitoreo',
      foundation: 'Comparación entre flujo teórico y documentos reales',
      deadline: null,
      createdAt: new Date().toISOString(),
      status: 'pendiente',
      validationUser: '',
      trace: { procedure: procedureInfo.procedure }
    })
  }

  const actedSuggestion = suggestions.find((item) => /recurso|contestación|réplica|prueba/i.test(item.title))
  if (actedSuggestion) {
    alerts.push({
      id: `monitor-${caseRecord.id}-action`,
      caseId: caseRecord.id,
      caseRef: caseRecord.rol_rit || caseRecord.id,
      title: 'Actuación urgente recomendada',
      summary: actedSuggestion.detail,
      category: 'Alertas urgentes',
      urgency: 'alta',
      source: 'Monitoreo',
      foundation: 'Sugerencia automática por hito procesal',
      deadline: deadlines[0]?.dueDate || null,
      createdAt: new Date().toISOString(),
      status: 'pendiente',
      validationUser: '',
      trace: { suggestion: actedSuggestion.title }
    })
  }

  return [...alerts, ...(Array.isArray(manualAlerts) ? manualAlerts : [])]
}

function buildSuggestions({ procedureInfo, milestones, deadlines }) {
  const current = normalize(milestones.current.label)
  const next = milestones.next
  const suggestions = []

  if (current.includes('notificacion')) {
    suggestions.push({ title: 'Propuesta de contestación', type: 'escrito judicial', detail: 'Demanda notificada y plazo corriendo: preparar contestación con excepciones y defensa documental.' })
  }
  if (current.includes('contestacion')) {
    suggestions.push({ title: 'Propuesta de réplica', type: 'escrito judicial', detail: 'Existe traslado para réplica/dúplica: redactar réplica estratégica y plan de prueba.' })
  }
  if (current.includes('prueba')) {
    suggestions.push({ title: 'Minuta probatoria', type: 'informe interno', detail: 'Auto de prueba detectado: preparar nómina de testigos, documental y absolución de posiciones.' })
  }
  if (current.includes('sentencia')) {
    suggestions.push({ title: 'Sugerencia de recurso', type: 'escrito judicial', detail: 'Sentencia detectada: evaluar apelación, casación u otro recurso procedente.' })
  }

  suggestions.push({ title: 'Informe de estado procesal', type: 'informe interno', detail: `Hito actual: ${milestones.current.label}. Próximo hito probable: ${next}. Procedimiento: ${procedureInfo.procedure}.` })
  suggestions.push({ title: 'Advertencia de vencimientos', type: 'advertencia', detail: `Se controlan ${deadlines.length} plazo(s) activos y vencidos con trazabilidad completa.` })

  return suggestions
}

function buildFlowDiagram(procedure, customFlow = null) {
  if (customFlow && customFlow.nodes?.length) return customFlow

  const nodes = [
    { id: 'n1', name: 'Ingreso de causa', description: 'Recepción y clasificación inicial del asunto.', term: 'Inmediato', legalBasis: 'Base legal interna', docs: 'Demanda/requerimiento/denuncia', alerts: 'Hito pendiente; necesidad de clasificación', outputs: 'Clasificar procedimiento' },
    { id: 'n2', name: 'Notificación/comparecencia', description: 'Validación de notificación y comparecencia de partes.', term: 'Plazo para comparecer/oponer excepciones', legalBasis: 'Base legal interna', docs: 'Notificaciones, proveídos', alerts: 'Riesgo de rebeldía; plazo iniciado', outputs: 'Contesta / no contesta / excepciones' },
    { id: 'n3', name: 'Etapa de discusión y prueba', description: 'Discusión principal y actividad probatoria.', term: 'Plazo para rendir prueba e impugnar', legalBasis: 'Base legal interna', docs: 'Contestación, réplica, dúplica, auto de prueba', alerts: 'Plazo corriendo; audiencia próxima', outputs: 'Sentencia / salida alternativa' },
    { id: 'n4', name: 'Decisión y recursos', description: 'Sentencia o resolución relevante y eventual impugnación.', term: 'Plazo para recurrir', legalBasis: 'Base legal interna', docs: 'Sentencia, recursos, resoluciones', alerts: 'Recurso posible; plazo próximo a vencer', outputs: 'Cumple / no cumple / ejecución' },
    { id: 'n5', name: 'Cierre o ejecución', description: 'Cumplimiento, ejecución o término por ruta alternativa.', term: 'Plazo para cumplir', legalBasis: 'Base legal interna', docs: 'Cumplimiento, liquidación, archivo', alerts: 'Actuación urgente; plazo vencido', outputs: 'Archivo / ejecución / remisión' }
  ]

  const transitions = [
    { from: 'n1', to: 'n2', condition: 'Admisibilidad y notificación', conduct: 'Parte o tribunal impulsa notificación', route: 'demanda directa / medida prejudicial', nextMilestone: 'Notificación', newAlert: 'plazo iniciado' },
    { from: 'n2', to: 'n3', condition: 'Comparece o contesta', conduct: 'Parte comparece, contesta o formula excepciones', route: 'comparece / no comparece / excepciones', nextMilestone: 'Discusión/prueba', newAlert: 'riesgo de rebeldía' },
    { from: 'n3', to: 'n4', condition: 'Cierre probatorio o audiencia', conduct: 'Tribunal dicta sentencia o resolución', route: 'rinde prueba / no rinde prueba', nextMilestone: 'Sentencia', newAlert: 'recurso posible' },
    { from: 'n4', to: 'n5', condition: 'Interpone recurso o queda firme', conduct: 'Parte recurre o cumple', route: 'interpone recurso / no interpone recurso', nextMilestone: 'Cumplimiento', newAlert: 'plazo para cumplir' }
  ]

  return { procedure, nodes, transitions, routeOptions: ROUTE_OPTIONS }
}

function getCaseLabel(item = {}) {
  return [item.rol_rit || item.pjud_rit || item.id, item.subject || item.pjud_caratulado || item.caratula || 'Causa sin carátula'].filter(Boolean).join(' · ')
}

const state = {
  cases: [],
  selectedCaseId: '',
  monitoring: loadMonitoringState()
}

const ui = {
  list: document.getElementById('monitorCaseList'),
  search: document.getElementById('monitorSearch'),
  caseTitle: document.getElementById('monitorCaseTitle'),
  caseMeta: document.getElementById('monitorCaseMeta'),
  procedureSelect: document.getElementById('monitorProcedure'),
  procedureStatus: document.getElementById('monitorProcedureStatus'),
  confidence: document.getElementById('monitorConfidence'),
  currentMilestone: document.getElementById('monitorCurrentMilestone'),
  nextMilestone: document.getElementById('monitorNextMilestone'),
  deadlines: document.getElementById('monitorDeadlines'),
  alerts: document.getElementById('monitorAlerts'),
  suggestions: document.getElementById('monitorSuggestions'),
  nodes: document.getElementById('monitorNodes'),
  transitions: document.getElementById('monitorTransitions'),
  btnSave: document.getElementById('btnMonitorSave'),
  btnCancel: document.getElementById('btnMonitorCancel'),
  btnClose: document.getElementById('btnMonitorClose'),
  btnAddDeadline: document.getElementById('btnAddDeadline'),
  btnAddNode: document.getElementById('btnAddNode'),
  btnAddTransition: document.getElementById('btnAddTransition')
}

function collectMonitoringAlerts(stateMap) {
  const all = Object.values(stateMap || {})
    .flatMap((entry) => entry.alerts || [])
    .filter((item) => item && item.status !== 'cerrada')

  localStorage.setItem(MONITORING_ALERTS_STORAGE_KEY, JSON.stringify(all))
}

function renderProcedureOptions() {
  const options = PROCEDURE_GROUPS.flatMap((group) => {
    const groupHeader = `<optgroup label="${group.category}">`
    const groupItems = group.items.map((item) => `<option value="${item}">${item}</option>`).join('')
    return `${groupHeader}${groupItems}</optgroup>`
  }).join('')
  ui.procedureSelect.innerHTML = `<option value="">Procedimiento pendiente de validación</option>${options}`
}

function renderCaseList() {
  const query = normalize(ui.search.value)
  const rows = state.cases.filter((item) => normalize(getCaseLabel(item)).includes(query))

  ui.list.innerHTML = rows.map((item) => {
    const active = item.id === state.selectedCaseId ? 'active' : ''
    return `<button class="monitor-list-item ${active}" data-id="${item.id}">${getCaseLabel(item)}</button>`
  }).join('') || '<div class="panel-list-empty">No hay causas disponibles.</div>'
}

function renderEditor() {
  const caseRecord = state.cases.find((item) => item.id === state.selectedCaseId)
  if (!caseRecord) {
    ui.caseTitle.textContent = 'Selecciona una causa para monitorear'
    ui.caseMeta.textContent = 'Sin causa activa.'
    return
  }

  const workspace = loadWorkspace()
  const detail = workspace[state.selectedCaseId] || { documents: [], movements: [] }
  const stored = state.monitoring[state.selectedCaseId] || {}
  const procedureInfo = detectProcedure(caseRecord, detail, stored.manualProcedure)
  const milestones = detectMilestones(caseRecord, detail)
  const flow = buildFlowDiagram(procedureInfo.procedure, stored.flow)
  const deadlines = computeDeadlines(caseRecord, milestones, stored.manualDeadlines)
  const suggestions = buildSuggestions({ procedureInfo, milestones, deadlines })
  const alerts = buildMonitoringAlerts({ caseRecord, procedureInfo, milestones, deadlines, suggestions, manualAlerts: stored.manualAlerts })

  state.monitoring[state.selectedCaseId] = {
    ...stored,
    caseRef: caseRecord.rol_rit || caseRecord.id,
    procedure: procedureInfo.procedure,
    procedureStatus: procedureInfo.status,
    confidence: procedureInfo.confidence,
    conflict: procedureInfo.conflict,
    currentMilestone: milestones.current.label,
    nextMilestone: milestones.next,
    suggestions,
    alerts,
    deadlines,
    flow,
    updatedAt: new Date().toISOString()
  }

  ui.caseTitle.textContent = caseRecord.subject || caseRecord.pjud_caratulado || 'Causa sin carátula'
  ui.caseMeta.textContent = `${caseRecord.rol_rit || caseRecord.pjud_rit || caseRecord.id} · ${caseRecord.court || caseRecord.pjud_tribunal || 'Tribunal por definir'} · ${caseRecord.materia || caseRecord.subject || 'Materia sin clasificar'}`
  ui.procedureSelect.value = stored.manualProcedure || procedureInfo.procedure
  ui.procedureStatus.textContent = procedureInfo.conflict ? `${procedureInfo.status} (conflicto de clasificación)` : procedureInfo.status
  ui.confidence.textContent = `${Math.round(procedureInfo.confidence * 100)}%`
  ui.currentMilestone.textContent = milestones.current.label
  ui.nextMilestone.textContent = milestones.next

  ui.deadlines.innerHTML = deadlines.map((deadline) => `
    <tr>
      <td>${deadline.type}</td>
      <td><input type="date" data-deadline-id="${deadline.id}" data-field="dueDate" value="${deadline.dueDate ? String(deadline.dueDate).slice(0, 10) : ''}"></td>
      <td><input type="text" data-deadline-id="${deadline.id}" data-field="action" value="${deadline.action || ''}"></td>
      <td>${deadline.status || 'activa'}</td>
    </tr>
  `).join('')

  ui.alerts.innerHTML = alerts.map((alert) => `
    <tr>
      <td>${alert.title}</td>
      <td>${alert.summary}</td>
      <td>${alert.urgency}</td>
      <td>${formatDate(alert.deadline)}</td>
      <td>${alert.status}</td>
    </tr>
  `).join('')

  ui.suggestions.innerHTML = suggestions.map((item) => `<li><strong>${item.title}:</strong> ${item.detail}</li>`).join('')

  ui.nodes.innerHTML = flow.nodes.map((node) => `
    <tr>
      <td>${node.name}</td>
      <td>${node.description}</td>
      <td>${node.term}</td>
      <td>${node.docs}</td>
      <td>${node.alerts}</td>
      <td>${node.outputs}</td>
    </tr>
  `).join('')

  ui.transitions.innerHTML = flow.transitions.map((transition) => `
    <tr>
      <td>${transition.condition}</td>
      <td>${transition.conduct}</td>
      <td>${transition.route}</td>
      <td>${transition.nextMilestone}</td>
      <td>${transition.newAlert}</td>
    </tr>
  `).join('')
}

function bindEvents() {
  ui.list.addEventListener('click', (event) => {
    const item = event.target.closest('[data-id]')
    if (!item) return
    state.selectedCaseId = item.dataset.id
    renderCaseList()
    renderEditor()
  })

  ui.search.addEventListener('input', renderCaseList)

  ui.procedureSelect.addEventListener('change', () => {
    if (!state.selectedCaseId) return
    const entry = state.monitoring[state.selectedCaseId] || {}
    entry.manualProcedure = ui.procedureSelect.value
    state.monitoring[state.selectedCaseId] = entry
    renderEditor()
  })

  ui.deadlines.addEventListener('input', (event) => {
    const input = event.target.closest('input[data-deadline-id]')
    if (!input || !state.selectedCaseId) return
    const entry = state.monitoring[state.selectedCaseId]
    const target = (entry.deadlines || []).find((item) => item.id === input.dataset.deadlineId)
    if (!target) return
    if (input.dataset.field === 'dueDate') target.dueDate = `${input.value}T09:00:00`
    if (input.dataset.field === 'action') target.action = input.value
  })

  ui.btnAddDeadline.addEventListener('click', () => {
    if (!state.selectedCaseId) return
    const entry = state.monitoring[state.selectedCaseId] || {}
    entry.manualDeadlines = entry.manualDeadlines || []
    entry.manualDeadlines.push({
      id: `manual-${Date.now()}`,
      type: 'Plazo manual',
      dueDate: new Date().toISOString(),
      legalBasis: 'Base legal interna (manual)',
      action: 'Definir gestión',
      status: 'corriendo'
    })
    state.monitoring[state.selectedCaseId] = entry
    renderEditor()
  })

  ui.btnAddNode.addEventListener('click', () => {
    if (!state.selectedCaseId) return
    const entry = state.monitoring[state.selectedCaseId]
    entry.flow.nodes.push({
      id: `n-${Date.now()}`,
      name: 'Nuevo hito',
      description: 'Descripción editable',
      term: 'Plazo por definir',
      legalBasis: 'Base legal interna',
      docs: 'Documento asociado',
      alerts: 'Alerta asociada',
      outputs: 'Salidas posibles'
    })
    renderEditor()
  })

  ui.btnAddTransition.addEventListener('click', () => {
    if (!state.selectedCaseId) return
    const entry = state.monitoring[state.selectedCaseId]
    entry.flow.transitions.push({
      from: entry.flow.nodes[0]?.id || 'n1',
      to: entry.flow.nodes[1]?.id || 'n2',
      condition: 'Condición de avance',
      conduct: 'Conducta de parte o tribunal',
      route: ROUTE_OPTIONS[0],
      nextMilestone: 'Siguiente hito',
      newAlert: 'Nueva alerta'
    })
    renderEditor()
  })

  ui.btnSave.addEventListener('click', () => {
    saveMonitoringState(state.monitoring)
    collectMonitoringAlerts(state.monitoring)
    alert('Monitoreo guardado y persistido. Las alertas ya están disponibles para el panel principal.')
  })

  ui.btnCancel.addEventListener('click', () => {
    state.monitoring = loadMonitoringState()
    renderEditor()
  })

  ui.btnClose.addEventListener('click', () => {
    window.location.href = './panel.html'
  })
}

async function loadCases() {
  await requireAuth()

  const { data, error } = await supabase.from(CASES_TABLE).select('*').order('created_at', { ascending: false })
  if (error) {
    ui.list.innerHTML = `<div class="panel-list-empty">Error cargando causas: ${error.message}</div>`
    return
  }

  state.cases = (data || []).map((item) => ({
    id: item.id,
    rol_rit: item.rol_rit,
    pjud_rit: item.pjud_rit,
    pjud_ruc: item.pjud_ruc,
    pjud_tribunal: item.pjud_tribunal,
    pjud_caratulado: item.pjud_caratulado,
    pjud_fecha_ubicacion: item.pjud_fecha_ubicacion,
    court: item.court,
    materia: item.subject,
    subject: item.subject,
    notes: item.notes,
    responsible: item.responsible,
    created_at: item.created_at,
    updated_at: item.updated_at
  }))

  if (state.cases.length) {
    state.selectedCaseId = state.cases[0].id
  }

  renderCaseList()
  renderEditor()
}

renderProcedureOptions()
bindEvents()
loadCases()
