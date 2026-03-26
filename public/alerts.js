export const CLIENTS_STORAGE_KEY = 'alpha_avocat_clientes_expedientes_v1'
export const AGENDA_FORM_METADATA_PREFIX = '__nuevo_evento__:'
export const ALERT_CATEGORIES = [
  'Plazos judiciales',
  'Entrevistas próximas',
  'Honorarios por cobrar',
  'Audiencias',
  'Reuniones y atenciones',
  'Escritos pendientes',
  'Clientes con seguimiento pendiente',
  'Eventos de hoy',
  'Próximas actividades',
  'Alertas urgentes'
]

const CATEGORY_PRIORITY = new Map(ALERT_CATEGORIES.map((category, index) => [category, index]))
const URGENCY_PRIORITY = new Map([['alta', 0], ['media', 1], ['baja', 2]])
const DAY_MS = 24 * 60 * 60 * 1000

const MONITORING_ALERTS_STORAGE_KEY = 'alpha_avocat_monitoreo_alertas_v1'

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export function parseAgendaState(serializedState) {
  if (typeof serializedState !== 'string' || !serializedState.startsWith(AGENDA_FORM_METADATA_PREFIX)) return {}
  return safeJsonParse(serializedState.slice(AGENDA_FORM_METADATA_PREFIX.length), {}) || {}
}

export function loadClientDatasetFromStorage(storage = window.localStorage) {
  const raw = storage?.getItem?.(CLIENTS_STORAGE_KEY)
  return raw ? safeJsonParse(raw, { clients: [] }) || { clients: [] } : { clients: [] }
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function titleCase(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function toDate(value) {
  if (!value) return null
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function formatDate(date) {
  const parsed = toDate(date)
  return parsed ? parsed.toLocaleDateString('es-CL') : 'Pendiente'
}

function formatTime(date) {
  const parsed = toDate(date)
  return parsed ? parsed.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : 'Pendiente'
}

function formatDateTime(date) {
  const parsed = toDate(date)
  return parsed ? parsed.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : 'Pendiente'
}

function formatCurrency(value) {
  if (value == null || value === '') return ''
  const numeric = Number(String(value).replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(numeric)) return String(value)
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(numeric)
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]))
}

function getUrgencyByDiff(diffMs) {
  if (diffMs == null) return 'media'
  if (diffMs < 0) return 'alta'
  if (diffMs <= 60 * 60 * 1000) return 'alta'
  if (diffMs <= DAY_MS) return 'media'
  return 'baja'
}

function getUrgencyLabel(level) {
  return ({ alta: 'Alta', media: 'Media', baja: 'Baja' })[level] || 'Media'
}

function getUrgencyEmoji(level) {
  return ({ alta: '🔴', media: '🟠', baja: '🟡' })[level] || '🟠'
}

function classifyAgendaPersonCondition(state = {}, appointment = {}) {
  const explicit = state.person_condition || state.personCondition
  if (explicit) return explicit
  if (normalize(state.linked_client) === 'si' || normalize(state.linkedClient) === 'si') return 'Cliente'
  if (normalize(state.new_client) === 'si' || normalize(state.newClient) === 'si') return 'Prospecto'
  if ((state.non_client_name || state.nonClientName || state.non_client || state.nonClient || appointment.external_name) && !(state.linked_client_name || state.clientName)) {
    return 'Tercero'
  }
  return 'Actividad general'
}

function getAgendaPersonName(state = {}, appointment = {}) {
  return state.linked_client_name
    || state.clientName
    || state.new_client_name
    || state.newClientName
    || state.non_client_name
    || state.nonClientName
    || appointment.external_name
    || appointment.person_name
    || state.nombre
    || state.name
    || 'Sin persona asociada'
}

function getAgendaModalityDetail(state = {}, appointment = {}) {
  return state.modality_detail
    || state.modalityDetail
    || state.meeting_mode_detail
    || state.meetingModeDetail
    || titleCase(appointment.meeting_mode)
    || (state.modalidad === 'remota' ? 'Videollamada' : 'Presencial')
    || 'No informada'
}

function getAgendaResponsible(state = {}, appointment = {}) {
  return state.responsible || state.event_responsible || appointment.responsible || 'Por asignar'
}

function getAgendaLocation(state = {}) {
  return state.location_or_link || state.locationOrLink || state.link || state.location || ''
}

function getAgendaConfirmation(state = {}) {
  return state.confirmation_status || state.confirmationStatus || 'Sin confirmar'
}

function getAgendaObservation(state = {}, appointment = {}) {
  return state.notes || appointment.notes || ''
}

function getAgendaAssociation(state = {}, appointment = {}) {
  const clientName = state.linked_client_name || state.clientName || state.new_client_name || state.newClientName
  const caseRole = state.linked_case_role || state.caseRole || appointment.rol || state.new_case_role || state.newCaseRole
  if (caseRole && clientName) return `${clientName} · ${caseRole}`
  if (caseRole) return `Causa ${caseRole}`
  if (clientName) return clientName
  const fallback = getAgendaPersonName(state, appointment)
  return fallback === 'Sin persona asociada' ? 'Actividad general' : fallback
}

function buildAlertBase({
  id,
  module,
  category,
  title,
  summary,
  date,
  person,
  association,
  responsible,
  modality,
  location,
  urgency,
  href,
  observation = '',
  metadata = []
}) {
  const parsedDate = toDate(date)
  return {
    id,
    module,
    type: '',
    category,
    title,
    summary,
    date: parsedDate ? parsedDate.toISOString() : null,
    formattedDate: parsedDate ? formatDate(parsedDate) : 'Pendiente',
    formattedTime: parsedDate ? formatTime(parsedDate) : 'Pendiente',
    formattedDateTime: parsedDate ? formatDateTime(parsedDate) : 'Pendiente',
    person: person || 'Sin persona asociada',
    association: association || 'Sin referencia asociada',
    responsible: responsible || 'Por asignar',
    modality: modality || 'No informada',
    location: location || 'Sin link o ubicación',
    urgency,
    urgencyLabel: getUrgencyLabel(urgency),
    urgencyEmoji: getUrgencyEmoji(urgency),
    href,
    observation,
    metadata,
    sortAt: parsedDate ? parsedDate.getTime() : Number.MAX_SAFE_INTEGER
  }
}

function normalizeUrgencyFromLabel(value = '') {
  const v = normalize(value)
  if (!v) return 'media'
  if (v.includes('venc') || v.includes('urg') || v.includes('alta') || v.includes('crit')) return 'alta'
  if (v.includes('prox') || v.includes('media') || v.includes('pend')) return 'media'
  return 'baja'
}

function parseCurrency(value) {
  if (value == null) return ''
  const text = String(value).trim()
  return text || ''
}

function buildAgendaAlerts(appointments = [], now = new Date()) {
  const items = []
  const appointmentsBySlot = new Map()

  appointments.forEach((appointment) => {
    const state = parseAgendaState(appointment.required_background)
    const startsAt = toDate(appointment.starts_at)
    if (!startsAt) return

    const person = getAgendaPersonName(state, appointment)
    const association = getAgendaAssociation(state, appointment)
    const modality = getAgendaModalityDetail(state, appointment)
    const responsible = getAgendaResponsible(state, appointment)
    const location = getAgendaLocation(state)
    const confirmation = getAgendaConfirmation(state)
    const observation = getAgendaObservation(state, appointment)
    const condition = classifyAgendaPersonCondition(state, appointment)
    const eventName = state.title || appointment.title || `${titleCase(appointment.event_type || appointment.kind || 'evento')} de agenda`
    const diffMs = startsAt.getTime() - now.getTime()
    const dayDiff = Math.floor((startOfDay(startsAt).getTime() - startOfDay(now).getTime()) / DAY_MS)
    const isToday = dayDiff === 0
    const isTomorrow = dayDiff === 1
    const normalizedType = normalize(appointment.event_type || state.event_type || eventName)
    const isHearing = normalizedType.includes('audiencia')
    const isInterview = ['entrevista', 'consulta', 'reunion', 'reunión', 'atencion', 'atención', 'videollamada'].some((term) => normalizedType.includes(normalize(term)))
    const category = isHearing
      ? 'Audiencias'
      : isInterview
        ? 'Entrevistas próximas'
        : (isToday ? 'Eventos de hoy' : 'Reuniones y atenciones')
    const alertType = isInterview ? 'Entrevista próxima' : (isHearing ? 'Audiencia próxima' : 'Actividad de agenda')

    let summary = `${eventName} ${isToday ? 'hoy' : isTomorrow ? 'mañana' : 'el ' + formatDate(startsAt)} a las ${formatTime(startsAt)}.`
    if (diffMs > 0 && diffMs <= 30 * 60 * 1000) {
      summary = `Evento de agenda próximo en ${Math.max(1, Math.round(diffMs / 60000))} minutos.`
    }

    const metadata = [
      `Condición: ${condition}`,
      `Modalidad: ${modality}`,
      `Responsable: ${responsible}`,
      `Confirmación: ${confirmation}`,
      location ? `Link/ubicación: ${location}` : 'Link/ubicación pendiente'
    ]

    items.push(buildAlertBase({
      id: `agenda-${appointment.id}`,
      module: 'Agenda',
      category,
      title: eventName,
      summary,
      date: startsAt,
      person,
      association,
      responsible,
      modality,
      location,
      urgency: getUrgencyByDiff(diffMs),
      href: './agenda.html',
      observation,
      metadata
    }))
    items[items.length - 1].type = alertType

    const slotKey = `${responsible}::${startsAt.toISOString()}`
    const slotList = appointmentsBySlot.get(slotKey) || []
    slotList.push({ appointment, state, startsAt, eventName, person, responsible, modality, location })
    appointmentsBySlot.set(slotKey, slotList)

    if ((normalize(modality).includes('zoom') || normalize(modality).includes('meet') || normalize(modality).includes('video') || normalize(modality).includes('telefon')) && !location) {
      items.push(buildAlertBase({
        id: `agenda-missing-link-${appointment.id}`,
        module: 'Agenda',
        category: 'Alertas urgentes',
        title: 'Evento sin enlace o sin dirección cargada',
        summary: `${eventName} no tiene link o ubicación cargada.`,
        date: startsAt,
        person,
        association,
        responsible,
        modality,
        location: 'Sin link o ubicación',
        urgency: 'alta',
        href: './agenda.html',
        observation,
        metadata
      }))
    }

    if (normalize(confirmation).includes('pendiente') || normalize(confirmation).includes('sin confirmar')) {
      items.push(buildAlertBase({
        id: `agenda-unconfirmed-${appointment.id}`,
        module: 'Agenda',
        category: 'Alertas urgentes',
        title: 'Evento sin confirmación',
        summary: `${eventName} todavía no registra confirmación.`,
        date: startsAt,
        person,
        association,
        responsible,
        modality,
        location,
        urgency: diffMs <= DAY_MS ? 'alta' : 'media',
        href: './agenda.html',
        observation,
        metadata
      }))
    }
  })

  appointmentsBySlot.forEach((slotList) => {
    if (slotList.length < 2) return
    slotList.forEach((item, index) => {
      items.push(buildAlertBase({
        id: `agenda-conflict-${item.appointment.id}-${index}`,
        module: 'Agenda',
        category: 'Alertas urgentes',
        title: 'Conflicto de horario',
        summary: `${item.responsible} tiene más de un evento agendado para ${formatDateTime(item.startsAt)}.`,
        date: item.startsAt,
        person: item.person,
        association: item.person,
        responsible: item.responsible,
        modality: item.modality,
        location: item.location,
        urgency: 'alta',
        href: './agenda.html',
        metadata: ['Revisar solapamiento en Agenda']
      }))
    })
  })

  return items
}

function parseNextActivity(nextActivity = '') {
  const text = String(nextActivity || '').trim()
  if (!text || normalize(text).includes('sin actividad pendiente')) {
    return { text, date: null }
  }

  const match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s*[·|-]\s*(\d{1,2}:\d{2}))?/)
  if (!match) return { text, date: null }
  const [, day, month, year, time = '09:00'] = match
  const parsed = toDate(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${time}`)
  return { text, date: parsed }
}

function parseFlexibleDate(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const text = String(value).trim()
  if (!text) return null
  const direct = toDate(text)
  if (direct) return direct
  const dmyMatch = text.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/)
  if (!dmyMatch) return null
  let [, day, month, year, hour = '09', minute = '00'] = dmyMatch
  if (year.length === 2) year = `20${year}`
  return toDate(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}`)
}

function collectDeadlineCandidates(cause = {}) {
  const candidates = []
  const pushCandidate = (dateValue, label, source, suggestedAction = 'Revisar expediente y preparar gestión judicial') => {
    const parsed = parseFlexibleDate(dateValue)
    if (!parsed) return
    candidates.push({ date: parsed, label, source, suggestedAction })
  }

  pushCandidate(cause.deadline || cause.due_date || cause.next_deadline, 'Plazo registrado', 'Antecedentes de la causa')
  pushCandidate(cause.pjud_fecha_ubicacion, 'Última ubicación PJUD', 'PJUD', 'Revisar movimiento PJUD y determinar escrito pendiente')

  const notesText = String(cause.notes || '')
  const notesDate = parseFlexibleDate(notesText)
  if (notesDate) {
    pushCandidate(notesDate, 'Plazo detectado en observaciones', 'Producción / notas internas')
  }

  const milestones = Array.isArray(cause.production_milestones)
    ? cause.production_milestones
    : Array.isArray(cause.hitos_produccion)
      ? cause.hitos_produccion
      : []
  milestones.forEach((item, index) => {
    if (!item) return
    if (typeof item === 'string') {
      const milestoneDate = parseFlexibleDate(item)
      if (milestoneDate) pushCandidate(milestoneDate, `Hito ${index + 1}`, 'Producción')
      return
    }
    pushCandidate(item.deadline || item.date || item.fecha || item.dueDate, item.title || item.label || 'Hito de producción', 'Producción')
  })

  return candidates.sort((a, b) => a.date.getTime() - b.date.getTime())
}

function extractDeadlineEntries(item = {}) {
  const entries = []
  const list = Array.isArray(item.plazos) ? item.plazos : []
  list.forEach((deadline, index) => {
    const dueDate = toDate(deadline.vencimiento || deadline.dueDate || deadline.due_date)
    if (!dueDate) return
    entries.push({
      id: `${item.id || 'case'}-deadline-${index}`,
      dueDate,
      type: deadline.tipo || 'Plazo judicial',
      suggestedAction: deadline.escrito || deadline.gestion || deadline.management || '',
      urgency: normalizeUrgencyFromLabel(deadline.alerta || deadline.urgencia || deadline.prioridad)
    })
  })

  const directDueDate = toDate(item.deadline_date || item.deadlineDate || item.next_deadline || item.nextDeadline || item.proximo_plazo || item.proximoPlazo)
  if (directDueDate) {
    entries.push({
      id: `${item.id || 'case'}-deadline-direct`,
      dueDate: directDueDate,
      type: item.deadline_type || 'Plazo judicial',
      suggestedAction: item.suggested_action || item.gestion_sugerida || '',
      urgency: normalizeUrgencyFromLabel(item.alert_level || item.alerta || item.urgency)
    })
  }

  if (!entries.length) {
    const fallback = collectDeadlineCandidates(item)
    fallback.forEach((entry, index) => {
      entries.push({
        id: `${item.id || 'case'}-candidate-${index}`,
        dueDate: entry.date,
        type: entry.label || 'Plazo judicial',
        suggestedAction: entry.suggestedAction || '',
        urgency: normalizeUrgencyFromLabel(item.alert_level || item.alerta || item.urgency)
      })
    })
  }

  return entries
}

function getLastClientInteraction(expediente) {
  const historyDates = (expediente.history || [])
    .map((entry) => toDate(`${entry.date || ''}T${entry.time || '09:00'}`))
    .filter(Boolean)
    .sort((a, b) => b.getTime() - a.getTime())
  return historyDates[0] || toDate(expediente.openedAt)
}

function buildClientAlerts(clientDataset = { clients: [] }, now = new Date()) {
  const items = []

  ;(clientDataset.clients || []).forEach((client) => {
    const incompleteProfile = !client.address || !client.email || !client.phone || !client.birthDate
    if (incompleteProfile) {
      items.push(buildAlertBase({
        id: `cliente-incomplete-${client.id}`,
        module: 'Clientes',
        category: 'Clientes con seguimiento pendiente',
        title: 'Cliente nuevo sin completar ficha',
        summary: `${client.name} mantiene datos básicos incompletos en la ficha de Clientes.`,
        date: new Date(),
        person: client.name,
        association: client.name,
        responsible: 'Por asignar',
        modality: 'Gestión administrativa',
        location: client.email || client.phone || 'Sin contacto principal',
        urgency: 'media',
        href: './clientes.html',
        observation: client.notes || '',
        metadata: ['Completar identificación, contacto y seguimiento']
      }))
    }

    ;(client.expedientes || []).forEach((expediente) => {
      const nextActivity = parseNextActivity(expediente.nextActivity)
      const lastInteraction = getLastClientInteraction(expediente)
      const daysWithoutFollowUp = lastInteraction ? Math.floor((now.getTime() - lastInteraction.getTime()) / DAY_MS) : null
      const commonMeta = [
        `Expediente: ${expediente.code}`,
        `Estado: ${expediente.status}`,
        `Responsable: ${expediente.responsibleLawyer || 'Por asignar'}`
      ]

      if (nextActivity.date) {
        const diffMs = nextActivity.date.getTime() - now.getTime()
        items.push(buildAlertBase({
          id: `cliente-next-${expediente.id}`,
          module: 'Clientes',
          category: nextActivity.date <= new Date(startOfDay(now).getTime() + DAY_MS) ? 'Eventos de hoy' : 'Próximas actividades',
          title: 'Cliente con actividad próxima',
          summary: `${client.name} tiene ${expediente.nextActivity}.`,
          date: nextActivity.date,
          person: client.name,
          association: expediente.code,
          responsible: expediente.responsibleLawyer || 'Por asignar',
          modality: expediente.agendaActivity ? 'Agenda vinculada' : 'Seguimiento de cliente',
          location: expediente.source || 'Clientes',
          urgency: getUrgencyByDiff(diffMs),
          href: './clientes.html',
          observation: expediente.issueNotes || '',
          metadata: commonMeta
        }))
      }

      if (expediente.analysisPending) {
        items.push(buildAlertBase({
          id: `cliente-analysis-${expediente.id}`,
          module: 'Clientes',
          category: 'Clientes con seguimiento pendiente',
          title: 'Cliente con seguimiento pendiente',
          summary: `${client.name} mantiene análisis o instrucción interna pendiente en ${expediente.code}.`,
          date: lastInteraction || now,
          person: client.name,
          association: expediente.code,
          responsible: expediente.responsibleLawyer || 'Por asignar',
          modality: 'Seguimiento jurídico',
          location: expediente.source || 'Clientes',
          urgency: daysWithoutFollowUp != null && daysWithoutFollowUp > 30 ? 'alta' : 'media',
          href: './clientes.html',
          observation: expediente.issueNotes || '',
          metadata: [...commonMeta, 'Acción pendiente: completar análisis jurídico']
        }))
      }

      if (expediente.feesPending) {
        const fees = expediente.fees || {}
        const dueDate = toDate(fees.dueDate || fees.due_date || fees.nextDueDate || fees.next_due_date)
        const paymentUrgency = dueDate ? getUrgencyByDiff(dueDate.getTime() - now.getTime()) : normalizeUrgencyFromLabel(fees.response || expediente.status)
        items.push(buildAlertBase({
          id: `cliente-fees-${expediente.id}`,
          module: 'Clientes',
          category: 'Clientes con seguimiento pendiente',
          title: 'Pago de cuota pendiente o próxima',
          summary: `${client.name} registra cuota ${fees.installments || 'pendiente'} en ${expediente.code}.`,
          date: dueDate || lastInteraction || now,
          person: client.name,
          association: expediente.code,
          responsible: expediente.responsibleLawyer || 'Por asignar',
          modality: fees.modality || 'Gestión administrativa',
          location: expediente.source || 'Clientes',
          urgency: paymentUrgency,
          href: './clientes.html',
          observation: expediente.issueNotes || '',
          metadata: [
            ...commonMeta,
            'Tipo: pago de cuota',
            `Cuota: ${fees.installments || 'Pendiente por definir'}`,
            `Vencimiento: ${dueDate ? formatDate(dueDate) : 'No informado'}`,
            `Monto: ${parseCurrency(fees.invoice?.amount || fees.total || fees.base) || 'No informado'}`,
            `Estado: ${fees.response || 'Pendiente'}`
          ]
        }))
        items[items.length - 1].type = 'Pago de cuota'
      }

      if (daysWithoutFollowUp != null && daysWithoutFollowUp >= 45 && normalize(expediente.status) !== 'cerrado') {
        items.push(buildAlertBase({
          id: `cliente-stale-${expediente.id}`,
          module: 'Clientes',
          category: 'Clientes con seguimiento pendiente',
          title: 'Cliente sin seguimiento reciente',
          summary: `${client.name} no registra seguimiento desde hace ${daysWithoutFollowUp} días en ${expediente.code}.`,
          date: lastInteraction || now,
          person: client.name,
          association: expediente.code,
          responsible: expediente.responsibleLawyer || 'Por asignar',
          modality: 'Seguimiento',
          location: expediente.source || 'Clientes',
          urgency: 'alta',
          href: './clientes.html',
          observation: expediente.issueNotes || '',
          metadata: [...commonMeta, 'Revisar contacto, documentación e instrucciones internas']
        }))
      }
    })
  })

  return items
}

export function buildCaseAlerts(cases = [], now = new Date()) {
  const alerts = []
  ;(cases || []).forEach((item) => {
    const notes = item.notes || item.observaciones || 'Sin notas cargadas.'
    const caseName = item.pjud_caratulado || item.caratula || item.subject || 'Causa sin carátula'
    const caseRef = item.rol_rit || item.pjud_rit || item.rol || item.rit || item.pjud_ruc || item.ruc || item.id || 'Sin referencia'
    const deadlines = extractDeadlineEntries(item)
    if (!deadlines.length) return

    deadlines.forEach((deadline) => {
      const diffMs = deadline.dueDate.getTime() - now.getTime()
      const urgency = deadline.urgency || getUrgencyByDiff(diffMs)
      const alert = buildAlertBase({
        id: `causa-${deadline.id}`,
        module: 'Causas / Producción',
        category: 'Plazos judiciales',
        title: 'Plazo judicial próximo',
        summary: `${caseName} (${caseRef}) vence el ${formatDate(deadline.dueDate)}.`,
        date: deadline.dueDate,
        person: item.client_name || item.clientName || 'Cliente vinculado a causa',
        association: caseRef,
        responsible: item.responsible || 'Por asignar',
        modality: 'Gestión judicial',
        location: item.court || item.pjud_tribunal || 'Tribunal por definir',
        urgency,
        href: './produccion.html',
        observation: notes,
        metadata: [
          `Tipo: ${deadline.type || 'plazo judicial'}`,
          `Causa: ${caseName}`,
          `ROL/RIT/RUC: ${caseRef}`,
          `Carátula: ${caseName}`,
          `Vencimiento: ${formatDate(deadline.dueDate)}`,
          `Gestión sugerida: ${deadline.suggestedAction || 'No informada'}`,
          `Urgencia: ${getUrgencyLabel(urgency)}`
        ]
      })
      alert.type = 'Plazo judicial'
      alerts.push(alert)
    })
  })
  return alerts
}

export function buildFeesAlerts(clientDataset = { clients: [] }, now = new Date()) {
  const items = []
  ;(clientDataset.clients || []).forEach((client) => {
    ;(client.expedientes || []).forEach((expediente) => {
      const fee = expediente.fees || {}
      const dueDate = parseFlexibleDate(fee.dueDate)
      const hasPendingSignal = expediente.feesPending || normalize(fee.response).includes('prevencion') || normalize(fee.response).includes('rechaza')
      if (!dueDate && !hasPendingSignal) return
      const diffMs = dueDate ? (dueDate.getTime() - now.getTime()) : null
      const urgency = dueDate ? getUrgencyByDiff(diffMs) : (hasPendingSignal ? 'media' : 'baja')
      const feeState = expediente.feesPending ? 'Pendiente' : (fee.response || 'En revisión')
      items.push(buildAlertBase({
        id: `honorarios-${client.id}-${expediente.id}`,
        module: 'Clientes',
        category: 'Honorarios por cobrar',
        title: `Cuota de honorarios · ${client.name}`,
        summary: `${client.name} · ${expediente.code}: ${fee.installments || 'cuota por definir'} (${feeState}).`,
        date: dueDate || now,
        person: client.name,
        association: expediente.linkedCaseRol ? `${expediente.code} · ${expediente.linkedCaseRol}` : expediente.code,
        responsible: expediente.responsibleLawyer || 'Por asignar',
        modality: fee.modality || 'Honorarios',
        location: 'Clientes > Honorarios',
        urgency,
        href: './clientes.html',
        observation: expediente.issueNotes || '',
        metadata: [
          `Cliente: ${client.name}`,
          `Expediente/Causa: ${expediente.code}${expediente.linkedCaseRol ? ` · ${expediente.linkedCaseRol}` : ''}`,
          `Cuota: ${fee.installments || 'No definida'}`,
          `Monto: ${formatCurrency(fee.total || fee.invoice?.amount || '') || 'No informado'}`,
          `Vencimiento/cobro: ${dueDate ? formatDate(dueDate) : (fee.dueDate || 'No informado')}`,
          `Estado del pago: ${feeState}`
        ]
      }))
    })
  })
  return items
}


function loadMonitoringAlerts(storage = window.localStorage) {
  const rows = safeJsonParse(storage?.getItem?.(MONITORING_ALERTS_STORAGE_KEY) || '[]', []) || []
  return rows
    .filter((item) => item && item.status !== 'cerrada')
    .map((item, index) => {
      const date = toDate(item.deadline || item.createdAt || new Date()) || new Date()
      return buildAlertBase({
        id: item.id || `monitoreo-${index}`,
        module: 'Monitoreo',
        category: item.category || (item.urgency === 'alta' ? 'Alertas urgentes' : 'Plazos judiciales'),
        title: item.title || 'Alerta de monitoreo',
        summary: item.summary || 'Alerta procesal generada por monitoreo.',
        date,
        person: item.validationUser || 'Equipo jurídico',
        association: item.caseRef || item.caseId || 'Causa en monitoreo',
        responsible: item.validationUser || 'Por asignar',
        modality: 'Monitoreo procesal',
        location: 'Monitoreo > Flujo procesal',
        urgency: item.urgency || 'media',
        href: './monitoreo.html',
        observation: item.foundation || '',
        metadata: [
          `Fuente: ${item.source || 'Monitoreo'}`,
          `Estado: ${item.status || 'pendiente'}`,
          `Fundamento: ${item.foundation || 'No informado'}`,
          item.trace?.procedure ? `Procedimiento: ${item.trace.procedure}` : '',
          item.trace?.milestone ? `Hito detectado: ${item.trace.milestone}` : ''
        ].filter(Boolean)
      })
    })
}

function sortAlerts(alerts = []) {
  return [...alerts].sort((a, b) => {
    const urgencyDiff = (URGENCY_PRIORITY.get(a.urgency) ?? 99) - (URGENCY_PRIORITY.get(b.urgency) ?? 99)
    if (urgencyDiff !== 0) return urgencyDiff
    const dateDiff = a.sortAt - b.sortAt
    if (dateDiff !== 0) return dateDiff
    const categoryDiff = (CATEGORY_PRIORITY.get(a.category) ?? 99) - (CATEGORY_PRIORITY.get(b.category) ?? 99)
    if (categoryDiff !== 0) return categoryDiff
    return a.title.localeCompare(b.title, 'es')
  })
}

export function buildConsolidatedAlerts({ appointments = [], cases = [], clientDataset = { clients: [] }, now = new Date() }) {
  const caseAlerts = buildCaseAlerts(cases, now)
  const agendaAlerts = buildAgendaAlerts(appointments, now)
  const clientAlerts = buildClientAlerts(clientDataset, now)
  const feeAlerts = buildFeesAlerts(clientDataset, now)
  const monitoringAlerts = loadMonitoringAlerts()
  const alerts = sortAlerts([...caseAlerts, ...agendaAlerts, ...clientAlerts, ...feeAlerts, ...monitoringAlerts])
  const todayEnd = new Date(startOfDay(now).getTime() + DAY_MS)
  const weekEnd = new Date(startOfDay(now).getTime() + (7 * DAY_MS))

  const activeClients = (clientDataset.clients || []).filter((client) => (client.expedientes || []).some((expediente) => normalize(expediente.status) !== 'cerrado')).length
  const openCases = (cases || []).length
  const hearingsToday = agendaAlerts.filter((alert) => alert.category === 'Audiencias' && alert.date && toDate(alert.date) >= startOfDay(now) && toDate(alert.date) < todayEnd).length
  const pendingTasks = alerts.filter((alert) => ['alta', 'media'].includes(alert.urgency)).length

  const recentActivity = [...alerts]
    .sort((a, b) => (b.sortAt === a.sortAt ? 0 : b.sortAt - a.sortAt))
    .slice(0, 6)

  const upcomingAgenda = alerts.filter((alert) => alert.date && toDate(alert.date) >= now && toDate(alert.date) <= weekEnd)
  const weeklyHearings = agendaAlerts.filter((alert) => alert.category === 'Audiencias' && alert.date && toDate(alert.date) >= now && toDate(alert.date) <= weekEnd)
  const groupedAlerts = ALERT_CATEGORIES.map((category) => ({
    category,
    items: alerts.filter((alert) => alert.category === category).slice(0, category === 'Alertas urgentes' ? 6 : 4)
  })).filter((group) => group.items.length)

  return {
    alerts,
    groupedAlerts,
    recentActivity,
    activeCases: cases,
    weeklyHearings,
    upcomingAgenda,
    cards: {
      activeClients,
      openCases,
      hearingsToday,
      pendingTasks
    }
  }
}

export function renderAlertListItems(alerts = [], { emptyMessage = 'Sin alertas', showMeta = false } = {}) {
  if (!alerts.length) {
    return `<li class="panel-list-empty">${escapeHtml(emptyMessage)}</li>`
  }

  return alerts.map((alert) => {
    const meta = [
      `Tipo: ${alert.type || alert.category}`,
      `Origen: ${alert.module}`,
      `Referencia: ${alert.association}`,
      `Responsable: ${alert.responsible}`,
      `Urgencia: ${alert.urgencyLabel}`,
      `Modalidad: ${alert.modality}`,
      `Link/ubicación: ${alert.location}`,
      ...alert.metadata
    ].filter(Boolean)

    return `
      <li class="panel-alert-item urgency-${escapeHtml(alert.urgency)}">
        <div class="panel-alert-head">
          <span class="panel-alert-badge module-${escapeHtml(normalize(alert.module))}">${escapeHtml(alert.module)}</span>
          <span class="panel-alert-category">${escapeHtml(alert.category)}</span>
        </div>
        <strong>${escapeHtml(`${alert.urgencyEmoji} ${alert.title}`)}</strong>
        <p>${escapeHtml(alert.summary)}</p>
        <div class="panel-alert-meta">
          <span>${escapeHtml(alert.formattedDate)}</span>
          <span>${escapeHtml(alert.formattedTime)}</span>
          <span>${escapeHtml(alert.person)}</span>
        </div>
        ${showMeta ? `<ul class="panel-alert-tags">${meta.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}</ul>` : ''}
        <a class="ui-button ui-button--secondary panel-alert-link" href="${escapeHtml(alert.href || './panel.html')}">Ir al módulo</a>
        ${alert.observation ? `<div class="panel-alert-note">Obs.: ${escapeHtml(alert.observation)}</div>` : ''}
      </li>
    `
  }).join('')
}
