export const RECTIFICATION_ADMIN_NAME = 'Mario Javier Rodríguez Ardiles'
const SHORT_DATE_TIME = new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' })

export function normalizeComparableText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function isRectificationAdmin(candidate = '') {
  return normalizeComparableText(candidate) === normalizeComparableText(RECTIFICATION_ADMIN_NAME)
}

export function getSessionOperatorName(sessionUser = null, fallback = '') {
  return sessionUser?.user_metadata?.full_name
    || sessionUser?.user_metadata?.name
    || sessionUser?.email
    || fallback
    || localStorage.getItem('alpha_user_name')
    || 'Usuario Activo'
}

export function getRectificationAccessState(sessionUser = null, fallback = '') {
  const operatorName = getSessionOperatorName(sessionUser, fallback)
  return {
    operatorName,
    canRectify: isRectificationAdmin(operatorName),
    adminName: RECTIFICATION_ADMIN_NAME,
  }
}

export function normalizeRutInput(value = '') {
  const cleaned = String(value || '').replace(/[^0-9kK]/g, '').toUpperCase()
  if (!cleaned) return ''
  const body = cleaned.slice(0, -1)
  const dv = cleaned.slice(-1)
  const formattedBody = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return body ? `${formattedBody}-${dv}` : dv
}

export function isValidRut(value = '') {
  const cleaned = String(value || '').replace(/[^0-9kK]/g, '').toUpperCase()
  if (cleaned.length < 2) return false
  const body = cleaned.slice(0, -1)
  const dv = cleaned.slice(-1)
  let sum = 0
  let multiplier = 2
  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * multiplier
    multiplier = multiplier === 7 ? 2 : multiplier + 1
  }
  const remainder = 11 - (sum % 11)
  const expected = remainder === 11 ? '0' : remainder === 10 ? 'K' : String(remainder)
  return expected === dv
}

export function ensureRectificationLog(record = {}) {
  const next = structuredClone(record || {})
  next.rectificationLog = Array.isArray(next.rectificationLog) ? next.rectificationLog : []
  return next
}

export function createRectificationEntries({ previous = {}, next = {}, moduleName = '', actor = '', labels = {} } = {}) {
  const timestamp = new Date().toISOString()
  const previousValues = flattenForRectification(previous)
  const nextValues = flattenForRectification(next)
  const allKeys = [...new Set([...Object.keys(previousValues), ...Object.keys(nextValues)])]
  return allKeys
    .filter((key) => String(previousValues[key] ?? '') !== String(nextValues[key] ?? ''))
    .map((key) => ({
      timestamp,
      module: moduleName,
      actor,
      field: key,
      label: labels[key] || key,
      previousValue: stringifyRectificationValue(previousValues[key]),
      nextValue: stringifyRectificationValue(nextValues[key]),
    }))
}

export function appendRectificationLog(record = {}, entries = []) {
  const next = ensureRectificationLog(record)
  next.rectificationLog = [...entries, ...next.rectificationLog]
  return next
}

export function stringifyRectificationValue(value) {
  if (Array.isArray(value)) return value.join(', ')
  if (value && typeof value === 'object') return JSON.stringify(value)
  return String(value ?? '')
}

export function flattenForRectification(value, prefix = '', result = {}) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenForRectification(item, prefix ? `${prefix}.${index}` : String(index), result))
    return result
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, nested]) => {
      flattenForRectification(nested, prefix ? `${prefix}.${key}` : key, result)
    })
    return result
  }
  result[prefix] = value ?? ''
  return result
}

export function buildRectificationHistoryHtml(log = []) {
  if (!log.length) return '<div class="small-note">Sin rectificaciones registradas.</div>'
  return `
    <div class="rectification-history-list">
      ${log.slice(0, 8).map((entry) => `
        <article class="rectification-history-item">
          <div>
            <strong>${escapeHtml(entry.label || entry.field || 'Campo')}</strong>
            <div class="small-note">${escapeHtml(formatRectificationTimestamp(entry.timestamp))} · ${escapeHtml(entry.actor || 'Sin responsable')}</div>
          </div>
          <div class="small-note">${escapeHtml(entry.previousValue || '—')} → ${escapeHtml(entry.nextValue || '—')}</div>
        </article>
      `).join('')}
    </div>
  `
}

export function formatRectificationTimestamp(value) {
  if (!value) return 'Sin fecha'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return SHORT_DATE_TIME.format(date)
}

export function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[char]))
}
