const WORKSPACE_KEY = 'alpha-causas-workspace-v4'

function safeParse(value, fallback) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export function loadWorkspace(storage = window.localStorage) {
  return safeParse(storage.getItem(WORKSPACE_KEY) || '{}', {})
}

export function saveWorkspace(workspace, storage = window.localStorage) {
  storage.setItem(WORKSPACE_KEY, JSON.stringify(workspace))
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
    const match = line.match(/^(demandante|actor|demandado|tercerista|interviniente|querellante|querellado)\s*[:：-]\s*(.+)$/i)
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
  const procedimiento = normalizeParticipantLabel(parseSimpleField(raw, ['procedimiento', 'tipo de causa']))
  const estadoProcesal = normalizeParticipantLabel(parseSimpleField(raw, ['estado procesal', 'estado']))
  const fechaIngreso = parseDateLine(raw, 'fecha de ingreso')
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
    .filter((line) => /^documento\s*[:：-]/i.test(line) || /^archivo\s*[:：-]/i.test(line) || /^ebook\s*[:：-]/i.test(line))

  const documents = docLines.map((line, index) => {
    const body = line.replace(/^[^:：-]+[:：-]\s*/i, '')
    const name = body.includes('.') ? body : `${body || `Documento ${index + 1}`}.txt`
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
    }
  })

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
  }

  return {
    mode: sourceUrl ? 'semiautomatico' : 'manual',
    sourceUrl,
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
    parties,
    demandantes,
    demandados,
    movements,
    documents,
    ebook,
    rawText: raw,
  }
}

export function findDuplicateCase(cases = [], importData = {}) {
  const basic = importData.basic || {}
  const normalizedLink = String(basic.link || '').trim().toLowerCase()
  const normalizedRol = String(basic.rol || '').trim().toLowerCase()
  const normalizedRit = String(basic.rit || '').trim().toLowerCase()
  const normalizedTribunal = String(basic.tribunal || '').trim().toLowerCase()
  const normalizedCaratula = String(basic.caratula || '').trim().toLowerCase()

  return cases.find((item) => {
    const link = String(item.poderJudicial?.link || item.tribunalData?.poderJudicial || '').trim().toLowerCase()
    const rol = String(item.rol || '').trim().toLowerCase()
    const rit = String(item.rit || '').trim().toLowerCase()
    const tribunal = String(item.tribunal || '').trim().toLowerCase()
    const caratula = String(item.caratula || '').trim().toLowerCase()

    if (normalizedLink && link && normalizedLink === link) return true
    if (normalizedRol && rol && normalizedRol === rol && normalizedTribunal && tribunal === normalizedTribunal) return true
    if (normalizedRit && rit && normalizedRit === rit && normalizedTribunal && tribunal === normalizedTribunal) return true
    if (normalizedRol && rol && normalizedRol === rol) return true
    if (normalizedRit && rit && normalizedRit === rit) return true
    return Boolean(normalizedCaratula && caratula && normalizedCaratula === caratula)
  }) || null
}

export function applyImportToDetail(detail = {}, importData = {}, options = {}) {
  const next = ensureCauseStorage(detail)
  const now = new Date().toISOString()
  const operationId = `imp-${Date.now()}`
  const previousSnapshot = structuredClone(next)

  next.caratula = importData.basic?.caratula || next.caratula
  next.rol = importData.basic?.rol || next.rol
  next.rit = importData.basic?.rit || next.rit
  next.tribunal = importData.basic?.tribunal || next.tribunal
  next.procedimiento = importData.basic?.procedimiento || next.procedimiento
  next.materia = importData.basic?.materia || next.materia
  next.estadoProcesal = importData.basic?.estadoProcesal || next.estadoProcesal
  next.fechaInicio = importData.basic?.fechaIngreso || next.fechaInicio
  next.cliente = options.primaryClientName || next.cliente
  next.selectedClientParties = options.selectedClientParties || []
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
    notes: importData.rawText ? 'Importación semiautomática con texto analizado por el usuario.' : 'Importación creada desde referencia judicial manual.',
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
  const allDocuments = [importData.ebook, ...(importData.documents || []).filter((documentRecord) => documentRecord.category !== 'Ebook')].filter(Boolean)
  allDocuments.forEach((documentRecord) => {
    const before = new Set((next.documents || []).map((item) => item.id))
    const updated = upsertDocument(next, { ...documentRecord, caseId: next.id, linkedClient: options.primaryClientName || next.cliente })
    next.documents = updated.documents
    next.documentContainers = updated.documentContainers
    next.ebookDocumentId = updated.ebookDocumentId
    const created = updated.documents.find((item) => !before.has(item.id) && item.hash === documentRecord.hash) || updated.documents.find((item) => item.hash === documentRecord.hash)
    if (created) importedDocIds.push(created.id)
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
