const WORKSPACE_KEY = 'alpha-causas-workspace-v4'
const PJUD_IMPORTED_CONTENT_LABEL = 'Importadas del Poder Judicial'
const MAX_WORKSPACE_BYTES = 350000
const MAX_STRING_LENGTH = 4000
const MAX_LIST_ITEMS = 120
const HEAVY_FIELD_PATTERN = /(content|snapshot|base64|blob|raw(text|html)?|html|ebook(text|content)?|binary|payload|filedata|documentbody|fulltext)/i
const LIGHTWEIGHT_DOCUMENT_FIELDS = [
  'id',
  'name',
  'size',
  'category',
  'type',
  'extension',
  'observation',
  'origin',
  'destinationModule',
  'destinationContainer',
  'caseId',
  'linkedClient',
  'createdAt',
  'updatedAt',
  'downloadedAt',
  'downloadCount',
  'hash',
  'sourceUrl',
  'sourcePageUrl',
  'downloadStrategy',
  'lastTransferStatus',
  'lastTransferError',
  'documentId',
  'route',
  'status',
  'importedAt',
]

function safeParse(value, fallback) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function estimateBytes(value) {
  try {
    return new Blob([JSON.stringify(value)]).size
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

function isQuotaExceededError(error) {
  return (
    error?.name === 'QuotaExceededError'
    || error?.code === 22
    || /quota/i.test(String(error?.message || ''))
  )
}

function notifyWorkspaceStorageWarning(message = '', meta = {}) {
  console.warn(`[CAUSAS][WORKSPACE] ${message}`, meta)
  try {
    window.dispatchEvent(new CustomEvent('alpha:workspace-storage-warning', {
      detail: { message, ...meta },
    }))
  } catch {
    // noop: algunos contextos no exponen CustomEvent.
  }
}

function sanitizeString(value = '') {
  const text = String(value || '')
  if (!text) return ''
  if (/^data:/i.test(text)) return ''
  if (text.length <= MAX_STRING_LENGTH) return text
  return text.slice(0, MAX_STRING_LENGTH)
}

function sanitizeLightRecord(record = {}, depth = 0) {
  if (depth > 4 || !record || typeof record !== 'object') return null
  if (Array.isArray(record)) {
    return record
      .slice(0, MAX_LIST_ITEMS)
      .map((item) => sanitizeLightRecord(item, depth + 1))
      .filter((item) => item != null)
  }

  const result = {}
  Object.entries(record).forEach(([key, value]) => {
    if (HEAVY_FIELD_PATTERN.test(key) && !/(status|id|hash|updated|created|date)/i.test(key)) return
    if (typeof value === 'string') {
      const clean = sanitizeString(value)
      if (clean) result[key] = clean
      return
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value
      return
    }
    if (value == null) {
      result[key] = value
      return
    }
    if (typeof value === 'object') {
      const nested = sanitizeLightRecord(value, depth + 1)
      if (nested != null) result[key] = nested
    }
  })
  return result
}

function sanitizeDocumentRecord(record = {}) {
  const next = {}
  LIGHTWEIGHT_DOCUMENT_FIELDS.forEach((field) => {
    const value = record?.[field]
    if (value == null || value === '') return
    if (typeof value === 'string') {
      const clean = sanitizeString(value)
      if (clean) next[field] = clean
      return
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      next[field] = value
      return
    }
    if (value && typeof value === 'object') {
      next[field] = sanitizeLightRecord(value)
    }
  })
  return next
}

function sanitizeCauseForStorage(cause = {}, causeId = '') {
  const safeCause = ensureCauseStorage(cause, causeId)
  const next = { id: String(safeCause.id || causeId || '') }

  Object.entries(safeCause).forEach(([key, value]) => {
    if (['documents', 'movements', 'syncHistory', 'importOperations', 'reversionLog', 'documentContainers'].includes(key)) return
    if (HEAVY_FIELD_PATTERN.test(key) && !/(status|id|hash|updated|created|date|importedat|lastsyncat)/i.test(key)) return
    if (typeof value === 'string') {
      const clean = sanitizeString(value)
      if (clean) next[key] = clean
      return
    }
    if (typeof value === 'number' || typeof value === 'boolean' || value == null) {
      next[key] = value
      return
    }
    if (Array.isArray(value) || typeof value === 'object') {
      const cleaned = sanitizeLightRecord(value)
      if (cleaned != null) next[key] = cleaned
    }
  })

  next.documents = (safeCause.documents || [])
    .slice(0, MAX_LIST_ITEMS)
    .map((record) => sanitizeDocumentRecord(record))
    .filter((record) => record.id || record.hash || record.name)

  const sanitizeHistory = (list = []) => list
    .slice(0, MAX_LIST_ITEMS)
    .map((item) => sanitizeLightRecord(item))
    .filter(Boolean)

  next.movements = sanitizeHistory(safeCause.movements)
  next.syncHistory = sanitizeHistory(safeCause.syncHistory)
  next.importOperations = sanitizeHistory(safeCause.importOperations)
  next.reversionLog = sanitizeHistory(safeCause.reversionLog)

  next.documentContainers = Object.fromEntries(
    Object.entries(safeCause.documentContainers || {}).map(([containerId, container]) => [
      containerId,
      {
        label: sanitizeString(container?.label || ''),
        docIds: Array.from(new Set((container?.docIds || []).slice(0, MAX_LIST_ITEMS).map((id) => String(id || '')).filter(Boolean))),
      },
    ]),
  )

  return next
}

function compactWorkspaceForStorage(workspace = {}) {
  const next = structuredClone(workspace || {})
  Object.values(next).forEach((entry) => {
    if (!entry || typeof entry !== 'object') return
    if (Array.isArray(entry.documents) && entry.documents.length > 24) {
      entry.documents = entry.documents.slice(0, 24)
    }
    if (Array.isArray(entry.movements) && entry.movements.length > 40) {
      entry.movements = entry.movements.slice(0, 40)
    }
    if (Array.isArray(entry.syncHistory) && entry.syncHistory.length > 30) {
      entry.syncHistory = entry.syncHistory.slice(0, 30)
    }
    if (Array.isArray(entry.importOperations) && entry.importOperations.length > 30) {
      entry.importOperations = entry.importOperations.slice(0, 30)
    }
    if (Array.isArray(entry.reversionLog) && entry.reversionLog.length > 30) {
      entry.reversionLog = entry.reversionLog.slice(0, 30)
    }
  })
  return next
}

export function sanitizeWorkspaceForStorage(workspace = {}) {
  if (!workspace || typeof workspace !== 'object') return {}
  const next = {}
  Object.entries(workspace).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value) && (
      'documents' in value
      || 'documentContainers' in value
      || 'movements' in value
      || 'importMeta' in value
      || 'poderJudicial' in value
    )) {
      next[key] = sanitizeCauseForStorage(value, key)
      return
    }
    if (typeof value === 'string') {
      const clean = sanitizeString(value)
      if (clean) next[key] = clean
      return
    }
    if (typeof value === 'number' || typeof value === 'boolean' || value == null) {
      next[key] = value
      return
    }
    if (typeof value === 'object') {
      const cleanObject = sanitizeLightRecord(value)
      if (cleanObject != null) next[key] = cleanObject
    }
  })
  return next
}

export function loadWorkspace(storage = window.localStorage) {
  const raw = storage.getItem(WORKSPACE_KEY)
  if (!raw) return {}
  const parsed = safeParse(raw, {})
  const sanitized = sanitizeWorkspaceForStorage(parsed)
  const shouldPersistSanitized = raw.length > MAX_WORKSPACE_BYTES || JSON.stringify(parsed) !== JSON.stringify(sanitized)
  if (shouldPersistSanitized) {
    saveWorkspace(sanitized, storage, { skipSanitize: true, reason: 'load-migration' })
  }
  return sanitized
}

export function saveWorkspace(workspace, storage = window.localStorage, options = {}) {
  const sanitized = options.skipSanitize ? (workspace || {}) : sanitizeWorkspaceForStorage(workspace)
  let payload = sanitized
  if (estimateBytes(payload) > MAX_WORKSPACE_BYTES) {
    payload = compactWorkspaceForStorage(payload)
  }

  try {
    storage.setItem(WORKSPACE_KEY, JSON.stringify(payload))
  } catch (error) {
    if (!isQuotaExceededError(error)) throw error
    notifyWorkspaceStorageWarning('Se excedió la cuota de localStorage. Se limpiará caché local no esencial y se continuará con Supabase.', {
      reason: options.reason || 'save',
      key: WORKSPACE_KEY,
    })
    const fallbackPayload = compactWorkspaceForStorage(sanitizeWorkspaceForStorage(payload))
    try {
      storage.removeItem(WORKSPACE_KEY)
      storage.setItem(WORKSPACE_KEY, JSON.stringify(fallbackPayload))
    } catch (fallbackError) {
      if (!isQuotaExceededError(fallbackError)) throw fallbackError
      storage.removeItem(WORKSPACE_KEY)
      notifyWorkspaceStorageWarning('No fue posible guardar caché local de causas. La persistencia principal seguirá en Supabase.', {
        reason: 'fallback-cleanup',
        key: WORKSPACE_KEY,
      })
    }
  }
}

export function slugId(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || `causa-${Date.now()}`
}

export function normalizeParticipantLabel(value = '') {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
}

function takeMainPartyLabel(parties = []) {
  if (!parties.length) return ''
  if (parties.length === 1) return normalizeParticipantLabel(parties[0])
  return `${normalizeParticipantLabel(parties[0])} y otros`
}

export function buildCaratula({ demandantes = [], demandados = [], fallback = '' } = {}) {
  const left = takeMainPartyLabel(demandantes)
  const right = takeMainPartyLabel(demandados)
  if (left && right) return `${left} con ${right}`
  return normalizeParticipantLabel(fallback) || 'Sin carátula'
}

export function normalizeCaratula(rawValue = '') {
  const value = normalizeParticipantLabel(rawValue)
  if (!value) return 'Sin carátula'
  const normalized = value.replace(/\s+v\.?\s+/i, ' con ').replace(/\s+vs\.?\s+/i, ' con ')
  if (/\scon\s/i.test(normalized)) {
    const [left, right] = normalized.split(/\scon\s/i)
    return `${normalizeParticipantLabel(left)} con ${normalizeParticipantLabel(right)}`
  }
  return normalized
}

function inferCategory(name = '') {
  const lower = String(name || '').toLowerCase()
  if (lower.includes('resol')) return 'Resoluciones'
  if (lower.includes('notif')) return 'Notificaciones'
  if (lower.includes('escrit')) return 'Escritos'
  if (lower.includes('ebook')) return 'Ebook'
  if (lower.includes('anexo')) return 'Anexos'
  return 'Otros antecedentes'
}

function inferMimeFromName(name = '') {
  const lower = String(name || '').toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (lower.endsWith('.doc')) return 'application/msword'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.txt')) return 'text/plain;charset=utf-8'
  return 'application/octet-stream'
}

function deriveNameFromUrl(sourceUrl = '', fallback = 'documento.bin') {
  try {
    const resolved = new URL(String(sourceUrl || ''), window.location.href)
    const pathname = resolved.pathname.split('/').filter(Boolean).pop() || ''
    const cleanName = pathname.trim()
    return cleanName || fallback
  } catch {
    return fallback
  }
}

function extractFirstUrl(text = '') {
  return String(text || '').match(/https?:\/\/[^\s)>"']+/i)?.[0] || ''
}

function deriveImportedDocumentName(body = '', sourceUrl = '', index = 0) {
  const normalizedBody = normalizeParticipantLabel(body)
  if (normalizedBody.includes('.')) return normalizedBody
  if (sourceUrl) return deriveNameFromUrl(sourceUrl, `documento-${index + 1}.bin`)
  return `${normalizedBody || `Documento ${index + 1}`}.txt`
}

function toBase64(value = '') {
  return btoa(unescape(encodeURIComponent(String(value))))
}

export function buildTextDataUrl(text = '', mime = 'text/plain;charset=utf-8') {
  return `data:${mime};base64,${toBase64(text)}`
}

export function quickHash(value = '') {
  let hash = 0
  const input = String(value || '')
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(index)
    hash |= 0
  }
  return `h${Math.abs(hash)}`
}

export function ensureCauseStorage(detail = {}, causeId = '') {
  const next = structuredClone(detail || {})
  next.id = String(next.id || causeId || '')
  next.documents = Array.isArray(next.documents) ? next.documents : []
  next.movements = Array.isArray(next.movements) ? next.movements : []
  next.syncHistory = Array.isArray(next.syncHistory) ? next.syncHistory : []
  next.importOperations = Array.isArray(next.importOperations) ? next.importOperations : []
  next.reversionLog = Array.isArray(next.reversionLog) ? next.reversionLog : []
  next.importMeta = next.importMeta || { mode: 'manual', status: 'Sin importación judicial', importedAt: null, lastSyncAt: null }
  next.poderJudicial = next.poderJudicial || { link: '', sourceType: 'manual', importedAt: null, lastSyncAt: null, notes: '' }
  next.documentContainers = next.documentContainers || {
    ebook: { label: 'Ebook', docIds: [] },
    asociados: { label: 'Documentos asociados', docIds: [] },
    escritos: { label: 'Escritos', docIds: [] },
    resoluciones: { label: 'Resoluciones', docIds: [] },
    notificaciones: { label: 'Notificaciones', docIds: [] },
    antecedentes: { label: 'Otros antecedentes', docIds: [] },
    importadosPjud: { label: PJUD_IMPORTED_CONTENT_LABEL, docIds: [] },
  }
  if (!next.documentContainers.importadosPjud) {
    next.documentContainers.importadosPjud = { label: PJUD_IMPORTED_CONTENT_LABEL, docIds: [] }
  }
  next.selectedClientParties = Array.isArray(next.selectedClientParties) ? next.selectedClientParties : []
  return next
}

export function upsertDocument(detail = {}, input = {}) {
  const next = ensureCauseStorage(detail)
  const now = new Date().toISOString()
  const name = normalizeParticipantLabel(input.name || input.fileName || 'Documento sin nombre')
  const content = input.content || buildTextDataUrl(input.placeholderText || `Documento ${name}`)
  const category = input.category || inferCategory(name)
  const id = input.id || `doc-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  const hash = input.hash || quickHash(`${name}|${input.size || ''}|${input.content || ''}|${input.origin || ''}|${input.caseId || ''}`)
  const existingIndex = next.documents.findIndex((doc) => doc.id === id || doc.hash === hash)
  const documentRecord = {
    id,
    name,
    size: Number(input.size || 0),
    category,
    type: input.type || inferMimeFromName(name),
    extension: name.includes('.') ? name.split('.').pop().toLowerCase() : '',
    observation: normalizeParticipantLabel(input.observation || ''),
    origin: input.origin || 'Carga manual',
    destinationModule: input.destinationModule || 'Causas',
    destinationContainer: input.destinationContainer || containerIdForCategory(category),
    caseId: String(input.caseId || next.id || ''),
    linkedClient: input.linkedClient || '',
    createdAt: input.createdAt || now,
    updatedAt: now,
    downloadedAt: input.downloadedAt || null,
    downloadCount: Number(input.downloadCount || 0),
    hash,
    content,
    sourceUrl: input.sourceUrl || '',
    sourcePageUrl: input.sourcePageUrl || '',
    downloadStrategy: input.downloadStrategy || (input.sourceUrl ? 'remote' : 'stored'),
    lastTransferStatus: input.lastTransferStatus || '',
    lastTransferError: input.lastTransferError || '',
  }

  if (existingIndex >= 0) {
    const previous = next.documents[existingIndex]
    next.documents[existingIndex] = { ...previous, ...documentRecord, downloadedAt: previous.downloadedAt, downloadCount: previous.downloadCount || 0 }
  } else {
    next.documents.unshift(documentRecord)
  }

  const containerId = documentRecord.destinationContainer
  Object.values(next.documentContainers).forEach((container) => {
    container.docIds = (container.docIds || []).filter((docId) => docId !== documentRecord.id)
  })
  if (next.documentContainers[containerId]) {
    next.documentContainers[containerId].docIds.unshift(documentRecord.id)
  }

  if (category === 'Ebook') next.ebookDocumentId = documentRecord.id
  return next
}

export function removeDocument(detail = {}, documentId) {
  const next = ensureCauseStorage(detail)
  next.documents = next.documents.filter((doc) => doc.id !== documentId)
  Object.values(next.documentContainers).forEach((container) => {
    container.docIds = (container.docIds || []).filter((docId) => docId !== documentId)
  })
  if (next.ebookDocumentId === documentId) next.ebookDocumentId = null
  return next
}

export function recordDownload(detail = {}, documentId) {
  const next = ensureCauseStorage(detail)
  const target = next.documents.find((doc) => doc.id === documentId)
  if (target) {
    target.downloadedAt = new Date().toISOString()
    target.downloadCount = Number(target.downloadCount || 0) + 1
  }
  return next
}

export function containerIdForCategory(category = '') {
  const normalized = String(category || '').toLowerCase()
  if (normalized.includes('ebook')) return 'ebook'
  if (normalized.includes('pjud')) return 'importadosPjud'
  if (normalized.includes('poder judicial')) return 'importadosPjud'
  if (normalized.includes('escrit')) return 'escritos'
  if (normalized.includes('resol')) return 'resoluciones'
  if (normalized.includes('notif')) return 'notificaciones'
  if (normalized.includes('asoci')) return 'asociados'
  return 'antecedentes'
}

export function getDocumentsByContainer(detail = {}, containerId = 'asociados') {
  const next = ensureCauseStorage(detail)
  const ids = next.documentContainers?.[containerId]?.docIds || []
  return ids
    .map((id) => next.documents.find((doc) => doc.id === id))
    .filter(Boolean)
}

export async function filesToDocumentInputs(fileList = [], meta = {}) {
  const files = Array.from(fileList || [])
  return Promise.all(files.map(async (file) => ({
    name: file.name,
    size: file.size,
    type: file.type || inferMimeFromName(file.name),
    category: meta.category || inferCategory(file.name),
    observation: meta.observation || '',
    origin: meta.origin || 'Carga manual',
    destinationModule: meta.destinationModule || 'Causas',
    destinationContainer: meta.destinationContainer || containerIdForCategory(meta.category || inferCategory(file.name)),
    caseId: meta.caseId || '',
    linkedClient: meta.linkedClient || '',
    content: await readFileAsDataUrl(file),
    hash: quickHash(`${file.name}|${file.size}|${file.lastModified}|${meta.caseId || ''}`),
  })))
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('No fue posible leer el archivo.'))
    reader.readAsDataURL(file)
  })
}

export function openDocument(documentRecord = {}) {
  if (!documentRecord?.content) return false
  const target = window.open(documentRecord.content, '_blank', 'noopener,noreferrer')
  return Boolean(target)
}

export function downloadDocument(documentRecord = {}) {
  if (!documentRecord?.content) return false
  const anchor = document.createElement('a')
  anchor.href = documentRecord.content
  anchor.download = documentRecord.name || 'documento'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  return true
}

function classifyDocumentNode(documentRecord = {}) {
  const extension = String(documentRecord.extension || documentRecord.name?.split('.').pop() || '').toLowerCase()
  const mime = String(documentRecord.type || '').toLowerCase()
  const category = String(documentRecord.category || '').toLowerCase()
  const name = String(documentRecord.name || '').toLowerCase()
  if (category.includes('ebook') || name.includes('ebook')) return 'book'
  if (category.includes('doctrina')) return 'book-doctrina'
  if (category.includes('jurisprudencia')) return 'book-jurisprudencia'
  if (category.includes('acta') || name.includes('acta')) return 'booklet-acta'
  if (category.includes('informe') || name.includes('informe')) return 'booklet-informe'
  if (category.includes('escrito') || name.includes('escrito')) return 'booklet-escrito'
  if (category.includes('certificado') || name.includes('certificado')) return 'booklet-certificado'
  if (category.includes('declar') || name.includes('declar')) return 'booklet-declaracion'
  if (category.includes('perit') || name.includes('perit')) return 'booklet-peritaje'
  if (mime.includes('pdf') || extension === 'pdf') return 'pdf'
  if (mime.includes('word') || ['doc', 'docx'].includes(extension)) return 'word'
  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(extension)) return 'image'
  if (mime.includes('zip') || ['zip', 'rar', '7z'].includes(extension)) return 'zip'
  return 'file'
}

function formatNodeDate(value = '') {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString()
}

export function buildDocumentExplorer(detail = {}, options = {}) {
  const cause = ensureCauseStorage(detail, detail?.id)
  const archive = cause.expedienteDigital || {}
  const rootName = options.rootName || 'Expedientes Digitales'
  const nodes = []
  const seenIds = new Set()
  const childrenById = new Map()

  const ensureUniqueId = (candidate) => {
    const base = slugId(candidate || `node-${nodes.length + 1}`)
    if (!seenIds.has(base)) {
      seenIds.add(base)
      return base
    }
    let index = 2
    while (seenIds.has(`${base}-${index}`)) index += 1
    const nextId = `${base}-${index}`
    seenIds.add(nextId)
    return nextId
  }

  const createNode = (input = {}) => {
    const node = {
      id: ensureUniqueId(input.id || `${input.parentId || 'root'}-${input.name || input.type || 'node'}`),
      name: String(input.name || 'Elemento sin nombre').trim() || 'Elemento sin nombre',
      type: input.type || 'file',
      extension: input.extension || '',
      path: input.path || '',
      parentId: input.parentId ?? null,
      children: [],
      size: Number(input.size || 0),
      updatedAt: input.updatedAt || '',
      thumbnailUrl: input.thumbnailUrl || '',
      downloadUrl: input.downloadUrl || '',
      previewUrl: input.previewUrl || '',
      isExpandable: Boolean(input.isExpandable),
      documentId: input.documentId || null,
      mimeType: input.mimeType || '',
      meta: input.meta || {},
    }
    nodes.push(node)
    childrenById.set(node.id, node.children)
    if (node.parentId) {
      const siblingList = childrenById.get(node.parentId)
      if (Array.isArray(siblingList)) siblingList.push(node.id)
    }
    return node
  }

  const root = createNode({
    id: 'document-explorer-root',
    name: rootName,
    type: 'folder',
    parentId: null,
    isExpandable: true,
    path: rootName,
  })

  const clientArchive = createNode({
    id: 'archivador-cliente',
    name: archive.cliente?.nombre || options.clientName || cause.cliente || 'Archivador Cliente',
    type: 'archivador',
    parentId: root.id,
    isExpandable: true,
    path: `${root.path} / ${archive.cliente?.nombre || options.clientName || cause.cliente || 'Archivador Cliente'}`,
  })

  const libraryArchive = createNode({
    id: 'archivador-biblioteca',
    name: archive.biblioteca?.nombre || 'Biblioteca',
    type: 'archivador',
    parentId: root.id,
    isExpandable: true,
    path: `${root.path} / ${archive.biblioteca?.nombre || 'Biblioteca'}`,
  })

  const tribunalBranch = createNode({
    id: 'archivador-cliente-tribunal',
    name: 'Kardex de tribunales',
    type: 'kardex',
    parentId: clientArchive.id,
    isExpandable: true,
    path: `${clientArchive.path} / Tribunal`,
  })

  const legalArchiveFolders = [
    'Ebook',
    'Acta de entrevista cliente',
    'Documento',
    'Absolución de posiciones',
    'Jurisprudencia',
    'Escritos',
    'Resoluciones',
    'Pruebas',
    'Trazabilidad',
    PJUD_IMPORTED_CONTENT_LABEL,
  ]

  const advisoryBranch = createNode({
    id: 'archivador-cliente-asesoria',
    name: 'Asesoría',
    type: 'folder',
    parentId: clientArchive.id,
    isExpandable: true,
    path: `${clientArchive.path} / Asesoría`,
  })

  const documentsByContainer = new Map(Object.keys(cause.documentContainers || {}).map((containerId) => [containerId, getDocumentsByContainer(cause, containerId)]))
  const assignedDocumentIds = new Set()

  const appendDocumentNodes = (parentNode, documents = []) => {
    documents.forEach((documentRecord) => {
      if (!documentRecord) return
      assignedDocumentIds.add(documentRecord.id)
      createNode({
        id: `doc-${documentRecord.id}`,
        name: documentRecord.name || 'Archivo sin nombre',
        type: classifyDocumentNode(documentRecord),
        extension: documentRecord.extension || '',
        parentId: parentNode.id,
        isExpandable: false,
        size: Number(documentRecord.size || 0),
        updatedAt: formatNodeDate(documentRecord.updatedAt || documentRecord.createdAt),
        thumbnailUrl: classifyDocumentNode(documentRecord) === 'image' ? documentRecord.content || '' : '',
        downloadUrl: documentRecord.content || '',
        previewUrl: documentRecord.content || '',
        documentId: documentRecord.id,
        mimeType: documentRecord.type || '',
        path: `${parentNode.path} / ${documentRecord.name || 'Archivo sin nombre'}`,
        meta: {
          category: documentRecord.category || '',
          origin: documentRecord.origin || '',
        },
      })
    })
  }

  ;(archive.cliente?.tribunal?.carpetas || []).forEach((folder, folderIndex) => {
    const tribunalFolder = createNode({
      id: `tribunal-${folderIndex}-${folder.tribunal || cause.tribunal || 'tribunal'}`,
      name: folder.tribunal || cause.tribunal || 'Tribunal',
      type: 'kardex',
      parentId: tribunalBranch.id,
      isExpandable: true,
      path: `${tribunalBranch.path} / ${folder.tribunal || cause.tribunal || 'Tribunal'}`,
    })

    ;(folder.causas || []).forEach((caseFolder, caseIndex) => {
      const causeFolder = createNode({
        id: `tribunal-causa-${folderIndex}-${caseIndex}-${caseFolder.nombre || cause.caratula || 'causa'}`,
        name: caseFolder.nombre || cause.caratula || 'Causa',
        type: 'archivador',
        parentId: tribunalFolder.id,
        isExpandable: true,
        path: `${tribunalFolder.path} / ${caseFolder.nombre || cause.caratula || 'Causa'}`,
      })

      const knownFolders = new Map()
      const normalizedSubfolders = legalArchiveFolders.length ? legalArchiveFolders : (caseFolder.subcarpetas || [])
      normalizedSubfolders.forEach((subfolder, subIndex) => {
        const node = createNode({
          id: `tribunal-subcarpeta-${folderIndex}-${caseIndex}-${subIndex}-${subfolder}`,
          name: subfolder,
          type: 'folder',
          parentId: causeFolder.id,
          isExpandable: true,
          path: `${causeFolder.path} / ${subfolder}`,
        })
        knownFolders.set(slugId(subfolder), node)
      })

      const containerMappings = [
        ['ebook', ['ebook']],
        ['asociados', ['documento', 'acta-de-entrevista-cliente']],
        ['escritos', ['escritos']],
        ['resoluciones', ['resoluciones', 'jurisprudencia']],
        ['notificaciones', ['trazabilidad']],
        ['antecedentes', ['pruebas', 'absolucion-de-posiciones']],
        ['importadosPjud', [slugId(PJUD_IMPORTED_CONTENT_LABEL), 'importados-de-pjud', 'importadas-del-poder-judicial']],
      ]

      containerMappings.forEach(([containerId, aliases]) => {
        const documents = documentsByContainer.get(containerId) || []
        if (!documents.length) return
        const targetFolder = aliases.map((alias) => knownFolders.get(alias)).find(Boolean)
        appendDocumentNodes(targetFolder || causeFolder, documents)
      })
    })
  })

  ;(archive.cliente?.asesoria?.carpetas || []).forEach((folder, folderIndex) => {
    const advisoryFolder = createNode({
      id: `asesoria-${folderIndex}-${folder.nombre || 'asesoria'}`,
      name: folder.nombre || `Asesoría ${folderIndex + 1}`,
      type: 'folder',
      parentId: advisoryBranch.id,
      isExpandable: true,
      path: `${advisoryBranch.path} / ${folder.nombre || `Asesoría ${folderIndex + 1}`}`,
    })

    ;(folder.contenidos || []).forEach((item, itemIndex) => {
      createNode({
        id: `asesoria-contenido-${folderIndex}-${itemIndex}-${item}`,
        name: item,
        type: 'folder',
        parentId: advisoryFolder.id,
        isExpandable: true,
        path: `${advisoryFolder.path} / ${item}`,
      })
    })
  })

  ;(archive.biblioteca?.colecciones || []).forEach((collection, index) => {
    createNode({
      id: `biblioteca-${index}-${collection}`,
      name: collection,
      type: 'folder',
      parentId: libraryArchive.id,
      isExpandable: true,
      path: `${libraryArchive.path} / ${collection}`,
    })
  })

  const orphanDocuments = (cause.documents || []).filter((documentRecord) => !assignedDocumentIds.has(documentRecord.id))
  if (orphanDocuments.length) {
    appendDocumentNodes(clientArchive, orphanDocuments)
  }

  nodes.forEach((node) => {
    node.children = [...new Set(node.children)]
    node.isExpandable = node.isExpandable || node.children.length > 0
  })

  return {
    rootId: root.id,
    nodes,
    nodeMap: Object.fromEntries(nodes.map((node) => [node.id, node])),
    hasFiles: nodes.some((node) => ['pdf', 'word', 'image', 'zip', 'file', 'book', 'book-doctrina', 'book-jurisprudencia', 'booklet-acta', 'booklet-informe', 'booklet-escrito', 'booklet-certificado', 'booklet-declaracion', 'booklet-peritaje'].includes(node.type)),
    hasContent: nodes.length > 1,
  }
}

function parseDateLine(text = '', label = '') {
  const pattern = new RegExp(`${label}\\s*[:：-]?\\s*([0-3]?\\d[\\/.-][0-1]?\\d[\\/.-]\\d{2,4})`, 'i')
  return text.match(pattern)?.[1] || ''
}

function parseSimpleField(text = '', labels = []) {
  for (const label of labels) {
    const pattern = new RegExp(`${label}\\s*[:：-]?\\s*([^\\n]+)`, 'i')
    const found = text.match(pattern)?.[1]?.trim()
    if (found) return found
  }
  return ''
}

function parsePartiesFromText(text = '') {
  const lines = String(text || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  const parties = []
  lines.forEach((line) => {
    const match = line.match(/^(demandante|actor|demandado|tercerista|interviniente|querellante|querellado|abogado|abogada|apoderado|apoderada|patrocinante|compareciente|representante)\s*[:：-]\s*(.+)$/i)
    if (!match) return
    const role = match[1]
    const rawNames = match[2]
      .split(/;|,|\by\b/i)
      .map((item) => normalizeParticipantLabel(item))
      .filter(Boolean)

    rawNames.forEach((name) => {
      parties.push({
        role: role.toLowerCase(),
        name,
        rut: '',
        proceduralRole: role,
      })
    })
  })
  return parties
}

function normalizeSearchText(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function collapseWhitespace(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function sanitizeVisibleText(value = '') {
  return collapseWhitespace(String(value || '').replace(/ /g, ' '))
}

function normalizeForComparison(value = '') {
  return normalizeSearchText(sanitizeVisibleText(value))
}


const LAWYER_FULL_NAME = 'Mario Javier Rodríguez Ardiles'
const LAWYER_NAME_TOKENS = ['mario', 'javier', 'rodriguez', 'ardiles']
const DEFAULT_PJUD_SUBFOLDERS = [
  'Ebook',
  'Acta de entrevista cliente',
  'Documento',
  'Absolución de posiciones',
  'Jurisprudencia',
  'Escritos',
  'Resoluciones',
  'Pruebas',
  'Trazabilidad',
  PJUD_IMPORTED_CONTENT_LABEL,
]

const PROCEDURAL_ROLE_PRIORITY = [
  'demandante',
  'demandado',
  'querellante',
  'querellado',
  'denunciante',
  'imputado',
  'requerente',
  'requerido',
  'tercero',
]

const PROCEDURAL_ROLE_LABELS = {
  demandante: 'Demandante',
  actor: 'Demandante',
  demandado: 'Demandado',
  querellante: 'Querellante',
  querellado: 'Querellado',
  denunciante: 'Denunciante',
  imputado: 'Imputado',
  requerente: 'Requirente',
  requerido: 'Requerido',
  tercerista: 'Tercero',
  tercero: 'Tercero',
  interviniente: 'Interviniente',
}

function canonicalSheetName(value = '') {
  const normalized = normalizeForComparison(value)
  if (normalized.includes('corte suprema')) return 'Corte Suprema'
  if (normalized.includes('corte apelaciones') || normalized.includes('corte de apelaciones')) return 'Corte Apelaciones'
  if (normalized.includes('civil')) return 'Civil'
  if (normalized.includes('laboral')) return 'Laboral'
  if (normalized.includes('penal')) return 'Penal'
  if (normalized.includes('cobranza')) return 'Cobranza'
  if (normalized.includes('familia')) return 'Familia'
  return ''
}

const PJUD_MIS_CAUSAS_SHEETS = {
  'Corte Suprema': {
    materia: 'Corte Suprema',
    required: ['rol', 'era'],
    aliases: {
      rol: ['rol'],
      era: ['era'],
      fechaIngreso: ['fecha ingreso', 'fecha ingreso causa'],
      caratulado: ['caratulado', 'caratula', 'carátula'],
      estadoCausa: ['estado causa', 'estado'],
      institucion: ['institucion', 'institución'],
    },
    dedupeKey: (row) => ['suprema', row.rol, row.era].map(normalizeForComparison).join('|'),
  },
  'Corte Apelaciones': {
    materia: 'Corte Apelaciones',
    required: ['corte', 'rol', 'era'],
    aliases: {
      rol: ['rol'],
      era: ['era'],
      corte: ['corte'],
      fechaIngreso: ['fecha ingreso', 'fecha ingreso causa'],
      ubicacion: ['ubicacion', 'ubicación'],
      fechaUbicacion: ['fecha ubicacion', 'fecha ubicación'],
      caratulado: ['caratulado', 'caratula', 'carátula'],
      estadoProcesal: ['estado procesal', 'estado'],
      institucion: ['institucion', 'institución'],
    },
    dedupeKey: (row) => ['apelaciones', row.corte, row.rol, row.era].map(normalizeForComparison).join('|'),
  },
  Civil: {
    materia: 'Civil',
    required: ['tribunal', 'rol'],
    aliases: {
      rol: ['rol', 'rol/rit', 'rol rit', 'rol causa', 'rol causa / rit'],
      tribunal: ['tribunal'],
      fechaIngreso: ['fecha ingreso', 'fecha ingreso causa'],
      caratulado: ['caratulado', 'caratula', 'carátula'],
      estadoCausa: ['estado causa', 'estado'],
      institucion: ['institucion', 'institución'],
    },
    dedupeKey: (row) => buildPjudCaseDedupeKey(row, 'Civil'),
  },
  Laboral: {
    materia: 'Laboral',
    required: ['tribunal', 'rol'],
    aliases: {
      rol: ['rol', 'rol/rit', 'rol rit', 'rol causa', 'rol causa / rit'],
      tribunal: ['tribunal'],
      fechaIngreso: ['fecha ingreso', 'fecha ingreso causa'],
      caratulado: ['caratulado', 'caratula', 'carátula'],
      estadoCausa: ['estado causa', 'estado'],
      institucion: ['institucion', 'institución'],
    },
    dedupeKey: (row) => buildPjudCaseDedupeKey(row, 'Laboral'),
  },
  Penal: {
    materia: 'Penal',
    required: ['tribunal', 'rit', 'ruc'],
    aliases: {
      tipoCausa: ['tipo causa', 'tipo de causa'],
      rit: ['rit'],
      ruc: ['ruc'],
      tribunal: ['tribunal'],
      fechaIngreso: ['fecha ingreso', 'fecha ingreso causa'],
      caratulado: ['caratulado', 'caratula', 'carátula'],
      estadoCausa: ['estado causa', 'estado'],
      institucion: ['institucion', 'institución'],
    },
    dedupeKey: (row) => buildPjudCaseDedupeKey({
      ...row,
      rol: row.rol || row.rit || row.ruc,
    }, 'Penal'),
  },
  Cobranza: {
    materia: 'Cobranza',
    required: ['tribunal', 'rol'],
    aliases: {
      rol: ['rol', 'rol/rit', 'rol rit', 'rol causa', 'rol causa / rit'],
      tribunal: ['tribunal'],
      fechaIngreso: ['fecha ingreso', 'fecha ingreso causa'],
      caratulado: ['caratulado', 'caratula', 'carátula'],
      institucion: ['institucion', 'institución'],
    },
    dedupeKey: (row) => buildPjudCaseDedupeKey(row, 'Cobranza'),
  },
  Familia: {
    materia: 'Familia',
    required: ['tribunal', 'rit'],
    aliases: {
      rit: ['rit'],
      tribunal: ['tribunal'],
      caratulado: ['caratulado', 'caratula', 'carátula'],
      fechaIngreso: ['fecha ingreso', 'fecha ingreso causa'],
      estadoCausa: ['estado causa', 'estado'],
      institucion: ['institucion', 'institución'],
    },
    dedupeKey: (row) => buildPjudCaseDedupeKey({
      ...row,
      rol: row.rol || row.rit,
    }, 'Familia'),
  },
}

function containsNamedParticipant(text = '', participant = '') {
  const haystack = normalizeSearchText(text)
  const needle = normalizeSearchText(participant)
  if (!needle) return false
  return haystack.includes(needle)
}

function buildHeaderLookup(headers = []) {
  return new Map(headers.map((header) => [normalizeForComparison(header), header]))
}

function normalizePjudRol(value = '') {
  const raw = sanitizeVisibleText(value)
  if (!raw) return ''
  const compact = raw.replace(/\s+/g, ' ').trim()
  const directRol = compact.match(/[A-Z]{1,4}-\d{1,6}-\d{2,4}/i)
  if (directRol) return directRol[0].toUpperCase()
  return compact.toUpperCase()
}

function buildPjudCaseDedupeKey(row = {}, materia = '') {
  const tribunal = row.tribunal || row.corte || ''
  const rol = normalizePjudRol(row.rol)
  if (rol) return [normalizeForComparison(tribunal), normalizeForComparison(rol)].join('|')
  const fallbackIdentity = row.rit || row.ruc || row.caratulado || ''
  return [normalizeForComparison(tribunal), normalizeForComparison(fallbackIdentity), normalizeForComparison(materia)].join('|')
}

function resolveHeaderName(headerLookup = new Map(), aliases = []) {
  for (const alias of aliases) {
    const normalized = normalizeForComparison(alias)
    if (headerLookup.has(normalized)) return headerLookup.get(normalized)
  }
  return ''
}

function toSheetJsonRows(XLSX, sheet) {
  return XLSX.utils.sheet_to_json(sheet, {
    defval: '',
    raw: false,
    blankrows: false,
  })
}

function parseFlexibleDate(value = '') {
  if (value == null || value === '') return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)

  const raw = sanitizeVisibleText(value)
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  const match = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/)
  if (match) {
    const day = Number(match[1])
    const month = Number(match[2])
    let year = Number(match[3])
    if (year < 100) year += year >= 70 ? 1900 : 2000
    const date = new Date(Date.UTC(year, month - 1, day))
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10)
  }

  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  return ''
}

function buildComparableRowSignature(row = {}) {
  return [
    row.materia,
    row.corte,
    row.tribunal,
    row.rol,
    row.era,
    row.rit,
    row.ruc,
    row.tipoCausa,
    row.fechaIngreso,
    row.fechaUbicacion,
    row.caratulado,
    row.estadoCausa,
    row.estadoProcesal,
    row.ubicacion,
    row.institucion,
  ].map(normalizeForComparison).join('|')
}

function isStructurallyValidPjudRow(row = {}, config = {}) {
  const requiredHits = (config.required || []).every((field) => normalizeForComparison(row[field]))
  if (requiredHits) return true
  return [row.rol, row.rit, row.ruc, row.caratulado, row.tribunal, row.corte].some((value) => normalizeForComparison(value))
}

function getStatePriority(row = {}) {
  const value = normalizeForComparison(row.estadoProcesal || row.estadoCausa)
  if (!value) return 0
  if (/(tramit|vigente|pendiente|en curso|activo|abierta)/.test(value)) return 4
  if (/(fallad|terminad|archivad|suspendid)/.test(value)) return 2
  if (/(concluid|ejecutoriad|cerrad)/.test(value)) return 1
  return 3
}

function pickPreferredPjudRow(current = {}, candidate = {}) {
  if (!current || !Object.keys(current).length) return candidate
  const currentPriority = getStatePriority(current)
  const candidatePriority = getStatePriority(candidate)
  if (candidatePriority !== currentPriority) return candidatePriority > currentPriority ? candidate : current

  const currentDate = parseFlexibleDate(current.fechaUbicacion || current.fechaIngreso)
  const candidateDate = parseFlexibleDate(candidate.fechaUbicacion || candidate.fechaIngreso)
  if (candidateDate && currentDate && candidateDate !== currentDate) return candidateDate > currentDate ? candidate : current
  if (candidateDate && !currentDate) return candidate
  return current
}

function mapPjudSheetRow(rawRow = {}, config = {}, headerLookup = new Map()) {
  const mapped = {
    materia: config.materia,
    tribunal: '',
    corte: '',
    rol: '',
    era: '',
    rit: '',
    ruc: '',
    tipoCausa: '',
    fechaIngreso: '',
    fechaUbicacion: '',
    caratulado: '',
    estadoCausa: '',
    estadoProcesal: '',
    ubicacion: '',
    institucion: '',
    source: 'pjud_excel_mis_causas',
    sourceConfidence: 'high',
  }

  Object.entries(config.aliases || {}).forEach(([field, aliases]) => {
    const headerName = resolveHeaderName(headerLookup, aliases)
    if (!headerName) return
    const rawValue = rawRow[headerName]
    if (field === 'fechaIngreso' || field === 'fechaUbicacion') {
      mapped[field] = parseFlexibleDate(rawValue)
      mapped[`${field}Original`] = sanitizeVisibleText(rawValue)
      return
    }
    mapped[field] = sanitizeVisibleText(rawValue)
  })

  mapped.caratulado = normalizeCaratula(mapped.caratulado)
  mapped.rol = normalizePjudRol(mapped.rol || mapped.rit || '')
  return mapped
}

export async function parsePjudMisCausasWorkbook(file, XLSX, options = {}) {
  if (!file) throw new Error('Debes seleccionar un archivo Excel exportado desde Mis Causas.')
  if (!XLSX?.read) throw new Error('No fue posible cargar el parser XLSX en el navegador.')
  const {
    includeConsolidatedCases = true,
    includeRawRows = false,
    includeInvalidDetails = false,
    previewLimit = 50,
  } = options || {}

  const fileName = String(file.name || 'mis-causas.xlsx')
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheetNames = workbook.SheetNames || []
  const detectedSheets = []
  const rawRows = []
  const invalidRows = []
  const countsBySheet = {}

  sheetNames.forEach((sheetName) => {
    const canonical = canonicalSheetName(sheetName)
    if (!canonical) return
    const config = PJUD_MIS_CAUSAS_SHEETS[canonical]
    const sheet = workbook.Sheets[sheetName]
    if (!config || !sheet) return

    detectedSheets.push(canonical)
    const rows = toSheetJsonRows(XLSX, sheet)
    const headerLookup = buildHeaderLookup(Object.keys(rows[0] || {}))
    countsBySheet[canonical] = rows.length

    rows.forEach((rawRow, index) => {
      const mapped = mapPjudSheetRow(rawRow, config, headerLookup)
      if (!isStructurallyValidPjudRow(mapped, config)) {
        invalidRows.push({ sheetName: canonical, rowNumber: index + 2, raw: rawRow })
        return
      }
      rawRows.push({
        ...mapped,
        sheetName: canonical,
        rowNumber: index + 2,
        dedupeKey: config.dedupeKey(mapped),
        rowSignature: buildComparableRowSignature(mapped),
        raw: rawRow,
      })
    })
  })

  const grouped = new Map()
  rawRows.forEach((row) => {
    const existing = grouped.get(row.dedupeKey)
    if (!existing) {
      grouped.set(row.dedupeKey, {
        dedupeKey: row.dedupeKey,
        materia: row.materia,
        sheetName: row.sheetName,
        primary: row,
        signatures: new Set([row.rowSignature]),
        variants: [row],
        states: new Set([normalizeForComparison(row.estadoProcesal || row.estadoCausa)].filter(Boolean)),
      })
      return
    }

    if (!existing.signatures.has(row.rowSignature)) {
      existing.signatures.add(row.rowSignature)
      existing.variants.push(row)
      const stateValue = normalizeForComparison(row.estadoProcesal || row.estadoCausa)
      if (stateValue) existing.states.add(stateValue)
    }
    existing.primary = pickPreferredPjudRow(existing.primary, row)
  })

  const consolidatedCases = [...grouped.values()].map((entry) => {
    const primary = entry.primary
    const variants = entry.variants
    const preferredActive = variants.find((item) => getStatePriority(item) >= 4)
    const preferredEstado = preferredActive?.estadoProcesal || preferredActive?.estadoCausa || primary.estadoProcesal || primary.estadoCausa || ''

    return {
      ...primary,
      estadoProcesal: primary.estadoProcesal || (primary.materia === 'Corte Apelaciones' ? preferredEstado : ''),
      estadoCausa: primary.estadoCausa || (primary.materia !== 'Corte Apelaciones' ? preferredEstado : ''),
      consolidatedFrom: variants.length,
      conflictStates: [...entry.states],
      pjudCaseKey: entry.dedupeKey,
      basic: {
        rol: primary.rol,
        rit: primary.rit,
        tribunal: primary.tribunal || primary.corte,
        procedimiento: primary.tipoCausa,
        materia: primary.materia,
        estadoProcesal: primary.estadoProcesal || primary.estadoCausa,
        fechaIngreso: primary.fechaIngreso,
        caratula: primary.caratulado,
        link: '',
        importedAt: new Date().toISOString(),
      },
      representedClientName: 'Cliente por inferir desde PJUD',
      representedClientRole: primary.estadoProcesal ? 'Demandante' : 'Por definir',
      representedByLawyer: true,
      parties: [],
      demandantes: [],
      demandados: [],
      movements: [],
      documents: [],
      ebook: null,
      rawText: '',
      importSource: 'mis_causas_excel',
    }
  })

  const countsByMateria = consolidatedCases.reduce((acc, item) => {
    acc[item.materia] = (acc[item.materia] || 0) + 1
    return acc
  }, {})

  return {
    source: 'pjud_excel_mis_causas',
    sourceConfidence: 'high',
    mode: 'mis_causas_excel',
    fileName,
    sheetsDetected: detectedSheets,
    countsBySheet,
    rowsProcessed: rawRows.length,
    invalidRows: invalidRows.length,
    rawRows: includeRawRows ? rawRows : [],
    invalidRowDetails: includeInvalidDetails ? invalidRows.slice(0, 200) : [],
    consolidatedCount: consolidatedCases.length,
    countsByMateria,
    consolidatedCases: includeConsolidatedCases ? consolidatedCases : [],
    previewCases: consolidatedCases.slice(0, Math.max(1, Number(previewLimit) || 1)),
  }
}

function proceduralRoleRank(value = '') {
  const normalized = normalizeForComparison(value)
  const index = PROCEDURAL_ROLE_PRIORITY.findIndex((item) => normalized.includes(item))
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER
}

function normalizeProceduralRole(value = '') {
  const normalized = normalizeForComparison(value)
  const direct = Object.keys(PROCEDURAL_ROLE_LABELS).find((key) => normalized.includes(key))
  return direct ? PROCEDURAL_ROLE_LABELS[direct] : (collapseWhitespace(value) || 'Por definir')
}

function detectLawyerMention(text = '') {
  const normalized = normalizeForComparison(text)
  if (!normalized) return false
  const fullName = normalizeForComparison(LAWYER_FULL_NAME)
  if (normalized.includes(fullName)) return true
  return LAWYER_NAME_TOKENS.every((token) => normalized.includes(token))
}

function inferRepresentedClient({ parties = [], rawText = '', fallbackName = '' } = {}) {
  const normalizedFallback = normalizeParticipantLabel(fallbackName)
  const sortedParties = [...(parties || [])].sort((a, b) => proceduralRoleRank(a.role || a.proceduralRole) - proceduralRoleRank(b.role || b.proceduralRole))
  const nonLawyerParties = sortedParties.filter((party) => !/abogad|patrocinante|apoderad/i.test(party.role || party.proceduralRole || ''))
  const preferred = nonLawyerParties[0] || sortedParties[0] || null
  const inferredName = normalizeParticipantLabel(preferred?.name || normalizedFallback || 'Cliente pendiente por confirmar')
  const inferredRole = normalizeProceduralRole(preferred?.proceduralRole || preferred?.role || '')

  const roleFromText = (() => {
    const lines = String(rawText || '').split(/\n+/).map((line) => line.trim()).filter(Boolean)
    const roleLine = lines.find((line) => /(calidad procesal|representa a|comparece por|en representacion de)/i.test(line))
    if (!roleLine) return ''
    const match = roleLine.match(/(demandante|demandado|querellante|querellado|denunciante|imputado|requerente|requerido|tercero|interviniente)/i)
    return match?.[1] || ''
  })()

  const normalizedRole = normalizeProceduralRole(roleFromText || inferredRole)
  const avoidsTerceroDefault = normalizedRole.toLowerCase() === 'tercero' && sortedParties.some((party) => proceduralRoleRank(party.role) < PROCEDURAL_ROLE_PRIORITY.indexOf('tercero'))
  const finalRole = avoidsTerceroDefault
    ? normalizeProceduralRole(sortedParties.find((party) => proceduralRoleRank(party.role) < PROCEDURAL_ROLE_PRIORITY.indexOf('tercero'))?.role || inferredRole)
    : normalizedRole

  return {
    representedClientName: inferredName,
    representedClientRole: finalRole || 'Por definir',
    representedByLawyer: detectLawyerMention(rawText),
  }
}

function materializePjudDigitalFolder(detail = {}, importData = {}) {
  const next = ensureCauseStorage(detail)
  const tribunal = importData.basic?.tribunal || importData.tribunal || next.tribunal || 'Tribunal pendiente'
  const materia = importData.basic?.materia || importData.materia || next.materia || 'Materia judicial'
  const rol = importData.basic?.rol || importData.rol || next.rol || 'Rol pendiente'
  const rit = importData.basic?.rit || importData.rit || next.rit || ''
  const ruc = importData.ruc || next.ruc || ''
  const folderName = `${rol}${rit ? ` / ${rit}` : ''}${ruc ? ` / ${ruc}` : ''}`
  next.expedienteDigital = next.expedienteDigital || {}
  next.expedienteDigital.cliente = next.expedienteDigital.cliente || {}
  next.expedienteDigital.cliente.tribunal = {
    editable: true,
    nuevo: true,
    materia,
    ruta: ['Kárdex', 'Expedientes digitales de juicios', 'Materia judicial', tribunal, folderName, 'Contenido interno', PJUD_IMPORTED_CONTENT_LABEL],
    carpetas: [{
      tribunal,
      materia,
      editable: 'Sí, el nombre del tribunal puede sobrescribirse o editarse.',
      causas: [{
        nombre: `${folderName} · ${next.caratula || importData.basic?.caratula || 'Causa PJUD'}`,
        subcarpetas: [...DEFAULT_PJUD_SUBFOLDERS],
      }],
    }],
  }
  return next
}

function splitJudicialBatchBlocks(rawText = '') {
  const normalized = String(rawText || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!normalized) return []

  const explicitBlocks = normalized
    .split(/\n(?=(?:=|-){3,}\s*(?:causa|expediente|proceso)?)/i)
    .map((block) => block.replace(/^(?:=|-){3,}\s*(?:causa|expediente|proceso)?\s*(?:=|-)*\s*/i, '').trim())
    .filter(Boolean)

  if (explicitBlocks.length > 1) return explicitBlocks

  const lines = normalized.split('\n')
  const blocks = []
  let current = []

  const flush = () => {
    const joined = current.join('\n').trim()
    if (joined) blocks.push(joined)
    current = []
  }

  lines.forEach((line) => {
    const trimmed = line.trim()
    const startsNewCase = /^(?:causa|expediente|proceso)\b/i.test(trimmed) && current.length > 0
    if (startsNewCase) flush()
    current.push(line)
  })
  flush()

  if (blocks.length > 1) return blocks

  return normalized
    .split(/\n\s*\n(?=(?:caratula|carátula|rol|rit|tribunal|causa)\s*[:：-])/i)
    .map((block) => block.trim())
    .filter(Boolean)
}

export function parseJudicialImportInput({ url = '', rol = '', rit = '', tribunal = '', rawText = '' } = {}) {
  const sourceUrl = String(url || '').trim()
  const raw = String(rawText || '').trim()
  const parties = parsePartiesFromText(raw)
  const demandantes = parties.filter((party) => ['demandante', 'actor', 'querellante'].includes(party.role)).map((party) => party.name)
  const demandados = parties.filter((party) => ['demandado', 'querellado'].includes(party.role)).map((party) => party.name)
  const parsedRol = normalizeParticipantLabel(rol || parseSimpleField(raw, ['rol']))
  const parsedRit = normalizeParticipantLabel(rit || parseSimpleField(raw, ['rit']))
  const parsedTribunal = normalizeParticipantLabel(tribunal || parseSimpleField(raw, ['tribunal']))
  const materia = normalizeParticipantLabel(parseSimpleField(raw, ['materia', 'asunto']))
  const submateria = normalizeParticipantLabel(parseSimpleField(raw, ['submateria']))
  const procedimiento = normalizeParticipantLabel(parseSimpleField(raw, ['procedimiento', 'tipo de causa']))
  const estadoProcesal = normalizeParticipantLabel(parseSimpleField(raw, ['estado procesal', 'estado']))
  const estadoCausa = normalizeParticipantLabel(parseSimpleField(raw, ['estado causa']))
  const fechaIngreso = parseDateLine(raw, 'fecha de ingreso')
  const fechaUbicacion = parseDateLine(raw, 'fecha de ubicacion') || parseDateLine(raw, 'fecha de ubicación')
  const ubicacion = normalizeParticipantLabel(parseSimpleField(raw, ['ubicacion', 'ubicación']))
  const institucion = normalizeParticipantLabel(parseSimpleField(raw, ['institucion', 'institución']))
  const corte = normalizeParticipantLabel(parseSimpleField(raw, ['corte']))
  const era = normalizeParticipantLabel(parseSimpleField(raw, ['era']))
  const ruc = normalizeParticipantLabel(parseSimpleField(raw, ['ruc']))
  const tipoCausa = normalizeParticipantLabel(parseSimpleField(raw, ['tipo de causa', 'tipo causa'])) || procedimiento
  const caratulaFromText = normalizeCaratula(parseSimpleField(raw, ['caratula', 'carátula']))
  const caratula = buildCaratula({ demandantes, demandados, fallback: caratulaFromText })

  const movementLines = String(raw || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /^movimiento\s*[:：-]/i.test(line) || /^actuaci[oó]n\s*[:：-]/i.test(line) || /^resoluci[oó]n\s*[:：-]/i.test(line))

  const movements = movementLines.map((line, index) => {
    const body = line.replace(/^[^:：-]+[:：-]\s*/i, '')
    return {
      id: `mov-${Date.now()}-${index}`,
      date: new Date().toISOString().slice(0, 10),
      title: body.split('·')[0] || body,
      detail: body,
      origin: 'Poder Judicial',
      importedAt: new Date().toISOString(),
      hash: quickHash(body),
      manuallyEdited: false,
    }
  })

  const docLines = String(raw || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /^documento\s*[:：-]/i.test(line) || /^archivo\s*[:：-]/i.test(line) || /^ebook\s*[:：-]/i.test(line) || /^adjunto\s*[:：-]/i.test(line) || /^anexo\s*[:：-]/i.test(line))

  const documents = docLines.map((line, index) => {
    const body = line.replace(/^[^:：-]+[:：-]\s*/i, '')
    const extractedUrl = extractFirstUrl(body)
    const cleanBody = normalizeParticipantLabel(body.replace(extractedUrl, '').replace(/\s*[|·-]\s*$/, ''))
    const name = deriveImportedDocumentName(cleanBody, extractedUrl, index)
    const category = /^ebook/i.test(line) ? 'Ebook' : inferCategory(name)
    return {
      id: `import-doc-${Date.now()}-${index}`,
      name,
      category,
      type: inferMimeFromName(name),
      size: 0,
      observation: 'Documento incorporado desde flujo semiautomático de importación.',
      origin: 'Poder Judicial',
      destinationModule: 'Causas',
      destinationContainer: category === 'Ebook' ? 'ebook' : (category === 'Otros antecedentes' ? 'asociados' : containerIdForCategory(category)),
      content: buildTextDataUrl(`Documento registrado durante la importación judicial.\n\nNombre: ${name}\nOrigen: Poder Judicial\nFuente: ${sourceUrl || 'manual'}\n`),
      hash: quickHash(`${name}|${sourceUrl}|${index}`),
      sourceUrl: extractedUrl,
      sourcePageUrl: sourceUrl || extractedUrl,
      downloadStrategy: extractedUrl ? 'remote' : 'stored',
    }
  })

  const explicitEbookSourceUrl = documents.find((documentRecord) => documentRecord.category === 'Ebook')?.sourceUrl || ''
  const ebookSourcePageUrl = sourceUrl || extractFirstUrl(raw) || ''
  const ebook = documents.find((documentRecord) => documentRecord.category === 'Ebook') || {
    name: `ebook-${slugId(caratula || parsedRol || 'causa')}.txt`,
    category: 'Ebook',
    type: 'text/plain;charset=utf-8',
    size: 0,
    observation: 'Placeholder generado porque no existe descarga directa automática en esta etapa.',
    origin: sourceUrl ? 'Poder Judicial (semiautomático)' : 'Importación manual asistida',
    destinationModule: 'Causas',
    destinationContainer: 'ebook',
    content: buildTextDataUrl([
      'Ebook de causa generado en modo semiautomático.',
      '',
      `Carátula: ${caratula || 'Pendiente'}`,
      `Rol: ${parsedRol || 'Pendiente'}`,
      `RIT: ${parsedRit || 'Pendiente'}`,
      `Tribunal: ${parsedTribunal || 'Pendiente'}`,
      `Fuente: ${sourceUrl || 'Datos ingresados manualmente'}`,
      '',
      'Para reemplazar este archivo por el ebook oficial, use la acción “Cargar archivo” en la sección Ebook.'
    ].join('\n')),
    hash: quickHash(`ebook|${caratula}|${parsedRol}|${sourceUrl}`),
    sourceUrl: explicitEbookSourceUrl,
    sourcePageUrl: ebookSourcePageUrl,
    downloadStrategy: explicitEbookSourceUrl || ebookSourcePageUrl ? 'remote' : 'stored',
  }

  const representedInference = inferRepresentedClient({
    parties,
    rawText: raw,
    fallbackName: demandantes[0] || demandados[0] || '',
  })

  return {
    mode: sourceUrl ? 'semiautomatico' : 'manual',
    sourceUrl,
    corte,
    era,
    ruc,
    tipoCausa,
    submateria,
    estadoCausa,
    estadoProcesal,
    ubicacion,
    fechaUbicacion,
    institucion,
    basic: {
      rol: parsedRol,
      rit: parsedRit,
      tribunal: parsedTribunal,
      procedimiento,
      materia,
      estadoProcesal,
      fechaIngreso,
      caratula,
      link: sourceUrl,
      importedAt: new Date().toISOString(),
    },
    representedClientName: representedInference.representedClientName,
    representedClientRole: representedInference.representedClientRole,
    representedByLawyer: representedInference.representedByLawyer,
    parties,
    demandantes,
    demandados,
    movements,
    documents,
    ebook,
    rawText: raw,
  }
}

export function parseJudicialBatchImportInput({ rawText = '', actorName = 'Usuario autenticado' } = {}) {
  const blocks = splitJudicialBatchBlocks(rawText)

  return blocks
    .map((block, index) => {
      const parsedUrl = extractFirstUrl(block)
      const parsedRol = parseSimpleField(block, ['rol'])
      const parsedRit = parseSimpleField(block, ['rit'])
      const parsedTribunal = parseSimpleField(block, ['tribunal'])
      const importData = parseJudicialImportInput({
        url: parsedUrl,
        rol: parsedRol,
        rit: parsedRit,
        tribunal: parsedTribunal,
        rawText: block,
      })

      const hasMinimumIdentity = Boolean(importData.basic?.rol || importData.basic?.rit || importData.basic?.caratula || importData.basic?.tribunal)
      if (!hasMinimumIdentity) return null

      return {
        ...importData,
        batchMeta: {
          actorName,
          blockIndex: index,
          matchedByName: containsNamedParticipant(block, actorName),
        },
      }
    })
    .filter(Boolean)
}

export function findDuplicateCase(cases = [], importData = {}) {
  const basic = importData.basic || {}
  const normalizedLink = normalizeForComparison(basic.link || '')
  const normalizedRol = normalizeForComparison(basic.rol || '')
  const normalizedRit = normalizeForComparison(basic.rit || '')
  const normalizedTribunal = normalizeForComparison(basic.tribunal || '')
  const normalizedCaratula = normalizeForComparison(basic.caratula || '')
  const normalizedPjudKey = normalizeForComparison(importData.pjudCaseKey || basic.pjudCaseKey || '')

  return cases.find((item) => {
    const link = normalizeForComparison(item.poderJudicial?.link || item.tribunalData?.poderJudicial || '')
    const rol = normalizeForComparison(item.rol || '')
    const rit = normalizeForComparison(item.rit || '')
    const tribunal = normalizeForComparison(item.tribunal || '')
    const caratula = normalizeForComparison(item.caratula || '')
    const pjudCaseKey = normalizeForComparison(item.pjudCaseKey || item.pjud_case_key || '')

    if (normalizedPjudKey && pjudCaseKey && normalizedPjudKey === pjudCaseKey) return true
    if (normalizedLink && link && normalizedLink === link) return true
    if (normalizedRol && rol && normalizedRol === rol && normalizedTribunal && tribunal === normalizedTribunal) return true
    if (normalizedRit && rit && normalizedRit === rit && normalizedTribunal && tribunal === normalizedTribunal) return true
    return Boolean(normalizedCaratula && caratula && normalizedCaratula === caratula && normalizedTribunal && tribunal === normalizedTribunal)
  }) || null
}

export function applyImportToDetail(detail = {}, importData = {}, options = {}) {
  const next = ensureCauseStorage(detail)
  const now = new Date().toISOString()
  const operationId = `imp-${Date.now()}`
  const previousSnapshot = structuredClone(next)

  next.caratula = importData.basic?.caratula || importData.caratulado || next.caratula
  next.rol = importData.basic?.rol || importData.rol || next.rol
  next.rit = importData.basic?.rit || importData.rit || next.rit
  next.ruc = importData.ruc || next.ruc
  next.era = importData.era || next.era
  next.corte = importData.corte || next.corte
  next.tribunal = importData.basic?.tribunal || importData.tribunal || next.tribunal
  next.procedimiento = importData.basic?.procedimiento || importData.tipoCausa || next.procedimiento
  next.tipoCausa = importData.tipoCausa || next.tipoCausa
  next.materia = importData.basic?.materia || importData.materia || next.materia
  next.submateria = importData.submateria || next.submateria
  next.estadoProcesal = importData.basic?.estadoProcesal || importData.estadoProcesal || importData.estadoCausa || next.estadoProcesal
  next.estadoCausa = importData.estadoCausa || next.estadoCausa
  next.ubicacion = importData.ubicacion || next.ubicacion
  next.fechaUbicacion = importData.fechaUbicacion || next.fechaUbicacion
  next.institucion = importData.institucion || next.institucion
  next.fechaInicio = importData.basic?.fechaIngreso || importData.fechaIngreso || next.fechaInicio
  next.source = importData.source || next.source || 'pjud_excel_mis_causas'
  next.sourceConfidence = importData.sourceConfidence || next.sourceConfidence || 'high'
  next.importBatchId = options.importBatchId || importData.importBatchId || next.importBatchId || null
  next.pjudCaseKey = importData.pjudCaseKey || next.pjudCaseKey || ''
  const representedInference = inferRepresentedClient({
    parties: importData.parties || [],
    rawText: importData.rawText || '',
    fallbackName: options.primaryClientName || importData.representedClientName || next.cliente,
  })
  next.cliente = options.primaryClientName || importData.representedClientName || representedInference.representedClientName || next.cliente
  next.representedClientName = next.cliente
  next.clientProceduralRole = importData.representedClientRole || representedInference.representedClientRole || next.clientProceduralRole || 'Por definir'
  next.representedByLawyer = importData.representedByLawyer ?? representedInference.representedByLawyer
  next.selectedClientParties = options.selectedClientParties || (next.cliente ? [next.cliente] : [])
  next.importMeta = {
    mode: importData.mode || 'manual',
    status: 'Importada desde Poder Judicial',
    importedAt: importData.basic?.importedAt || now,
    lastSyncAt: importData.basic?.importedAt || now,
  }
  next.poderJudicial = {
    link: importData.basic?.link || next.poderJudicial?.link || '',
    sourceType: importData.mode || 'manual',
    importedAt: importData.basic?.importedAt || now,
    lastSyncAt: importData.basic?.importedAt || now,
    notes: importData.mode === 'mis_causas_excel'
      ? 'Importación desde Excel oficial Mis Causas del usuario autenticado.'
      : (importData.rawText ? 'Importación semiautomática con texto analizado por el usuario.' : 'Importación creada desde referencia judicial manual.'),
  }

  next.partes = (importData.parties || []).length
    ? importData.parties.map((party) => ({ rol: party.proceduralRole, nombre: party.name, detalle: party.rut ? `RUT ${party.rut}` : 'Detectado durante importación judicial.' }))
    : next.partes

  const importedMovementIds = []
  ;(importData.movements || []).forEach((movement) => {
    const exists = (next.movements || []).some((item) => item.hash === movement.hash)
    if (!exists) {
      next.movements.unshift(movement)
      importedMovementIds.push(movement.id)
    }
  })

  const importedDocIds = []
  const primaryRole = options.selectedClientParties?.[0] || options.primaryClientName || next.cliente || 'Por definir'
  const summaryBody = [
    'Resumen materializado de importación PJUD',
    '',
    `Carátula: ${importData.basic?.caratula || importData.caratulado || next.caratula || 'Pendiente'}`,
    `Rol: ${importData.basic?.rol || importData.rol || next.rol || 'Pendiente'}`,
    `RIT: ${importData.basic?.rit || importData.rit || next.rit || 'Pendiente'}`,
    `RUC: ${importData.ruc || next.ruc || 'Pendiente'}`,
    `Tribunal: ${importData.basic?.tribunal || importData.tribunal || next.tribunal || 'Pendiente'}`,
    `Materia: ${importData.basic?.materia || importData.materia || next.materia || 'Pendiente'}`,
    `Estado causa: ${importData.estadoCausa || next.estadoCausa || 'Pendiente'}`,
    `Estado procesal: ${importData.basic?.estadoProcesal || importData.estadoProcesal || next.estadoProcesal || 'Pendiente'}`,
    `Cliente representado: ${options.primaryClientName || next.cliente || 'Pendiente'}`,
    `Calidad procesal: ${next.clientProceduralRole || primaryRole}`,
    `Ubicación en Kárdex: ${next.kardex?.grupo || next.grupo || 'Pendiente'}`,
    '',
    'Este documento deja evidencia útil de la importación cuando la fuente PJUD no entrega automáticamente todo el expediente completo.',
  ].join('\n')
  const summaryDocInput = {
    name: `resumen-pjud-${(importData.basic?.rol || importData.rol || `caso-${Date.now()}`).toString().replace(/[^\w.-]+/g, '-')}.txt`,
    category: PJUD_IMPORTED_CONTENT_LABEL,
    destinationContainer: 'importadosPjud',
    observation: 'Resumen automático de importación judicial para materializar contenido mínimo utilizable.',
    origin: 'Importación PJUD',
    placeholderText: summaryBody,
  }
  const allDocuments = [
    summaryDocInput,
    importData.ebook ? { ...importData.ebook, destinationContainer: 'importadosPjud', category: PJUD_IMPORTED_CONTENT_LABEL } : null,
    ...(importData.documents || [])
      .filter((documentRecord) => documentRecord.category !== 'Ebook')
      .map((documentRecord) => ({
        ...documentRecord,
        destinationContainer: 'importadosPjud',
        category: PJUD_IMPORTED_CONTENT_LABEL,
      })),
  ].filter(Boolean)
  allDocuments.forEach((documentRecord) => {
    const before = new Set((next.documents || []).map((item) => item.id))
    const updated = upsertDocument(next, { ...documentRecord, caseId: next.id, linkedClient: options.primaryClientName || next.cliente })
    next.documents = updated.documents
    next.documentContainers = updated.documentContainers
    next.ebookDocumentId = updated.ebookDocumentId
    const created = updated.documents.find((item) => !before.has(item.id) && item.hash === documentRecord.hash) || updated.documents.find((item) => item.hash === documentRecord.hash)
    if (created) importedDocIds.push(created.id)
  })

  materializePjudDigitalFolder(next, importData)

  console.info('[CAUSAS][IMPORTACIÓN PJUD] Materialización de expediente digital', {
    caseId: next.id,
    pjudCaseKey: next.pjudCaseKey || null,
    importedMovements: importedMovementIds.length,
    importedDocuments: importedDocIds.length,
    representedClientName: next.representedClientName || null,
    clientProceduralRole: next.clientProceduralRole || null,
    missingCoreFields: {
      caratula: !next.caratula,
      rol: !next.rol,
      tribunal: !next.tribunal,
      materia: !next.materia,
    },
  })

  next.syncHistory.unshift({
    id: `sync-${Date.now()}`,
    createdAt: now,
    source: 'Poder Judicial',
    mode: importData.mode || 'manual',
    result: importedMovementIds.length || importedDocIds.length ? 'Importación aplicada' : 'Importación sin novedades',
    notes: importData.rawText ? 'Se analizaron datos ingresados por el usuario.' : 'Se registró referencia judicial manual.',
    importedMovementIds,
    importedDocIds,
  })

  next.importOperations.unshift({
    id: operationId,
    createdAt: now,
    mode: options.operationMode || 'update',
    importedDocIds,
    importedMovementIds,
    previousSnapshot,
    selectedClientParties: options.selectedClientParties || [],
    createdNewCase: Boolean(options.createdNewCase),
    revertedAt: null,
  })

  return next
}

export function applyManualSync(detail = {}, { rawText = '', sourceUrl = '' } = {}) {
  const next = ensureCauseStorage(detail)
  const parsed = parseJudicialImportInput({ url: sourceUrl || next.poderJudicial?.link || '', rol: next.rol, rit: next.rit, tribunal: next.tribunal, rawText })
  const beforeMovementHashes = new Set((next.movements || []).map((item) => item.hash))
  const beforeDocHashes = new Set((next.documents || []).map((item) => item.hash))
  const updated = applyImportToDetail(next, parsed, {
    primaryClientName: next.cliente,
    selectedClientParties: next.selectedClientParties,
    operationMode: 'update',
    createdNewCase: false,
  })
  const newMovements = (updated.movements || []).filter((item) => !beforeMovementHashes.has(item.hash)).length
  const newDocs = (updated.documents || []).filter((item) => !beforeDocHashes.has(item.hash)).length
  updated.importMeta.lastSyncAt = new Date().toISOString()
  updated.poderJudicial.lastSyncAt = updated.importMeta.lastSyncAt
  updated.syncHistory.unshift({
    id: `sync-${Date.now()}-manual`,
    createdAt: updated.importMeta.lastSyncAt,
    source: 'Poder Judicial',
    mode: rawText ? 'semiautomatico' : 'manual',
    result: newMovements || newDocs ? `Se agregaron ${newMovements} movimientos y ${newDocs} documentos.` : 'Sin novedades detectables.',
    notes: rawText ? 'Actualización manual asistida con texto pegado por el usuario.' : 'No se incorporaron nuevos datos porque no se entregó texto adicional.',
    importedMovementIds: [],
    importedDocIds: [],
  })
  return updated
}

export function markManualEdit(detail = {}) {
  const next = ensureCauseStorage(detail)
  if (next.importOperations[0] && !next.importOperations[0].revertedAt) {
    next.importOperations[0].manualChangesAfterImport = true
  }
  return next
}

export function revertLastImport(detail = {}) {
  const next = ensureCauseStorage(detail)
  const operation = next.importOperations.find((item) => !item.revertedAt)
  if (!operation) {
    return { ok: false, reason: 'No existe una importación pendiente de revertir.' }
  }
  if (operation.manualChangesAfterImport) {
    return { ok: false, reason: 'Existen cambios manuales posteriores; solo se dejó preparada la reversión selectiva futura.' }
  }
  const restored = ensureCauseStorage(structuredClone(operation.previousSnapshot), next.id)
  const revertedAt = new Date().toISOString()
  restored.reversionLog.unshift({
    id: `rev-${Date.now()}`,
    createdAt: revertedAt,
    importId: operation.id,
    summary: `Revertida importación ${operation.id}.`,
    documentsAffected: operation.importedDocIds || [],
    movementsAffected: operation.importedMovementIds || [],
  })
  restored.importOperations = next.importOperations.map((item) => item.id === operation.id ? { ...item, revertedAt } : item)
  return { ok: true, detail: restored, operation }
}
