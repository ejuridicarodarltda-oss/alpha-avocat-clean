import { supabase, requireAuth } from './app.js'
import { loadWorkspace } from './causas-services.js'

export const MONITORING_ALERTS_STORAGE_KEY = 'alpha_avocat_monitoreo_alertas_v1'
const CASES_TABLE = 'cases'

const TABLES = {
  catalog: 'procedure_catalog',
  state: 'cause_monitoring_state',
  alerts: 'cause_monitoring_alerts',
  suggestions: 'cause_monitoring_suggestions',
  overrides: 'cause_monitoring_overrides',
  history: 'cause_monitoring_history'
}

const ROUTE_OPTIONS = ['demanda directa', 'comparece', 'no comparece', 'contesta', 'no contesta', 'interpone recurso', 'no interpone recurso']

const FALLBACK_PROCEDURES = [
  { category: 'Civil / CPC / Código Civil', items: ['juicio ordinario de mayor cuantía', 'procedimiento sumario', 'juicio ejecutivo de obligación de dar'] },
  { category: 'Familia', items: ['procedimiento ordinario o común ante tribunales de familia'] },
  { category: 'Penal', items: ['procedimiento ordinario con juicio oral'] }
]

const PRESCRIPTION_BASE_ROWS = [
  { materia: 'Civil', accion: 'Acción ejecutiva', plazo: '3 años', norma: 'Código Civil, artículos 2514 y 2515', inicioComputo: 'Desde que la obligación se hizo exigible' },
  { materia: 'Civil', accion: 'Acción ordinaria', plazo: '5 años', norma: 'Código Civil, artículos 2514 y 2515', inicioComputo: 'Desde que la obligación se hizo exigible' },
  { materia: 'Civil', accion: 'Acción hipotecaria y acciones accesorias', plazo: 'Mismo plazo de la obligación principal', norma: 'Código Civil, artículo 2516', inicioComputo: 'Desde que corre la obligación principal' },
  { materia: 'Civil', accion: 'Cobro de honorarios de profesiones liberales', plazo: '2 años', norma: 'Código Civil, artículo 2521', inicioComputo: 'Desde que el cobro se hizo exigible' },
  { materia: 'Civil', accion: 'Cobro de mercaderías al menudeo', plazo: '1 año', norma: 'Código Civil, artículo 2522', inicioComputo: 'Desde que el cobro se hizo exigible' },
  { materia: 'Civil', accion: 'Cobro de servicios periódicos o accidentales', plazo: '1 año', norma: 'Código Civil, artículo 2522', inicioComputo: 'Desde que el cobro se hizo exigible' },
  { materia: 'Civil', accion: 'Responsabilidad extracontractual', plazo: '4 años', norma: 'Código Civil, artículo 2332', inicioComputo: 'Desde la perpetración del acto' },
  { materia: 'Penal', accion: 'Acción penal por crimen con pena perpetua', plazo: '15 años', norma: 'Código Penal, artículo 94', inicioComputo: 'Desde la comisión del delito' },
  { materia: 'Penal', accion: 'Acción penal por los demás crímenes', plazo: '10 años', norma: 'Código Penal, artículo 94', inicioComputo: 'Desde la comisión del delito' },
  { materia: 'Penal', accion: 'Acción penal por simples delitos', plazo: '5 años', norma: 'Código Penal, artículo 94', inicioComputo: 'Desde la comisión del delito' },
  { materia: 'Penal', accion: 'Acción penal por faltas', plazo: '6 meses', norma: 'Código Penal, artículo 94', inicioComputo: 'Desde la comisión del hecho' },
  { materia: 'Penal', accion: 'Prescripción de la pena por crimen con pena perpetua', plazo: '15 años', norma: 'Código Penal, artículos 97 y 98', inicioComputo: 'Desde la sentencia firme o desde el quebrantamiento de la condena' },
  { materia: 'Penal', accion: 'Prescripción de la pena por los demás crímenes', plazo: '10 años', norma: 'Código Penal, artículos 97 y 98', inicioComputo: 'Desde la sentencia firme o desde el quebrantamiento de la condena' },
  { materia: 'Penal', accion: 'Prescripción de la pena por simples delitos', plazo: '5 años', norma: 'Código Penal, artículos 97 y 98', inicioComputo: 'Desde la sentencia firme o desde el quebrantamiento de la condena' },
  { materia: 'Penal', accion: 'Prescripción de la pena por faltas', plazo: '6 meses', norma: 'Código Penal, artículos 97 y 98', inicioComputo: 'Desde la sentencia firme o desde el quebrantamiento de la condena' },
  { materia: 'Laboral', accion: 'Derechos regidos por el Código del Trabajo', plazo: '2 años', norma: 'Código del Trabajo, artículo 480', inicioComputo: 'Desde que se hicieron exigibles' },
  { materia: 'Laboral', accion: 'Acciones provenientes de actos y contratos del Código del Trabajo', plazo: '6 meses', norma: 'Código del Trabajo, artículo 480', inicioComputo: 'Desde la terminación de los servicios' },
  { materia: 'Laboral', accion: 'Acción de nulidad del despido del artículo 162', plazo: '6 meses', norma: 'Código del Trabajo, artículo 480', inicioComputo: 'Desde la suspensión de los servicios' },
  { materia: 'Laboral', accion: 'Cobro de horas extraordinarias', plazo: '6 meses', norma: 'Código del Trabajo, artículo 480', inicioComputo: 'Desde que debieron pagarse' },
  { materia: 'Previsional', accion: 'Cobro de cotizaciones, reajustes, intereses y multas', plazo: '5 años', norma: 'Ley 17.322, artículo 31 bis', inicioComputo: 'Desde el término de los servicios' },
  { materia: 'Consumidor', accion: 'Acción contravencional', plazo: '2 años', norma: 'Ley 19.496, artículo 26', inicioComputo: 'Desde que cesó la infracción' },
  { materia: 'Consumidor', accion: 'Prescripción de la multa contravencional', plazo: '1 año', norma: 'Ley 19.496, artículo 26', inicioComputo: 'Desde que quedó firme la sentencia condenatoria' },
  { materia: 'Tributario', accion: 'Acción del Servicio de Impuestos Internos para liquidar, revisar y girar impuestos', plazo: '3 años', norma: 'Código Tributario, artículo 200', inicioComputo: 'Desde la expiración del plazo legal para pagar' },
  { materia: 'Tributario', accion: 'Acción del Servicio de Impuestos Internos para liquidar, revisar y girar impuestos cuando no hubo declaración o la declaración fue maliciosamente falsa', plazo: '6 años', norma: 'Código Tributario, artículo 200', inicioComputo: 'Desde la expiración del plazo legal para pagar' },
  { materia: 'Tributario', accion: 'Acción para perseguir sanciones pecuniarias no accesorias al impuesto', plazo: '3 años', norma: 'Código Tributario, artículo 201', inicioComputo: 'Desde la fecha de la infracción' },
  { materia: 'Tributario', accion: 'Acción del Fisco para el cobro de impuestos, intereses, sanciones y recargos', plazo: '3 o 6 años, según corresponda', norma: 'Código Tributario, artículos 200 y 201', inicioComputo: 'Desde el hito del artículo 200 que corresponda' },
  { materia: 'Tránsito / JPL', accion: 'Prescripción de multas anotadas en el Registro de Multas de Tránsito No Pagadas', plazo: '3 años', norma: 'Ley 18.287, artículo 24', inicioComputo: 'Desde la fecha de la anotación' },
  { materia: 'Tránsito / JPL', accion: 'Prescripción de la acción de cumplimiento cuando no pudo practicarse la anotación', plazo: '3 años', norma: 'Ley 18.287, artículo 24', inicioComputo: 'Desde la comunicación del Registro Civil al Juzgado de Policía Local' },
  { materia: 'Insolvencia', accion: 'Acción revocatoria concursal', plazo: '1 año', norma: 'Ley 20.720, artículo 291', inicioComputo: 'Desde la resolución de reorganización, liquidación o admisibilidad, según corresponda' },
  { materia: 'Insolvencia', accion: 'Revocabilidad objetiva de actos de empresa deudora', plazo: 'Ventana de 1 año hacia atrás', norma: 'Ley 20.720, artículo 287', inicioComputo: 'Se revisan actos celebrados dentro del año anterior al inicio del procedimiento' },
  { materia: 'Insolvencia', accion: 'Revocabilidad de actos de persona deudora', plazo: 'Ventana de 1 año hacia atrás', norma: 'Ley 20.720, artículo 290', inicioComputo: 'Se revisan actos celebrados dentro del año anterior al inicio del procedimiento' },
  { materia: 'Insolvencia', accion: 'Reformas a pactos o estatutos sociales revocables', plazo: 'Ventana de 6 meses hacia atrás', norma: 'Ley 20.720, artículo 289', inicioComputo: 'Se revisan actos celebrados dentro de los 6 meses anteriores al inicio del procedimiento' }
]

const SPECIAL_PRESCRIPTION_MATTERS = ['Minería', 'Aguas', 'Pesca', 'Alcoholes', 'Servicios eléctricos / concesiones eléctricas', 'Comercio general', 'Consumidor civil no contravencional']

function normalize(value = '') { return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') }
function toDate(value) { const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d }
function formatDate(value) { const d = toDate(value); return d ? d.toLocaleDateString('es-CL') : 'Sin fecha' }
function addDurationToDate(date, duration) {
  const copy = new Date(date.getTime())
  copy.setUTCDate(copy.getUTCDate() + (duration.days || 0))
  copy.setUTCMonth(copy.getUTCMonth() + (duration.months || 0))
  copy.setUTCFullYear(copy.getUTCFullYear() + (duration.years || 0))
  return copy
}

function parseDurationFromTerm(term = '') {
  const value = normalize(term)
  const matchYears = value.match(/(\d+)\s*anos?/)
  const matchMonths = value.match(/(\d+)\s*mes(?:es)?/)
  const years = matchYears ? Number(matchYears[1]) : 0
  const months = matchMonths ? Number(matchMonths[1]) : 0
  if (!years && !months) return null
  return { years, months, days: 0 }
}

function resolveAlertState(estimatedDate, baseDate) {
  if (!baseDate || !estimatedDate) return 'sin fecha base'
  const now = new Date()
  const diffDays = Math.floor((estimatedDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'plazo vencido'
  if (diffDays <= 30) return 'plazo próximo a vencer'
  return 'plazo corriendo'
}

function withComputedPrescription(row = {}) {
  const baseDate = toDate(row.baseDate)
  const duration = parseDurationFromTerm(row.term)
  const estimatedDate = baseDate && duration ? addDurationToDate(baseDate, duration) : null
  return {
    ...row,
    estimatedDueDate: estimatedDate ? estimatedDate.toISOString() : '',
    alertState: resolveAlertState(estimatedDate, baseDate)
  }
}

function detectProcedure(caseRecord, manualProcedure = '') {
  if (manualProcedure) return { procedure: manualProcedure, confidence: 1, status: 'validado por usuario', conflict: false }
  const blob = normalize(`${caseRecord.subject || ''} ${caseRecord.caratula || ''} ${caseRecord.notes || ''}`)
  if (blob.includes('familia')) return { procedure: 'procedimiento ordinario o común ante tribunales de familia', confidence: 0.7, status: 'identificado automáticamente', conflict: false }
  if (blob.includes('ejecutivo')) return { procedure: 'juicio ejecutivo de obligación de dar', confidence: 0.72, status: 'identificado automáticamente', conflict: false }
  return { procedure: 'juicio ordinario de mayor cuantía', confidence: 0.45, status: 'procedimiento probable', conflict: false }
}

function detectMilestones(caseRecord, detail) {
  const text = normalize(`${caseRecord.notes || ''} ${(detail.movements || []).map((m) => `${m.title || ''} ${m.description || ''}`).join(' ')}`)
  const all = []
  if (text.includes('demanda')) all.push('Demanda ingresada')
  if (text.includes('notific')) all.push('Notificación de demanda')
  if (text.includes('contest')) all.push('Contestación')
  if (text.includes('prueba')) all.push('Etapa probatoria')
  if (!all.length) all.push('Inicio y revisión de expediente')
  const current = all[all.length - 1]
  const next = current === 'Contestación' ? 'Etapa probatoria' : 'Siguiente actuación judicial'
  return { all, current, next }
}

function buildFlowDiagram(procedure, flowSnapshot = null) {
  if (flowSnapshot?.nodes?.length) return flowSnapshot
  return {
    procedure,
    nodes: [
      { id: 'n1', name: 'Ingreso de causa', description: 'Recepción y clasificación inicial.', term: 'Inmediato', docs: 'Demanda', alerts: 'Clasificar', outputs: 'Notificar' },
      { id: 'n2', name: 'Notificación/comparecencia', description: 'Notificación y respuesta.', term: '15 días', docs: 'Resolución/Notificación', alerts: 'Plazo corriendo', outputs: 'Contesta/no contesta' },
      { id: 'n3', name: 'Prueba y decisión', description: 'Rendición de prueba y sentencia.', term: '10 días', docs: 'Auto de prueba/sentencia', alerts: 'Recurso', outputs: 'Cierre o recurso' }
    ],
    transitions: [
      { from: 'n1', to: 'n2', condition: 'Admisibilidad', conduct: 'Notificar', route: 'demanda directa', nextMilestone: 'Notificación', newAlert: 'plazo iniciado' },
      { from: 'n2', to: 'n3', condition: 'Contestación', conduct: 'Rendición de prueba', route: 'contesta / no contesta', nextMilestone: 'Prueba', newAlert: 'plazo corriendo' }
    ]
  }
}

function buildDeadlines(milestones, manual = []) {
  const auto = [{ id: 'auto-1', type: milestones.current, dueDate: new Date().toISOString(), action: `Gestionar ${milestones.next}`, status: 'corriendo', legalBasis: 'Base legal interna' }]
  return [...auto, ...(Array.isArray(manual) ? manual : [])]
}

function buildSuggestions({ procedureInfo, milestones }) {
  return [
    { title: 'Informe de estado procesal', type: 'informe', detail: `Procedimiento ${procedureInfo.procedure}; hito actual ${milestones.current}; siguiente ${milestones.next}.` },
    { title: 'Propuesta de escrito', type: 'escrito', detail: `Preparar escrito para ${milestones.next}.` }
  ]
}

function buildAlerts({ caseRecord, deadlines, procedureInfo, milestones, manualAlerts = [] }) {
  const base = deadlines.map((deadline) => ({
    id: `monitor-${caseRecord.id}-${deadline.id}`,
    title: `PLAZO · ${deadline.type}`,
    summary: deadline.action,
    urgency: 'media',
    deadline: deadline.dueDate,
    status: deadline.status || 'activa',
    foundation: deadline.legalBasis || '',
    source: 'Monitoreo',
    caseId: caseRecord.id,
    caseRef: caseRecord.rol_rit || caseRecord.id,
    trace: { procedure: procedureInfo.procedure, milestone: milestones.current }
  }))
  return [...base, ...(Array.isArray(manualAlerts) ? manualAlerts : [])]
}

const state = { cases: [], selectedCaseId: '', monitoring: {}, procedures: FALLBACK_PROCEDURES, userId: null }

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
  prescriptions: document.getElementById('monitorPrescriptions'),
  specialPrescriptions: document.getElementById('monitorSpecialPrescriptions'),
  nodes: document.getElementById('monitorNodes'),
  transitions: document.getElementById('monitorTransitions'),
  btnSave: document.getElementById('btnMonitorSave'),
  btnCancel: document.getElementById('btnMonitorCancel'),
  btnClose: document.getElementById('btnMonitorClose'),
  btnAddDeadline: document.getElementById('btnAddDeadline'),
  btnAddPrescriptionRow: document.getElementById('btnAddPrescriptionRow'),
  btnAddSpecialPrescriptionRow: document.getElementById('btnAddSpecialPrescriptionRow'),
  btnAddNode: document.getElementById('btnAddNode'),
  btnAddTransition: document.getElementById('btnAddTransition')
}

function slugify(value = '') { return normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') }

async function loadProcedureCatalog() {
  const { data } = await supabase.from(TABLES.catalog).select('slug,name,category,is_active').eq('is_active', true).order('category').order('name')
  if (!data?.length) return
  const grouped = new Map()
  data.forEach((row) => {
    const key = row.category || 'General'
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(row.name)
  })
  state.procedures = Array.from(grouped.entries()).map(([category, items]) => ({ category, items }))
}

function renderProcedureOptions() {
  const options = state.procedures.map((group) => `<optgroup label="${group.category}">${group.items.map((i) => `<option value="${i}">${i}</option>`).join('')}</optgroup>`).join('')
  ui.procedureSelect.innerHTML = `<option value="">Procedimiento pendiente de validación</option>${options}`
}

function getCaseLabel(item = {}) { return [item.rol_rit || item.pjud_rit || item.id, item.subject || item.pjud_caratulado || 'Causa sin carátula'].filter(Boolean).join(' · ') }

function renderCaseList() {
  const query = normalize(ui.search.value)
  const rows = state.cases.filter((item) => normalize(getCaseLabel(item)).includes(query))
  ui.list.innerHTML = rows.map((item) => `<button class="monitor-list-item ${item.id === state.selectedCaseId ? 'active' : ''}" data-id="${item.id}">${getCaseLabel(item)}</button>`).join('') || '<div class="panel-list-empty">No hay causas disponibles.</div>'
}

function persistAlertsToLocalStorage() {
  const all = Object.values(state.monitoring).flatMap((entry) => entry.alerts || []).filter((item) => item && item.status !== 'cerrada')
  localStorage.setItem(MONITORING_ALERTS_STORAGE_KEY, JSON.stringify(all))
}

function buildInitialPrescriptionRows() {
  return PRESCRIPTION_BASE_ROWS.map((row, index) => withComputedPrescription({
    id: `base-${index + 1}`,
    matter: row.materia,
    action: row.accion,
    term: row.plazo,
    legalRule: row.norma,
    termStartRule: row.inicioComputo,
    baseDate: '',
    observations: '',
    userEditable: true
  }))
}

function buildInitialSpecialRows() {
  return SPECIAL_PRESCRIPTION_MATTERS.map((matter, index) => withComputedPrescription({
    id: `special-${index + 1}`,
    matter,
    action: '',
    term: '',
    legalRule: '',
    termStartRule: '',
    baseDate: '',
    observations: '',
    userEditable: true
  }))
}

function buildPrescriptionAlerts(caseRecord, rows = []) {
  return rows
    .filter((row) => row.baseDate && row.alertState && row.alertState !== 'sin fecha base')
    .map((row) => ({
      id: `presc-${caseRecord.id}-${row.id}`,
      title: `PRESCRIPCIÓN · ${row.action || 'Acción por definir'}`,
      summary: `${row.matter || 'Materia'} · ${row.alertState}`,
      urgency: row.alertState === 'plazo vencido' ? 'alta' : (row.alertState === 'plazo próximo a vencer' ? 'media' : 'baja'),
      deadline: row.estimatedDueDate || row.baseDate,
      status: row.alertState,
      foundation: row.legalRule || '',
      source: 'Monitoreo',
      category: 'Plazos judiciales',
      caseId: caseRecord.id,
      caseRef: caseRecord.rol_rit || caseRecord.id,
      trace: { module: 'prescripcion_acciones', matter: row.matter, action: row.action }
    }))
}

function renderEditor() {
  const caseRecord = state.cases.find((item) => item.id === state.selectedCaseId)
  if (!caseRecord) return

  const workspace = loadWorkspace()
  const detail = workspace[state.selectedCaseId] || { documents: [], movements: [] }
  const stored = state.monitoring[state.selectedCaseId] || {}
  const procedureInfo = detectProcedure(caseRecord, stored.manualProcedure)
  const milestones = detectMilestones(caseRecord, detail)
  const flow = buildFlowDiagram(procedureInfo.procedure, stored.flow)
  const deadlines = buildDeadlines(milestones, stored.manualDeadlines)
  const suggestions = buildSuggestions({ procedureInfo, milestones })
  const prescriptionRows = (stored.prescriptionsRows?.length ? stored.prescriptionsRows : buildInitialPrescriptionRows()).map((row) => withComputedPrescription(row))
  const specialPrescriptionRows = (stored.specialPrescriptionRows?.length ? stored.specialPrescriptionRows : buildInitialSpecialRows()).map((row) => withComputedPrescription(row))
  const prescriptionAlerts = buildPrescriptionAlerts(caseRecord, [...prescriptionRows, ...specialPrescriptionRows])
  const alerts = buildAlerts({ caseRecord, deadlines, procedureInfo, milestones, manualAlerts: [...(stored.manualAlerts || []), ...prescriptionAlerts] })

  const fulfilledMilestones = milestones.all.slice(0, -1)
  const pendingMilestones = [milestones.next].filter(Boolean)

  state.monitoring[state.selectedCaseId] = {
    ...stored,
    caseRef: caseRecord.rol_rit || caseRecord.id,
    procedure: procedureInfo.procedure,
    procedureStatus: procedureInfo.status,
    confidence: procedureInfo.confidence,
    currentMilestone: milestones.current,
    nextMilestone: milestones.next,
    routeFollowed: stored.routeFollowed || ROUTE_OPTIONS[0],
    fulfilledMilestones,
    pendingMilestones,
    deadlines,
    runningDeadlines: deadlines,
    suggestions,
    prescriptionsRows: prescriptionRows,
    specialPrescriptionRows,
    alerts,
    flow,
    validations: stored.validations || [],
    manualCorrections: stored.manualCorrections || [],
    updatedAt: new Date().toISOString()
  }

  ui.caseTitle.textContent = caseRecord.subject || caseRecord.pjud_caratulado || 'Causa sin carátula'
  ui.caseMeta.textContent = `${caseRecord.rol_rit || caseRecord.id} · ${caseRecord.court || caseRecord.pjud_tribunal || 'Tribunal por definir'} · Ruta: ${state.monitoring[state.selectedCaseId].routeFollowed}`
  ui.procedureSelect.value = stored.manualProcedure || procedureInfo.procedure
  ui.procedureStatus.textContent = `${procedureInfo.status} · Hitos cumplidos: ${fulfilledMilestones.length} · Pendientes: ${pendingMilestones.length}`
  ui.confidence.textContent = `${Math.round(procedureInfo.confidence * 100)}%`
  ui.currentMilestone.textContent = milestones.current
  ui.nextMilestone.textContent = milestones.next

  ui.deadlines.innerHTML = deadlines.map((deadline) => `<tr><td>${deadline.type}</td><td><input type="date" data-deadline-id="${deadline.id}" data-field="dueDate" value="${String(deadline.dueDate || '').slice(0, 10)}"></td><td><input type="text" data-deadline-id="${deadline.id}" data-field="action" value="${deadline.action || ''}"></td><td>${deadline.status || 'activa'}</td></tr>`).join('')
  ui.alerts.innerHTML = alerts.map((alert) => `<tr><td>${alert.title}</td><td>${alert.summary}</td><td>${alert.urgency}</td><td>${formatDate(alert.deadline)}</td><td>${alert.status}</td></tr>`).join('')
  ui.suggestions.innerHTML = [
    `<li><strong>Procedimiento aplicable:</strong> ${procedureInfo.procedure}</li>`,
    `<li><strong>Ruta efectivamente seguida:</strong> ${state.monitoring[state.selectedCaseId].routeFollowed}</li>`,
    `<li><strong>Hitos ya cumplidos:</strong> ${fulfilledMilestones.join(', ') || 'Ninguno'}</li>`,
    `<li><strong>Hitos pendientes:</strong> ${pendingMilestones.join(', ') || 'Sin pendientes'}</li>`,
    ...suggestions.map((item) => `<li><strong>${item.title}:</strong> ${item.detail}</li>`)
  ].join('')

  ui.nodes.innerHTML = flow.nodes.map((node) => `<tr><td>${node.name}</td><td>${node.description}</td><td>${node.term}</td><td>${node.docs}</td><td>${node.alerts}</td><td>${node.outputs}</td></tr>`).join('')
  ui.transitions.innerHTML = flow.transitions.map((t) => `<tr><td>${t.condition}</td><td>${t.conduct}</td><td>${t.route}</td><td>${t.nextMilestone}</td><td>${t.newAlert}</td></tr>`).join('')
  ui.prescriptions.innerHTML = prescriptionRows.map((row) => `<tr>
    <td><input type="text" data-prescription-id="${row.id}" data-field="matter" value="${row.matter || ''}"></td>
    <td><input type="text" data-prescription-id="${row.id}" data-field="action" value="${row.action || ''}"></td>
    <td><input type="text" data-prescription-id="${row.id}" data-field="term" value="${row.term || ''}"></td>
    <td><input type="text" data-prescription-id="${row.id}" data-field="legalRule" value="${row.legalRule || ''}"></td>
    <td><input type="text" data-prescription-id="${row.id}" data-field="termStartRule" value="${row.termStartRule || ''}"></td>
    <td><input type="date" data-prescription-id="${row.id}" data-field="baseDate" value="${String(row.baseDate || '').slice(0, 10)}"></td>
    <td>${formatDate(row.estimatedDueDate)}</td>
    <td>${row.alertState || 'sin fecha base'}</td>
    <td><input type="text" data-prescription-id="${row.id}" data-field="observations" value="${row.observations || ''}"></td>
    <td><input type="checkbox" data-prescription-id="${row.id}" data-field="userEditable" ${row.userEditable ? 'checked' : ''}></td>
  </tr>`).join('')

  ui.specialPrescriptions.innerHTML = specialPrescriptionRows.map((row) => `<tr>
    <td><select data-special-prescription-id="${row.id}" data-field="matter">${SPECIAL_PRESCRIPTION_MATTERS.map((matter) => `<option value="${matter}" ${matter === row.matter ? 'selected' : ''}>${matter}</option>`).join('')}</select></td>
    <td><input type="text" data-special-prescription-id="${row.id}" data-field="action" value="${row.action || ''}"></td>
    <td><input type="text" data-special-prescription-id="${row.id}" data-field="term" value="${row.term || ''}"></td>
    <td><input type="text" data-special-prescription-id="${row.id}" data-field="legalRule" value="${row.legalRule || ''}"></td>
    <td><input type="text" data-special-prescription-id="${row.id}" data-field="termStartRule" value="${row.termStartRule || ''}"></td>
    <td><input type="date" data-special-prescription-id="${row.id}" data-field="baseDate" value="${String(row.baseDate || '').slice(0, 10)}"></td>
    <td>${formatDate(row.estimatedDueDate)}</td>
    <td>${row.alertState || 'sin fecha base'}</td>
    <td><input type="text" data-special-prescription-id="${row.id}" data-field="observations" value="${row.observations || ''}"></td>
  </tr>`).join('')

  persistAlertsToLocalStorage()
}

async function hydrateMonitoringFromDatabase() {
  const caseIds = state.cases.map((c) => c.id)
  if (!caseIds.length) return

  const [stateRows, alertRows, suggestionRows, overrideRows] = await Promise.all([
    supabase.from(TABLES.state).select('*').in('case_id', caseIds),
    supabase.from(TABLES.alerts).select('*').in('case_id', caseIds),
    supabase.from(TABLES.suggestions).select('*').in('case_id', caseIds),
    supabase.from(TABLES.overrides).select('*').in('case_id', caseIds).order('created_at', { ascending: false })
  ])

  const stateMap = new Map((stateRows.data || []).map((row) => [row.case_id, row]))
  const alertMap = new Map()
  ;(alertRows.data || []).forEach((row) => {
    if (!alertMap.has(row.case_id)) alertMap.set(row.case_id, [])
    alertMap.get(row.case_id).push({
      id: row.alert_key || row.id, title: row.title, summary: row.summary, urgency: row.urgency, deadline: row.deadline,
      status: row.status, foundation: row.foundation, source: row.source, caseId: row.case_id, caseRef: row.case_id, trace: row.trace || {}
    })
  })

  const suggestionMap = new Map()
  ;(suggestionRows.data || []).forEach((row) => {
    if (!suggestionMap.has(row.case_id)) suggestionMap.set(row.case_id, [])
    suggestionMap.get(row.case_id).push({ title: row.title, type: row.suggestion_type, detail: row.detail })
  })

  const overridesMap = new Map()
  ;(overrideRows.data || []).forEach((row) => {
    if (!overridesMap.has(row.case_id)) overridesMap.set(row.case_id, [])
    overridesMap.get(row.case_id).push(row)
  })

  caseIds.forEach((caseId) => {
    const row = stateMap.get(caseId)
    if (!row) return
    state.monitoring[caseId] = {
      manualProcedure: row.procedure_name || '',
      routeFollowed: row.route_followed || ROUTE_OPTIONS[0],
      currentMilestone: row.current_milestone || '',
      nextMilestone: row.next_milestone || '',
      fulfilledMilestones: row.fulfilled_milestones || [],
      pendingMilestones: row.pending_milestones || [],
      runningDeadlines: row.running_deadlines || [],
      manualDeadlines: row.running_deadlines || [],
      flow: row.flow_snapshot || null,
      validations: row.validations || [],
      manualCorrections: row.manual_corrections || [],
      prescriptionsRows: row.prescriptions_rows || [],
      specialPrescriptionRows: row.special_prescription_rows || [],
      alerts: alertMap.get(caseId) || [],
      suggestions: suggestionMap.get(caseId) || [],
      overrides: overridesMap.get(caseId) || []
    }
  })
}

async function saveSelectedCaseMonitoring() {
  if (!state.selectedCaseId) return
  const entry = state.monitoring[state.selectedCaseId]
  if (!entry) return

  const payload = {
    case_id: state.selectedCaseId,
    case_ref: entry.caseRef,
    procedure_slug: slugify(entry.procedure),
    procedure_name: entry.procedure,
    procedure_status: entry.procedureStatus,
    confidence: entry.confidence || 0,
    current_milestone: entry.currentMilestone,
    next_milestone: entry.nextMilestone,
    route_followed: entry.routeFollowed,
    fulfilled_milestones: entry.fulfilledMilestones || [],
    pending_milestones: entry.pendingMilestones || [],
    running_deadlines: entry.runningDeadlines || [],
    flow_snapshot: entry.flow || {},
    validations: entry.validations || [],
    manual_corrections: entry.manualCorrections || [],
    prescriptions_rows: entry.prescriptionsRows || [],
    special_prescription_rows: entry.specialPrescriptionRows || [],
    updated_by: state.userId,
    updated_at: new Date().toISOString()
  }

  const { error: stateError } = await supabase.from(TABLES.state).upsert(payload, { onConflict: 'case_id' })
  if (stateError) throw stateError

  await supabase.from(TABLES.alerts).delete().eq('case_id', state.selectedCaseId)
  if (entry.alerts?.length) {
    await supabase.from(TABLES.alerts).insert(entry.alerts.map((item) => ({
      case_id: state.selectedCaseId,
      alert_key: item.id,
      title: item.title,
      summary: item.summary,
      foundation: item.foundation || '',
      urgency: item.urgency || 'media',
      deadline: item.deadline || null,
      status: item.status || 'activa',
      source: item.source || 'Monitoreo',
      trace: item.trace || {}
    })))
  }

  await supabase.from(TABLES.suggestions).delete().eq('case_id', state.selectedCaseId)
  if (entry.suggestions?.length) {
    await supabase.from(TABLES.suggestions).insert(entry.suggestions.map((item) => ({
      case_id: state.selectedCaseId,
      title: item.title,
      suggestion_type: item.type || 'escrito',
      detail: item.detail || '',
      status: 'activa'
    })))
  }

  await supabase.from(TABLES.overrides).insert({
    case_id: state.selectedCaseId,
    override_type: 'manual_save',
    payload: {
      procedure: entry.procedure,
      milestone: entry.currentMilestone,
      route: entry.routeFollowed,
      deadlines: entry.runningDeadlines
    },
    note: 'Validación/corrección manual desde módulo Monitoreo.',
    created_by: state.userId
  })

  await supabase.from(TABLES.history).insert({
    case_id: state.selectedCaseId,
    action: 'save_monitoring_state',
    payload: entry,
    actor_id: state.userId
  })

  persistAlertsToLocalStorage()
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
    const entry = state.monitoring[state.selectedCaseId] || {}
    entry.manualProcedure = ui.procedureSelect.value
    entry.manualCorrections = [...(entry.manualCorrections || []), { field: 'procedure', value: ui.procedureSelect.value, at: new Date().toISOString() }]
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
    entry.validations = [...(entry.validations || []), { field: input.dataset.field, at: new Date().toISOString() }]
  })

  ui.prescriptions.addEventListener('change', (event) => {
    const input = event.target.closest('[data-prescription-id]')
    if (!input || !state.selectedCaseId) return
    const entry = state.monitoring[state.selectedCaseId]
    const row = (entry.prescriptionsRows || []).find((item) => item.id === input.dataset.prescriptionId)
    if (!row) return
    row[input.dataset.field] = input.type === 'checkbox' ? input.checked : input.value
    Object.assign(row, withComputedPrescription(row))
    renderEditor()
  })

  ui.specialPrescriptions.addEventListener('change', (event) => {
    const input = event.target.closest('[data-special-prescription-id]')
    if (!input || !state.selectedCaseId) return
    const entry = state.monitoring[state.selectedCaseId]
    const row = (entry.specialPrescriptionRows || []).find((item) => item.id === input.dataset.specialPrescriptionId)
    if (!row) return
    row[input.dataset.field] = input.value
    Object.assign(row, withComputedPrescription(row))
    renderEditor()
  })

  ui.btnAddDeadline.addEventListener('click', () => {
    const entry = state.monitoring[state.selectedCaseId] || {}
    entry.manualDeadlines = entry.manualDeadlines || []
    entry.manualDeadlines.push({ id: `manual-${Date.now()}`, type: 'Plazo manual', dueDate: new Date().toISOString(), legalBasis: 'Manual', action: 'Definir gestión', status: 'corriendo' })
    state.monitoring[state.selectedCaseId] = entry
    renderEditor()
  })

  ui.btnAddPrescriptionRow.addEventListener('click', () => {
    const entry = state.monitoring[state.selectedCaseId] || {}
    entry.prescriptionsRows = entry.prescriptionsRows || buildInitialPrescriptionRows()
    entry.prescriptionsRows.push(withComputedPrescription({
      id: `custom-${Date.now()}`,
      matter: '',
      action: '',
      term: '',
      legalRule: '',
      termStartRule: '',
      baseDate: '',
      observations: '',
      userEditable: true
    }))
    state.monitoring[state.selectedCaseId] = entry
    renderEditor()
  })

  ui.btnAddSpecialPrescriptionRow.addEventListener('click', () => {
    const entry = state.monitoring[state.selectedCaseId] || {}
    entry.specialPrescriptionRows = entry.specialPrescriptionRows || buildInitialSpecialRows()
    entry.specialPrescriptionRows.push(withComputedPrescription({
      id: `special-custom-${Date.now()}`,
      matter: SPECIAL_PRESCRIPTION_MATTERS[0],
      action: '',
      term: '',
      legalRule: '',
      termStartRule: '',
      baseDate: '',
      observations: '',
      userEditable: true
    }))
    state.monitoring[state.selectedCaseId] = entry
    renderEditor()
  })

  ui.btnAddNode.addEventListener('click', () => {
    const entry = state.monitoring[state.selectedCaseId]
    entry.flow.nodes.push({ id: `n-${Date.now()}`, name: 'Nuevo hito', description: 'Descripción editable', term: 'Plazo por definir', docs: 'Documento', alerts: 'Alerta', outputs: 'Salida' })
    renderEditor()
  })

  ui.btnAddTransition.addEventListener('click', () => {
    const entry = state.monitoring[state.selectedCaseId]
    entry.flow.transitions.push({ from: 'n1', to: 'n2', condition: 'Condición', conduct: 'Conducta', route: ROUTE_OPTIONS[0], nextMilestone: 'Siguiente', newAlert: 'Nueva alerta' })
    renderEditor()
  })

  ui.btnSave.addEventListener('click', async () => {
    try {
      await saveSelectedCaseMonitoring()
      alert('Monitoreo guardado en base de datos y visible en Panel > ALERTAS.')
    } catch (error) {
      alert(`No se pudo guardar monitoreo en base de datos: ${error.message}`)
    }
  })

  ui.btnCancel.addEventListener('click', async () => {
    await hydrateMonitoringFromDatabase()
    renderEditor()
  })

  ui.btnClose.addEventListener('click', () => { window.location.href = './produccion.html' })
}

async function loadCases() {
  const user = await requireAuth()
  state.userId = user?.id || null

  const { data, error } = await supabase.from(CASES_TABLE).select('*').order('created_at', { ascending: false })
  if (error) {
    ui.list.innerHTML = `<div class="panel-list-empty">Error cargando causas: ${error.message}</div>`
    return
  }

  state.cases = (data || []).map((item) => ({ id: item.id, rol_rit: item.rol_rit, pjud_rit: item.pjud_rit, pjud_caratulado: item.pjud_caratulado, pjud_tribunal: item.pjud_tribunal, court: item.court, subject: item.subject, notes: item.notes }))

  const params = new URLSearchParams(window.location.search)
  const preselectedId = params.get('caseId')
  state.selectedCaseId = preselectedId && state.cases.some((c) => c.id === preselectedId) ? preselectedId : (state.cases[0]?.id || '')

  await loadProcedureCatalog()
  renderProcedureOptions()
  await hydrateMonitoringFromDatabase()
  renderCaseList()
  renderEditor()
}

bindEvents()
loadCases()
