import { supabase, requireAuth } from './app.js'
import { loadWorkspace } from './causas-services.js'
import { MONITORING_CATALOG_SEED } from './monitoring-catalog.js'

export const MONITORING_ALERTS_STORAGE_KEY = 'alpha_avocat_monitoreo_alertas_v1'

const TABLES = {
  cases: 'cases',
  catalog: 'procedure_catalog',
  nodes: 'procedure_flow_nodes',
  routes: 'procedure_flow_routes',
  alertTemplates: 'procedure_alert_templates',
  state: 'cause_monitoring_state',
  alerts: 'cause_monitoring_alerts',
  suggestions: 'cause_monitoring_suggestions'
}

const state = {
  userId: null,
  cases: [],
  selectedCaseId: '',
  selectedProcedureSlug: '',
  procedures: [],
  monitoring: {},
  view: 'general'
}

const ui = {
  btnViewGeneral: document.getElementById('btnViewGeneral'),
  btnViewByCase: document.getElementById('btnViewByCase'),
  btnSave: document.getElementById('btnMonitorSave'),
  btnCancel: document.getElementById('btnMonitorCancel'),
  btnClose: document.getElementById('btnMonitorClose'),
  btnAddCatalogProcedure: document.getElementById('btnAddCatalogProcedure'),
  btnAddDeadline: document.getElementById('btnAddDeadline'),
  btnAddNode: document.getElementById('btnAddNode'),
  btnAddTransition: document.getElementById('btnAddTransition'),
  searchMateria: document.getElementById('monitorSearchMateria'),
  searchProcedure: document.getElementById('monitorSearchProcedure'),
  searchCase: document.getElementById('monitorSearchCase'),
  searchCourt: document.getElementById('monitorSearchCourt'),
  catalogList: document.getElementById('monitorCatalogList'),
  caseList: document.getElementById('monitorCaseList'),
  title: document.getElementById('monitorCaseTitle'),
  meta: document.getElementById('monitorCaseMeta'),
  generalSection: document.getElementById('generalCatalogSection'),
  caseSection: document.getElementById('caseMonitoringSection'),
  catalogMateria: document.getElementById('catalogMateria'),
  catalogProcedureName: document.getElementById('catalogProcedureName'),
  catalogCompetentBody: document.getElementById('catalogCompetentBody'),
  catalogStartForm: document.getElementById('catalogStartForm'),
  catalogLegalBasis: document.getElementById('catalogLegalBasis'),
  catalogMilestones: document.getElementById('catalogMilestones'),
  catalogRoutes: document.getElementById('catalogRoutes'),
  catalogAlerts: document.getElementById('catalogAlerts'),
  monitorProcedure: document.getElementById('monitorProcedure'),
  monitorProcedureStatus: document.getElementById('monitorProcedureStatus'),
  monitorConfidence: document.getElementById('monitorConfidence'),
  monitorCurrentMilestone: document.getElementById('monitorCurrentMilestone'),
  monitorNextMilestone: document.getElementById('monitorNextMilestone'),
  monitorDeadlines: document.getElementById('monitorDeadlines'),
  monitorAlerts: document.getElementById('monitorAlerts'),
  monitorSuggestions: document.getElementById('monitorSuggestions'),
  monitorNodes: document.getElementById('monitorNodes'),
  monitorTransitions: document.getElementById('monitorTransitions')
}

const normalize = (v = '') => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const slugify = (v = '') => normalize(v).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

function parseMaybeJson(value, fallback = []) {
  try { return JSON.parse(value || '[]') } catch { return fallback }
}

function toggleView(view) {
  state.view = view === 'case' ? 'case' : 'general'
  ui.generalSection.hidden = state.view !== 'general'
  ui.caseSection.hidden = state.view !== 'case'
}

async function upsertSeedCatalog() {
  const payload = MONITORING_CATALOG_SEED.map((item) => ({
    slug: item.slug || slugify(item.name),
    materia: item.materia,
    name: item.name,
    competent_body: item.competentBody,
    start_form: item.startForm,
    legal_basis: item.legalBasis,
    is_active: true,
    updated_by: state.userId
  }))

  const { error } = await supabase.from(TABLES.catalog).upsert(payload, { onConflict: 'slug' })
  if (error) console.warn('[monitoreo] no se pudo hacer upsert del catálogo semilla', error.message)
}

async function loadCatalog() {
  const { data } = await supabase.from(TABLES.catalog).select('*').order('materia').order('name')
  state.procedures = data || []
  const options = state.procedures.map((item) => `<option value="${item.slug}">${item.name}</option>`).join('')
  ui.monitorProcedure.innerHTML = `<option value="">Procedimiento pendiente</option>${options}`
}

function renderCatalogList() {
  const m = normalize(ui.searchMateria.value)
  const p = normalize(ui.searchProcedure.value)
  const rows = state.procedures.filter((item) => normalize(item.materia).includes(m) && normalize(item.name).includes(p))
  ui.catalogList.innerHTML = rows.map((item) => `<button class="monitor-list-item ${item.slug === state.selectedProcedureSlug ? 'active' : ''}" data-procedure="${item.slug}">${item.materia} · ${item.name}</button>`).join('') || '<div class="panel-list-empty">Sin catálogo.</div>'
}

function renderCaseList() {
  const q = normalize(ui.searchCase.value)
  const c = normalize(ui.searchCourt.value)
  const rows = state.cases.filter((item) => normalize(`${item.rol_rit || ''} ${item.subject || ''}`).includes(q) && normalize(item.court || item.pjud_tribunal || '').includes(c))
  ui.caseList.innerHTML = rows.map((item) => `<button class="monitor-list-item ${item.id === state.selectedCaseId ? 'active' : ''}" data-case="${item.id}">${item.rol_rit || item.id} · ${item.subject || 'Sin carátula'}</button>`).join('') || '<div class="panel-list-empty">Sin causas.</div>'
}

async function loadProcedureDetails(slug) {
  if (!slug) return
  state.selectedProcedureSlug = slug
  const [catalogRes, nodesRes, routesRes, alertsRes] = await Promise.all([
    supabase.from(TABLES.catalog).select('*').eq('slug', slug).maybeSingle(),
    supabase.from(TABLES.nodes).select('*').eq('procedure_slug', slug).order('sort_order'),
    supabase.from(TABLES.routes).select('*').eq('procedure_slug', slug).order('sort_order'),
    supabase.from(TABLES.alertTemplates).select('*').eq('procedure_slug', slug).order('sort_order')
  ])

  const detail = catalogRes.data || {}
  ui.catalogMateria.value = detail.materia || ''
  ui.catalogProcedureName.value = detail.name || ''
  ui.catalogCompetentBody.value = detail.competent_body || ''
  ui.catalogStartForm.value = detail.start_form || ''
  ui.catalogLegalBasis.value = detail.legal_basis || ''
  ui.catalogMilestones.value = JSON.stringify((nodesRes.data || []).map((n) => ({ title: n.title, description: n.description, term: n.term })), null, 2)
  ui.catalogRoutes.value = JSON.stringify((routesRes.data || []).map((r) => ({ condition: r.condition, route: r.route, nextMilestone: r.next_milestone })), null, 2)
  ui.catalogAlerts.value = JSON.stringify((alertsRes.data || []).map((a) => ({ title: a.title, summary: a.summary, urgency: a.urgency })), null, 2)
  renderCatalogList()
}

async function saveCatalogEdit() {
  const slug = state.selectedProcedureSlug || slugify(ui.catalogProcedureName.value)
  state.selectedProcedureSlug = slug

  await supabase.from(TABLES.catalog).upsert({
    slug,
    materia: ui.catalogMateria.value,
    name: ui.catalogProcedureName.value,
    competent_body: ui.catalogCompetentBody.value,
    start_form: ui.catalogStartForm.value,
    legal_basis: ui.catalogLegalBasis.value,
    is_active: true,
    updated_by: state.userId
  }, { onConflict: 'slug' })

  const nodes = parseMaybeJson(ui.catalogMilestones.value)
  const routes = parseMaybeJson(ui.catalogRoutes.value)
  const alerts = parseMaybeJson(ui.catalogAlerts.value)

  await supabase.from(TABLES.nodes).delete().eq('procedure_slug', slug)
  if (nodes.length) {
    await supabase.from(TABLES.nodes).insert(nodes.map((n, i) => ({
      procedure_slug: slug,
      sort_order: i,
      title: n.title || n.name || `Hito ${i + 1}`,
      description: n.description || '',
      term: n.term || ''
    })))
  }

  await supabase.from(TABLES.routes).delete().eq('procedure_slug', slug)
  if (routes.length) {
    await supabase.from(TABLES.routes).insert(routes.map((r, i) => ({
      procedure_slug: slug,
      sort_order: i,
      condition: r.condition || '',
      conduct: r.conduct || '',
      route: r.route || '',
      next_milestone: r.nextMilestone || ''
    })))
  }

  await supabase.from(TABLES.alertTemplates).delete().eq('procedure_slug', slug)
  if (alerts.length) {
    await supabase.from(TABLES.alertTemplates).insert(alerts.map((a, i) => ({
      procedure_slug: slug,
      sort_order: i,
      title: a.title || `Alerta ${i + 1}`,
      summary: a.summary || '',
      urgency: a.urgency || 'media'
    })))
  }

  await loadCatalog()
  renderCatalogList()
}

function renderCaseEditor() {
  const caseRecord = state.cases.find((c) => c.id === state.selectedCaseId)
  if (!caseRecord) return
  const entry = state.monitoring[state.selectedCaseId] || { deadlines: [], nodes: [], transitions: [], alerts: [], suggestions: [] }

  ui.title.textContent = caseRecord.subject || caseRecord.pjud_caratulado || 'Causa sin carátula'
  ui.meta.textContent = `${caseRecord.rol_rit || caseRecord.id} · ${caseRecord.court || caseRecord.pjud_tribunal || 'Tribunal por definir'} · Visible en Panel y Producción`

  ui.monitorProcedure.value = entry.procedureSlug || ''
  ui.monitorProcedureStatus.textContent = entry.status || 'pendiente'
  ui.monitorConfidence.textContent = `${Math.round((entry.confidence || 0) * 100)}%`
  ui.monitorCurrentMilestone.textContent = entry.currentMilestone || '-'
  ui.monitorNextMilestone.textContent = entry.nextMilestone || '-'
  ui.monitorDeadlines.innerHTML = (entry.deadlines || []).map((d) => `<tr><td>${d.type || ''}</td><td>${d.dueDate || ''}</td><td>${d.action || ''}</td><td>${d.status || ''}</td></tr>`).join('')
  ui.monitorAlerts.innerHTML = (entry.alerts || []).map((a) => `<tr><td>${a.title || ''}</td><td>${a.summary || ''}</td><td>${a.urgency || ''}</td><td>${a.deadline || ''}</td><td>${a.status || ''}</td></tr>`).join('')
  ui.monitorSuggestions.innerHTML = (entry.suggestions || []).map((s) => `<li>${s.title || ''}: ${s.detail || ''}</li>`).join('')
  ui.monitorNodes.innerHTML = (entry.nodes || []).map((n) => `<tr><td>${n.title || ''}</td><td>${n.description || ''}</td><td>${n.term || ''}</td></tr>`).join('')
  ui.monitorTransitions.innerHTML = (entry.transitions || []).map((t) => `<tr><td>${t.condition || ''}</td><td>${t.conduct || ''}</td><td>${t.route || ''}</td><td>${t.nextMilestone || ''}</td><td>${t.newAlert || ''}</td></tr>`).join('')
}

function syncAlertsToLocalStorage() {
  const all = Object.values(state.monitoring).flatMap((entry) => (entry.alerts || []).map((a) => ({ ...a, source: 'Monitoreo' })))
  localStorage.setItem(MONITORING_ALERTS_STORAGE_KEY, JSON.stringify(all))
}

async function saveCaseMonitoring() {
  const caseId = state.selectedCaseId
  const entry = state.monitoring[caseId]
  if (!caseId || !entry) return

  await supabase.from(TABLES.state).upsert({
    case_id: caseId,
    procedure_slug: entry.procedureSlug,
    procedure_name: entry.procedureName,
    procedure_status: entry.status,
    confidence: entry.confidence,
    current_milestone: entry.currentMilestone,
    next_milestone: entry.nextMilestone,
    running_deadlines: entry.deadlines || [],
    updated_by: state.userId,
    updated_at: new Date().toISOString()
  }, { onConflict: 'case_id' })

  await supabase.from(TABLES.alerts).delete().eq('case_id', caseId)
  if (entry.alerts?.length) {
    await supabase.from(TABLES.alerts).insert(entry.alerts.map((a) => ({
      case_id: caseId,
      alert_key: a.id || `${caseId}-${Date.now()}`,
      title: a.title,
      summary: a.summary,
      urgency: a.urgency || 'media',
      deadline: a.deadline || null,
      status: a.status || 'activa',
      source: a.source || 'Monitoreo',
      trace: a.trace || {}
    })))
  }

  await supabase.from(TABLES.suggestions).delete().eq('case_id', caseId)
  if (entry.suggestions?.length) {
    await supabase.from(TABLES.suggestions).insert(entry.suggestions.map((s) => ({
      case_id: caseId,
      title: s.title,
      detail: s.detail,
      suggestion_type: s.type || 'escrito',
      status: 'activa'
    })))
  }

  syncAlertsToLocalStorage()
}

async function hydrateCaseMonitoring(caseId) {
  const [stateRes, alertsRes, suggestionsRes] = await Promise.all([
    supabase.from(TABLES.state).select('*').eq('case_id', caseId).maybeSingle(),
    supabase.from(TABLES.alerts).select('*').eq('case_id', caseId),
    supabase.from(TABLES.suggestions).select('*').eq('case_id', caseId)
  ])

  const base = stateRes.data || {}
  const workspace = loadWorkspace()
  const notes = workspace[caseId]?.movements || []

  state.monitoring[caseId] = {
    procedureSlug: base.procedure_slug || state.selectedProcedureSlug || '',
    procedureName: base.procedure_name || '',
    status: base.procedure_status || 'identificado automáticamente',
    confidence: base.confidence || 0.5,
    currentMilestone: base.current_milestone || (notes[0]?.title || 'Inicio'),
    nextMilestone: base.next_milestone || 'Siguiente actuación',
    deadlines: base.running_deadlines || [],
    nodes: parseMaybeJson(ui.catalogMilestones.value, []),
    transitions: parseMaybeJson(ui.catalogRoutes.value, []),
    alerts: (alertsRes.data || []).map((a) => ({ id: a.alert_key || a.id, title: a.title, summary: a.summary, urgency: a.urgency, deadline: a.deadline, status: a.status, source: a.source, trace: a.trace || {} })),
    suggestions: (suggestionsRes.data || []).map((s) => ({ title: s.title, detail: s.detail, type: s.suggestion_type }))
  }
}

function bind() {
  ui.btnViewGeneral.addEventListener('click', () => toggleView('general'))
  ui.btnViewByCase.addEventListener('click', () => toggleView('case'))

  ;[ui.searchMateria, ui.searchProcedure].forEach((el) => el.addEventListener('input', renderCatalogList))
  ;[ui.searchCase, ui.searchCourt].forEach((el) => el.addEventListener('input', renderCaseList))

  ui.catalogList.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-procedure]')
    if (!button) return
    await loadProcedureDetails(button.dataset.procedure)
  })

  ui.caseList.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-case]')
    if (!button) return
    state.selectedCaseId = button.dataset.case
    await hydrateCaseMonitoring(state.selectedCaseId)
    renderCaseList()
    renderCaseEditor()
  })

  ui.monitorProcedure.addEventListener('change', () => {
    const selected = state.procedures.find((p) => p.slug === ui.monitorProcedure.value)
    const entry = state.monitoring[state.selectedCaseId] || {}
    entry.procedureSlug = ui.monitorProcedure.value
    entry.procedureName = selected?.name || ''
    state.monitoring[state.selectedCaseId] = entry
  })

  ui.btnAddCatalogProcedure.addEventListener('click', () => {
    state.selectedProcedureSlug = ''
    ui.catalogMateria.value = ''
    ui.catalogProcedureName.value = ''
    ui.catalogCompetentBody.value = ''
    ui.catalogStartForm.value = ''
    ui.catalogLegalBasis.value = ''
    ui.catalogMilestones.value = '[]'
    ui.catalogRoutes.value = '[]'
    ui.catalogAlerts.value = '[]'
  })

  ui.btnAddDeadline.addEventListener('click', () => {
    const entry = state.monitoring[state.selectedCaseId] || {}
    entry.deadlines = entry.deadlines || []
    entry.deadlines.push({ type: 'Plazo manual', dueDate: new Date().toISOString().slice(0, 10), action: 'Definir gestión', status: 'corriendo' })
    state.monitoring[state.selectedCaseId] = entry
    renderCaseEditor()
  })

  ui.btnAddNode.addEventListener('click', () => {
    const entry = state.monitoring[state.selectedCaseId] || {}
    entry.nodes = entry.nodes || []
    entry.nodes.push({ title: 'Nuevo hito', description: 'Descripción', term: 'Plazo' })
    state.monitoring[state.selectedCaseId] = entry
    renderCaseEditor()
  })

  ui.btnAddTransition.addEventListener('click', () => {
    const entry = state.monitoring[state.selectedCaseId] || {}
    entry.transitions = entry.transitions || []
    entry.transitions.push({ condition: 'Condición', conduct: 'Conducta', route: 'Ruta', nextMilestone: 'Siguiente', newAlert: 'Nueva alerta' })
    state.monitoring[state.selectedCaseId] = entry
    renderCaseEditor()
  })

  ui.btnSave.addEventListener('click', async () => {
    if (state.view === 'general') await saveCatalogEdit()
    else await saveCaseMonitoring()
  })

  ui.btnCancel.addEventListener('click', async () => {
    await loadCatalog()
    renderCatalogList()
    renderCaseList()
    if (state.selectedProcedureSlug) await loadProcedureDetails(state.selectedProcedureSlug)
    if (state.selectedCaseId) {
      await hydrateCaseMonitoring(state.selectedCaseId)
      renderCaseEditor()
    }
  })

  ui.btnClose.addEventListener('click', () => { window.location.href = './produccion.html' })
}

async function init() {
  const user = await requireAuth()
  state.userId = user?.id || null

  await upsertSeedCatalog()
  await loadCatalog()

  const { data } = await supabase.from(TABLES.cases).select('*').order('created_at', { ascending: false })
  state.cases = (data || []).map((item) => ({
    id: item.id,
    rol_rit: item.rol_rit,
    pjud_caratulado: item.pjud_caratulado,
    pjud_tribunal: item.pjud_tribunal,
    court: item.court,
    subject: item.subject
  }))

  state.selectedCaseId = state.cases[0]?.id || ''
  state.selectedProcedureSlug = state.procedures[0]?.slug || ''

  renderCatalogList()
  renderCaseList()

  if (state.selectedProcedureSlug) await loadProcedureDetails(state.selectedProcedureSlug)
  if (state.selectedCaseId) {
    await hydrateCaseMonitoring(state.selectedCaseId)
    renderCaseEditor()
  }

  toggleView('general')
}

bind()
init()
