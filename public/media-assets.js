import { supabase } from './app.js'

export const MEDIA_BUCKET = 'alpha-media'
export const MEDIA_TYPE_LABELS = {
  photo: 'Fotografía',
  audio: 'Audio',
  video: 'Video',
  av: 'Audio + video'
}

export const MEDIA_ROLE_LABELS = {
  avatar: 'Avatar de cliente',
  evidence: 'Respaldo visual',
  activity_record: 'Registro de atención',
  attachment: 'Adjunto multimedia'
}

const MIME_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'video/webm': 'webm',
  'video/mp4': 'mp4'
}

const MIME_ALLOWLIST = {
  photo: ['image/jpeg', 'image/png', 'image/webp'],
  audio: ['audio/webm', 'audio/mp4', 'audio/ogg'],
  video: ['video/webm', 'video/mp4'],
  av: ['video/webm', 'video/mp4']
}

const MAX_BYTES = {
  photo: 8 * 1024 * 1024,
  audio: 60 * 1024 * 1024,
  video: 180 * 1024 * 1024,
  av: 220 * 1024 * 1024
}

function slugify(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

function fileExtensionFromMime(mimeType = '') {
  return MIME_EXTENSIONS[mimeType] || 'bin'
}

function buildRandomToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function mediaFolderForType(mediaType = 'photo', mediaRole = 'attachment') {
  if (mediaRole === 'avatar') return 'avatars'
  if (mediaType === 'photo') return 'photos'
  if (mediaType === 'audio') return 'audio'
  if (mediaType === 'video') return 'video'
  return 'audio-video'
}

export function validateMediaBlob({ blob, mediaType, mimeType }) {
  if (!(blob instanceof Blob)) {
    throw new Error('No se pudo preparar el archivo multimedia para guardarlo.')
  }
  const allowed = MIME_ALLOWLIST[mediaType] || []
  if (allowed.length && mimeType && !allowed.includes(mimeType)) {
    throw new Error(`El formato ${mimeType} no está permitido para ${MEDIA_TYPE_LABELS[mediaType] || mediaType}.`)
  }
  const maxBytes = MAX_BYTES[mediaType] || MAX_BYTES.photo
  if (blob.size > maxBytes) {
    const maxMb = Math.round(maxBytes / (1024 * 1024))
    throw new Error(`El archivo supera el tamaño máximo permitido de ${maxMb} MB.`)
  }
}

export function buildStoragePath({ mediaType, mediaRole = 'attachment', fileName, clientRef, caseRef, appointmentId }) {
  const folder = mediaFolderForType(mediaType, mediaRole)
  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(now.getUTCDate()).padStart(2, '0')
  const association = slugify(appointmentId || caseRef || clientRef || 'general') || 'general'
  const safeFileName = slugify(fileName.replace(/\.[^.]+$/, '')) || 'archivo'
  const extension = fileName.includes('.') ? fileName.split('.').pop() : fileExtensionFromMime('')
  return `${folder}/${yyyy}/${mm}/${dd}/${association}/${buildRandomToken()}-${safeFileName}.${extension}`
}

export function detectBestMimeType(mediaType = 'audio') {
  const candidates = mediaType === 'audio'
    ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
    : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']

  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return candidates[candidates.length - 1]
  }

  const supported = candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate))
  return supported || ''
}

export async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('No fue posible preparar la vista previa del archivo.'))
    reader.readAsDataURL(blob)
  })
}

export function buildMediaFileName({ mediaType, mimeType, prefix = 'alpha-avocat' }) {
  const extension = fileExtensionFromMime(mimeType)
  return `${prefix}-${mediaType}-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`
}

export async function uploadMediaAsset({
  blob,
  mediaType,
  mediaRole = 'attachment',
  mimeType,
  fileName,
  durationSeconds = null,
  appointmentId = null,
  caseId = null,
  clientId = null,
  clientRef = null,
  caseRef = null,
  createdBy = null,
  notes = null,
  metadata = {},
  recordedAt = new Date().toISOString()
}) {
  validateMediaBlob({ blob, mediaType, mimeType })
  const resolvedFileName = fileName || buildMediaFileName({ mediaType, mimeType })
  const path = buildStoragePath({
    mediaType,
    mediaRole,
    fileName: resolvedFileName,
    clientRef,
    caseRef,
    appointmentId
  })

  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, blob, {
      cacheControl: '3600',
      upsert: false,
      contentType: mimeType
    })

  if (uploadError) {
    throw new Error(`Falló la subida del archivo multimedia: ${uploadError.message}`)
  }

  const { data: publicUrlData } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path)
  const fileUrl = publicUrlData?.publicUrl || ''
  const payload = {
    media_type: mediaType,
    media_role: mediaRole,
    storage_bucket: MEDIA_BUCKET,
    storage_path: path,
    file_url: fileUrl,
    file_name: resolvedFileName,
    mime_type: mimeType,
    file_size_bytes: blob.size,
    duration_seconds: durationSeconds,
    client_id: clientId,
    case_id: caseId,
    appointment_id: appointmentId,
    client_ref: clientRef,
    case_ref: caseRef,
    created_by: createdBy,
    recorded_at: recordedAt,
    notes,
    metadata
  }

  const { data, error } = await supabase
    .from('media_assets')
    .insert(payload)
    .select('*')
    .single()

  if (error) {
    await supabase.storage.from(MEDIA_BUCKET).remove([path])
    throw new Error(`El archivo se subió, pero no fue posible registrar su metadata: ${error.message}`)
  }

  return data
}

export async function listMediaAssets({ appointmentId = null, caseId = null, clientId = null, clientRef = null, caseRef = null, mediaRole = null } = {}) {
  let query = supabase.from('media_assets').select('*').order('created_at', { ascending: false })
  if (appointmentId) query = query.eq('appointment_id', appointmentId)
  if (caseId) query = query.eq('case_id', caseId)
  if (clientId) query = query.eq('client_id', clientId)
  if (clientRef) query = query.eq('client_ref', clientRef)
  if (caseRef) query = query.eq('case_ref', caseRef)
  if (mediaRole) query = query.eq('media_role', mediaRole)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data || []
}

export async function deleteMediaAsset(asset) {
  if (!asset?.id) return
  const removalTasks = []
  if (asset.storage_path) {
    removalTasks.push(supabase.storage.from(asset.storage_bucket || MEDIA_BUCKET).remove([asset.storage_path]))
  }
  removalTasks.push(supabase.from('media_assets').delete().eq('id', asset.id))
  const results = await Promise.all(removalTasks)
  const failing = results.find((result) => result.error)
  if (failing?.error) throw new Error(failing.error.message)
}

export async function resolveAgendaMediaRelations({ clientName = '', caseRol = '', caseCourt = '' } = {}) {
  const relations = {
    clientId: null,
    caseId: null
  }

  if (clientName) {
    const { data } = await supabase
      .from('clients')
      .select('id, full_name')
      .ilike('full_name', clientName)
      .limit(1)
    relations.clientId = data?.[0]?.id || null
  }

  if (caseRol) {
    let query = supabase.from('cases').select('id, rol, court').ilike('rol', caseRol).limit(3)
    if (caseCourt) query = query.ilike('court', caseCourt)
    const { data } = await query
    relations.caseId = data?.[0]?.id || null
  }

  return relations
}

export function formatDuration(durationSeconds = 0) {
  const totalSeconds = Math.max(0, Math.floor(Number(durationSeconds) || 0))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
