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

const state = { userId: null, cases: [], selectedCaseId: '', selectedProcedureSlug: '', procedures: [], monitoring: {}, view: 'general' }
const normalize = (v = '') => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const slugify = (v = '') => normalize(v).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const ui = {
  searchMateria: document.getElementById('monitorSearchMateria'),
  searchProcedure: document.getElementById('monitorSearchProcedure'),
  searchCase: document.getElementById('monitorSearchCase'),
  searchCourt: document.getElementById('monitorSearchCourt'),
  catalogList: document.getElementById('monitorCatalogList'),
  caseList: document.getElementById('monitorCaseList'),
  caseTitle: document.getElementById('monitorCaseTitle'),
  caseMeta: document.getElementById('monitorCaseMeta'),
  generalSection: document.getElementById('generalCatalogSection'),
  caseSection: document.getElementById('caseMonitoringSection'),
  btnViewGeneral: document.getElementById('btnViewGeneral'),
  btnViewCase: document.getElementById('btnViewCase'),
  btnAddCatalogProcedure: document.getElementById('btnAddCatalogProcedure'),
  catalogMateria: document.getElementById('catalogMateria'),
  catalogProcedureName: document.getElementById('catalogProcedureName'),
  catalogCompetentBody: document.getElementById('catalogCompetentBody'),
  catalogStartForm: document.getElementById('catalogStartForm'),
  catalogLegalBasis: document.getElementById('catalogLegalBasis'),
  catalogMilestones: document.getElementById('catalogMilestones'),
  catalogRoutes: document.getElementById('catalogRoutes'),
  catalogAlerts: document.getElementById('catalogAlerts'),
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
  btnAddDeadline: document.getElementById('btnAddDeadline'),
  btnAddNode: document.getElementById('btnAddNode'),
  btnAddTransition: document.getElementById('btnAddTransition'),
  btnSave: document.getElementById('btnMonitorSave'),
  btnCancel: document.getElementById('btnMonitorCancel'),
  btnClose: document.getElementById('btnMonitorClose')
}

function toggleView(next) {
  state.view = next
  ui.generalSection.style.display = next === 'general' ? '' : 'none'
  ui.caseSection.style.display = next === 'case' ? '' : 'none'
}

async function upsertSeedCatalog() {
  for (const procedure of MONITORING_CATALOG_SEED) {
    const procedureSlug = procedure.slug || slugify(`${procedure.materia}-${procedure.name}`)
    await supabase.from(TABLES.catalog).upsert({
      slug: procedureSlug,
      category: procedure.materia,
      name: procedure.name,
      competent_body: procedure.competentBody,
      start_form: procedure.startForm,
      legal_basis: procedure.legalBasis,
      editable_by_user: true,
      description: procedure.startForm,
      is_active: true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'category,name' })

    for (let i = 0; i < (procedure.milestones || []).length; i += 1) {
      const m = procedure.milestones[i]
      await supabase.from(TABLES.nodes).upsert({
        procedure_slug: procedureSlug,
        node_key: slugify(m.name),
        node_name: m.name,
        description: m.description,
        term: m.term,
        legal_basis: m.startsFrom,
        docs: m.triggerDocument,
        alerts: m.linkedAlert,
        outputs: m.outputRoute,
        sort_order: i
      }, { onConflict: 'procedure_slug,node_name' })
    }

    for (let i = 0; i < (procedure.routes || []).length; i += 1) {
      const r = procedure.routes[i]
      await supabase.from(TABLES.routes).upsert({
        procedure_slug: procedureSlug,
        route_name: r.name,
        condition: r.condition,
        route: r.name,
        next_milestone: r.nextMilestone,
        conduct: r.legalTerm,
        sort_order: i
      }, { onConflict: 'procedure_slug,route_name' })
    }

    for (const a of (procedure.alerts || [])) {
      await supabase.from(TABLES.alertTemplates).upsert({
        category: procedure.materia,
        procedure_name: procedure.name,
        milestone_name: a.milestone,
        route_name: a.route,
        alert_type: a.type,
        term: a.term,
        visible_panel: true,
        visible_monitoring: true,
        visible_case: true
      }, { onConflict: 'category,procedure_name,milestone_name,route_name,alert_type' })
    }
  }
}

async function loadCatalog() {
  const { data } = await supabase.from(TABLES.catalog).select('*').eq('is_active', true).order('category').order('name')
  state.procedures = data || []
  ui.procedureSelect.innerHTML = `<option value="">Procedimiento pendiente</option>${state.procedures.map((p) => `<option value="${p.name}">${p.category} · ${p.name}</option>`).join('')}`
  renderCatalogList()
}

function renderCatalogList() {
  const materia = normalize(ui.searchMateria.value)
  const procedure = normalize(ui.searchProcedure.value)
  const rows = state.procedures.filter((p) => normalize(p.category).includes(materia) && normalize(p.name).includes(procedure))
  ui.catalogList.innerHTML = rows.map((p) => `<button class="monitor-list-item ${p.slug === state.selectedProcedureSlug ? 'active' : ''}" data-procedure="${p.slug}">${p.category} · ${p.name}</button>`).join('')
}

function renderCaseList() {
  const caseQ = normalize(ui.searchCase.value)
  const courtQ = normalize(ui.searchCourt.value)
  const rows = state.cases.filter((c) => {
    const label = `${c.rol_rit || ''} ${c.pjud_rit || ''} ${c.subject || c.pjud_caratulado || ''}`
    const court = c.court || c.pjud_tribunal || ''
    return normalize(label).includes(caseQ) && normalize(court).includes(courtQ)
  })
  ui.caseList.innerHTML = rows.map((c) => `<button class="monitor-list-item ${c.id === state.selectedCaseId ? 'active' : ''}" data-case="${c.id}">${c.rol_rit || c.pjud_rit || c.id} · ${c.subject || c.pjud_caratulado || 'Sin carátula'}</button>`).join('')
}

async function loadProcedureDetails(slug) {
  const selected = state.procedures.find((p) => p.slug === slug)
  if (!selected) return
  state.selectedProcedureSlug = slug
  const [{ data: nodes }, { data: routes }, { data: alerts }] = await Promise.all([
    supabase.from(TABLES.nodes).select('*').eq('procedure_slug', slug).order('sort_order'),
    supabase.from(TABLES.routes).select('*').eq('procedure_slug', slug).order('sort_order'),
    supabase.from(TABLES.alertTemplates).select('*').eq('category', selected.category).eq('procedure_name', selected.name)
  ])
  ui.catalogMateria.value = selected.category || ''
  ui.catalogProcedureName.value = selected.name || ''
  ui.catalogCompetentBody.value = selected.competent_body || ''
  ui.catalogStartForm.value = selected.start_form || ''
  ui.catalogLegalBasis.value = selected.legal_basis || ''
  ui.catalogMilestones.value = JSON.stringify((nodes || []).map((n) => ({ name: n.node_name, description: n.description, plazo: n.term, startsFrom: n.legal_basis, trigger: n.docs, outputRoute: n.outputs, alert: n.alerts })), null, 2)
  ui.catalogRoutes.value = JSON.stringify((routes || []).map((r) => ({ name: r.route_name || r.route, condition: r.condition, nextMilestone: r.next_milestone, term: r.conduct })), null, 2)
  ui.catalogAlerts.value = JSON.stringify((alerts || []).map((a) => ({ type: a.alert_type, milestone: a.milestone_name, route: a.route_name, term: a.term })), null, 2)
  ui.caseTitle.textContent = `Catálogo · ${selected.name}`
  ui.caseMeta.textContent = `${selected.category} · editable y persistente en base de datos`
  renderCatalogList()
}

async function saveCatalogEdit() {
  if (!ui.catalogMateria.value || !ui.catalogProcedureName.value) return
  const slug = state.selectedProcedureSlug || slugify(`${ui.catalogMateria.value}-${ui.catalogProcedureName.value}`)
  const name = ui.catalogProcedureName.value.trim()
  const category = ui.catalogMateria.value.trim()
  await supabase.from(TABLES.catalog).upsert({
    slug, name, category,
    competent_body: ui.catalogCompetentBody.value,
    start_form: ui.catalogStartForm.value,
    legal_basis: ui.catalogLegalBasis.value,
    editable_by_user: true,
    is_active: true
  }, { onConflict: 'category,name' })

  const milestones = JSON.parse(ui.catalogMilestones.value || '[]')
  for (const m of milestones) {
    await supabase.from(TABLES.nodes).upsert({ procedure_slug: slug, node_key: slugify(m.name), node_name: m.name, description: m.description || '', term: m.plazo || m.term || '', legal_basis: m.startsFrom || '', docs: m.trigger || '', outputs: m.outputRoute || '', alerts: m.alert || '' }, { onConflict: 'procedure_slug,node_name' })
  }
  const routes = JSON.parse(ui.catalogRoutes.value || '[]')
  for (const r of routes) {
    await supabase.from(TABLES.routes).upsert({ procedure_slug: slug, route_name: r.name, condition: r.condition || '', route: r.name, next_milestone: r.nextMilestone || '', conduct: r.term || '' }, { onConflict: 'procedure_slug,route_name' })
  }
  const alerts = JSON.parse(ui.catalogAlerts.value || '[]')
  for (const a of alerts) {
    await supabase.from(TABLES.alertTemplates).upsert({ category, procedure_name: name, milestone_name: a.milestone || '', route_name: a.route || '', alert_type: a.type || 'alerta', term: a.term || 'plazo variable según norma/resolución', visible_panel: true, visible_monitoring: true, visible_case: true }, { onConflict: 'category,procedure_name,milestone_name,route_name,alert_type' })
  }
  await loadCatalog()
  await loadProcedureDetails(slug)
}

function renderCaseEditor() {
  const c = state.cases.find((item) => item.id === state.selectedCaseId)
  if (!c) return
  const procedure = state.procedures.find((p) => p.slug === state.selectedProcedureSlug) || state.procedures[0]
  const workspace = loadWorkspace()[state.selectedCaseId] || {}
  ui.caseTitle.textContent = c.subject || c.pjud_caratulado || 'Causa sin carátula'
  ui.caseMeta.textContent = `${c.rol_rit || c.id} · ${c.court || c.pjud_tribunal || 'Tribunal no informado'}`
  ui.procedureSelect.value = procedure?.name || ''
  ui.procedureStatus.textContent = 'editable por usuario'
  ui.confidence.textContent = '100%'
  ui.currentMilestone.textContent = 'Revisión de expediente'
  ui.nextMilestone.textContent = 'Gestión del siguiente escrito'
  ui.deadlines.innerHTML = `<tr><td>Control diario</td><td><input type="date"></td><td>Revisar movimientos</td><td>corriendo</td></tr>`
  ui.alerts.innerHTML = `<tr><td>Alerta de monitoreo</td><td>Visible en panel y causa</td><td>media</td><td>${new Date().toLocaleDateString('es-CL')}</td><td>pendiente</td></tr>`
  ui.suggestions.innerHTML = `<li>Movimientos detectados: ${(workspace.movements || []).length}</li><li>Documentos detectados: ${(workspace.documents || []).length}</li>`
}

async function saveCaseMonitoring() {
  if (!state.selectedCaseId) return
  const selectedProcedure = state.procedures.find((p) => p.name === ui.procedureSelect.value)
  const caseRecord = state.cases.find((c) => c.id === state.selectedCaseId)
  const payload = {
    case_id: state.selectedCaseId,
    case_ref: caseRecord?.rol_rit || state.selectedCaseId,
    procedure_slug: selectedProcedure?.slug,
    procedure_name: selectedProcedure?.name,
    procedure_status: 'validado por usuario',
    confidence: 1,
    current_milestone: ui.currentMilestone.textContent,
    next_milestone: ui.nextMilestone.textContent,
    route_followed: 'monitoreo activo',
    fulfilled_milestones: [],
    pending_milestones: [],
    running_deadlines: [{ type: 'Control diario', dueDate: new Date().toISOString() }],
    flow_snapshot: { updatedAt: new Date().toISOString() },
    validations: [],
    manual_corrections: [],
    updated_by: state.userId,
    updated_at: new Date().toISOString()
  }
  await supabase.from(TABLES.state).upsert(payload, { onConflict: 'case_id' })

  const alertPayload = {
    case_id: state.selectedCaseId,
    alert_key: `monitor-${state.selectedCaseId}`,
    title: `MONITOREO · ${selectedProcedure?.name || 'Procedimiento'}`,
    summary: 'Alerta visible en Panel, Monitoreo y causa correspondiente.',
    foundation: selectedProcedure?.legal_basis || 'Monitoreo procesal',
    urgency: 'media',
    status: 'pendiente',
    source: 'Monitoreo',
    trace: {
      materia: selectedProcedure?.category,
      procedimiento: selectedProcedure?.name,
      hito: ui.currentMilestone.textContent,
      tipo_alerta: 'seguimiento',
      plazo: 'plazo variable según norma/resolución',
      fecha_base: new Date().toISOString(),
      fecha_estimada: new Date().toISOString(),
      visible_panel: true,
      visible_monitoreo: true,
      visible_causa: true
    }
  }
  await supabase.from(TABLES.alerts).upsert(alertPayload, { onConflict: 'case_id,alert_key' })
  localStorage.setItem(MONITORING_ALERTS_STORAGE_KEY, JSON.stringify([alertPayload]))
}

function bind() {
  ;[ui.searchMateria, ui.searchProcedure].forEach((el) => el.addEventListener('input', renderCatalogList))
  ;[ui.searchCase, ui.searchCourt].forEach((el) => el.addEventListener('input', renderCaseList))

  ui.catalogList.addEventListener('click', (event) => {
    const target = event.target.closest('[data-procedure]')
    if (!target) return
    loadProcedureDetails(target.dataset.procedure)
    toggleView('general')
  })

  ui.caseList.addEventListener('click', (event) => {
    const target = event.target.closest('[data-case]')
    if (!target) return
    state.selectedCaseId = target.dataset.case
    renderCaseList()
    renderCaseEditor()
    toggleView('case')
  })

  ui.btnViewGeneral.addEventListener('click', () => toggleView('general'))
  ui.btnViewCase.addEventListener('click', () => toggleView('case'))
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

  ui.btnSave.addEventListener('click', async () => {
    try {
      if (state.view === 'general') await saveCatalogEdit()
      else await saveCaseMonitoring()
      alert('Guardado correctamente en base de datos.')
    } catch (error) {
      alert(`Error de guardado: ${error.message}`)
    }
  })

  ui.btnCancel.addEventListener('click', async () => {
    if (state.view === 'general' && state.selectedProcedureSlug) await loadProcedureDetails(state.selectedProcedureSlug)
    if (state.view === 'case') renderCaseEditor()
  })

  ui.btnClose.addEventListener('click', () => { window.location.href = './produccion.html' })
  ui.btnAddDeadline.addEventListener('click', () => alert('Usa guardar para persistir nuevos plazos.'))
  ui.btnAddNode.addEventListener('click', () => alert('Edita hitos en Vista general.'))
  ui.btnAddTransition.addEventListener('click', () => alert('Edita rutas en Vista general.'))
}

async function init() {
  const user = await requireAuth()
  state.userId = user?.id || null
  await upsertSeedCatalog()
  await loadCatalog()
  const { data: cases } = await supabase.from(TABLES.cases).select('*').order('created_at', { ascending: false })
  state.cases = (cases || []).map((c) => ({ id: c.id, rol_rit: c.rol_rit, pjud_rit: c.pjud_rit, subject: c.subject, pjud_caratulado: c.pjud_caratulado, court: c.court, pjud_tribunal: c.pjud_tribunal }))
  const params = new URLSearchParams(window.location.search)
  state.selectedCaseId = params.get('caseId') || state.cases[0]?.id || ''
  state.selectedProcedureSlug = state.procedures[0]?.slug || ''
  if (state.selectedProcedureSlug) await loadProcedureDetails(state.selectedProcedureSlug)
  renderCaseList()
  renderCaseEditor()
  toggleView('general')
}

bind()
init()
