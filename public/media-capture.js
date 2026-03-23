import { blobToDataUrl, buildMediaFileName, detectBestMimeType, formatDuration, MEDIA_TYPE_LABELS } from './media-assets.js'

const TEMPLATE = `
  <div class="mm-capture-backdrop" hidden>
    <section class="mm-capture-modal" role="dialog" aria-modal="true" aria-labelledby="mmCaptureTitle">
      <header class="mm-capture-header">
        <div>
          <p class="mm-capture-kicker">Captura multimedia</p>
          <h3 id="mmCaptureTitle">Registro multimedia</h3>
          <p class="mm-capture-subtitle">Selecciona el modo de captura y guarda el archivo solo cuando la vista previa sea correcta.</p>
        </div>
        <button type="button" class="btn-cancel" data-mm-action="close">Cerrar</button>
      </header>
      <div class="mm-mode-tabs" role="tablist" aria-label="Modo de captura">
        <button type="button" class="mm-mode-tab active" data-mm-mode="photo">Foto</button>
        <button type="button" class="mm-mode-tab" data-mm-mode="audio">Audio</button>
        <button type="button" class="mm-mode-tab" data-mm-mode="video">Video</button>
        <button type="button" class="mm-mode-tab" data-mm-mode="av">Audio + video</button>
      </div>
      <div class="mm-capture-layout">
        <section class="mm-stage-card">
          <div class="mm-live-meta">
            <div class="mm-status-stack">
              <span class="mm-live-chip" data-mm-live-chip hidden>● Grabando</span>
              <strong data-mm-mode-title>Fotografía</strong>
              <span data-mm-support-copy>Al ingresar al modo se solicitarán solo los permisos necesarios.</span>
            </div>
            <div class="mm-inline-tools">
              <label class="mm-check" data-mm-video-audio-toggle hidden>
                <input type="checkbox" data-mm-video-with-audio checked>
                <span>Video con audio</span>
              </label>
              <button type="button" class="btn-nav" data-mm-action="switch-camera">Cambiar cámara</button>
            </div>
          </div>
          <div class="mm-live-shell">
            <video data-mm-live-video autoplay playsinline muted></video>
            <div class="mm-audio-shell" data-mm-audio-shell hidden>
              <div class="mm-audio-pulse"></div>
              <p>Micrófono listo. Usa iniciar para grabar el audio de la atención.</p>
            </div>
          </div>
          <p class="mm-stage-help" data-mm-status>La captura multimedia se activa solo cuando entras a un modo compatible.</p>
        </section>
        <section class="mm-stage-card">
          <div class="mm-preview-meta">
            <div>
              <strong>Vista previa antes de guardar</strong>
              <p>Reproduce, repite o descarta antes de persistir el archivo.</p>
            </div>
            <strong class="mm-timer" data-mm-timer>00:00</strong>
          </div>
          <div class="mm-preview-shell">
            <img data-mm-photo-preview alt="Vista previa de fotografía capturada." hidden>
            <audio data-mm-audio-preview controls hidden></audio>
            <video data-mm-video-preview controls playsinline hidden></video>
            <div class="mm-preview-empty" data-mm-preview-empty>Sin captura todavía. Selecciona un modo, autoriza permisos y ejecuta la acción correspondiente.</div>
          </div>
          <label class="mm-notes-field">Notas opcionales
            <textarea rows="3" data-mm-notes placeholder="Ej.: entrevista inicial, respaldo de atención, avatar del cliente, incidencia durante la reunión..."></textarea>
          </label>
        </section>
      </div>
      <div class="mm-action-bar">
        <div class="mm-primary-actions">
          <button type="button" class="btn-save" data-mm-action="capture-photo">Tomar foto</button>
          <button type="button" class="btn-save" data-mm-action="start-record">Iniciar</button>
          <button type="button" class="btn-nav" data-mm-action="pause-record">Pausar</button>
          <button type="button" class="btn-cancel" data-mm-action="stop-record">Detener</button>
        </div>
        <div class="mm-secondary-actions">
          <button type="button" class="btn-outline" data-mm-action="upload-photo">Subir imagen</button>
          <button type="button" class="btn-clear" data-mm-action="repeat">Repetir</button>
          <button type="button" class="btn-danger" data-mm-action="delete">Eliminar</button>
          <button type="button" class="btn-save" data-mm-action="save">Guardar</button>
          <button type="button" class="btn-cancel" data-mm-action="cancel">Cancelar</button>
        </div>
      </div>
      <input type="file" accept="image/*" data-mm-upload-input hidden>
    </section>
  </div>
`

function ensureTemplate() {
  const existing = document.getElementById('mm-capture-root')
  if (existing) return existing
  const wrapper = document.createElement('div')
  wrapper.id = 'mm-capture-root'
  wrapper.innerHTML = TEMPLATE
  document.body.appendChild(wrapper)
  return wrapper
}

export class MultimediaCaptureModal {
  constructor({ onSave, allowManualPhotoUpload = false } = {}) {
    this.onSave = onSave
    this.allowManualPhotoUpload = allowManualPhotoUpload
    this.root = ensureTemplate()
    this.backdrop = this.root.querySelector('.mm-capture-backdrop')
    this.modeButtons = [...this.root.querySelectorAll('[data-mm-mode]')]
    this.liveChip = this.root.querySelector('[data-mm-live-chip]')
    this.modeTitle = this.root.querySelector('[data-mm-mode-title]')
    this.supportCopy = this.root.querySelector('[data-mm-support-copy]')
    this.liveVideo = this.root.querySelector('[data-mm-live-video]')
    this.audioShell = this.root.querySelector('[data-mm-audio-shell]')
    this.status = this.root.querySelector('[data-mm-status]')
    this.timer = this.root.querySelector('[data-mm-timer]')
    this.notes = this.root.querySelector('[data-mm-notes]')
    this.photoPreview = this.root.querySelector('[data-mm-photo-preview]')
    this.audioPreview = this.root.querySelector('[data-mm-audio-preview]')
    this.videoPreview = this.root.querySelector('[data-mm-video-preview]')
    this.previewEmpty = this.root.querySelector('[data-mm-preview-empty]')
    this.uploadInput = this.root.querySelector('[data-mm-upload-input]')
    this.videoAudioToggle = this.root.querySelector('[data-mm-video-audio-toggle]')
    this.videoWithAudioInput = this.root.querySelector('[data-mm-video-with-audio]')
    this.switchCameraButton = this.root.querySelector('[data-mm-action="switch-camera"]')
    this.buttons = {
      capturePhoto: this.root.querySelector('[data-mm-action="capture-photo"]'),
      start: this.root.querySelector('[data-mm-action="start-record"]'),
      pause: this.root.querySelector('[data-mm-action="pause-record"]'),
      stop: this.root.querySelector('[data-mm-action="stop-record"]'),
      uploadPhoto: this.root.querySelector('[data-mm-action="upload-photo"]'),
      repeat: this.root.querySelector('[data-mm-action="repeat"]'),
      delete: this.root.querySelector('[data-mm-action="delete"]'),
      save: this.root.querySelector('[data-mm-action="save"]'),
      cancel: this.root.querySelector('[data-mm-action="cancel"]'),
      close: this.root.querySelector('[data-mm-action="close"]')
    }

    this.mode = 'photo'
    this.currentFacingMode = 'user'
    this.stream = null
    this.recorder = null
    this.chunks = []
    this.previewBlob = null
    this.previewUrl = ''
    this.previewMimeType = ''
    this.recordingStartedAt = 0
    this.pausedAccumulatedMs = 0
    this.pauseStartedAt = 0
    this.timerInterval = null
    this.context = {}

    this.bindEvents()
    this.syncUi()
  }

  bindEvents() {
    this.modeButtons.forEach((button) => {
      button.addEventListener('click', () => this.setMode(button.dataset.mmMode))
    })
    this.root.addEventListener('click', (event) => {
      if (event.target === this.backdrop) this.close()
    })
    this.buttons.close.addEventListener('click', () => this.close())
    this.buttons.cancel.addEventListener('click', () => this.close())
    this.buttons.capturePhoto.addEventListener('click', () => this.capturePhoto())
    this.buttons.start.addEventListener('click', () => this.startRecording())
    this.buttons.pause.addEventListener('click', () => this.togglePause())
    this.buttons.stop.addEventListener('click', () => this.stopRecording())
    this.buttons.repeat.addEventListener('click', () => this.repeatCapture())
    this.buttons.delete.addEventListener('click', () => this.deletePreview())
    this.buttons.save.addEventListener('click', () => this.save())
    this.buttons.uploadPhoto.addEventListener('click', () => this.uploadInput.click())
    this.switchCameraButton.addEventListener('click', () => this.switchCamera())
    this.uploadInput.addEventListener('change', (event) => this.handleManualPhotoUpload(event))
    this.videoWithAudioInput.addEventListener('change', async () => {
      if (this.mode === 'video') {
        await this.teardownStream()
        await this.prepareStream()
        this.syncUi()
      }
    })
  }

  async open({ mode = 'photo', context = {} } = {}) {
    this.context = context
    this.backdrop.hidden = false
    await this.setMode(mode)
  }

  async close() {
    this.backdrop.hidden = true
    this.clearPreview()
    this.stopTimer()
    await this.teardownStream()
    this.notes.value = ''
    this.status.textContent = 'Captura cancelada.'
  }

  async setMode(mode) {
    this.mode = mode
    this.modeButtons.forEach((button) => button.classList.toggle('active', button.dataset.mmMode === mode))
    this.modeTitle.textContent = MEDIA_TYPE_LABELS[mode] || 'Captura multimedia'
    this.videoAudioToggle.hidden = mode !== 'video'
    this.switchCameraButton.hidden = !(mode === 'photo' || mode === 'video' || mode === 'av')
    this.buttons.capturePhoto.hidden = mode !== 'photo'
    const isRecordingMode = mode !== 'photo'
    this.buttons.start.hidden = !isRecordingMode
    this.buttons.pause.hidden = !isRecordingMode
    this.buttons.stop.hidden = !isRecordingMode
    this.buttons.uploadPhoto.hidden = !(this.allowManualPhotoUpload && mode === 'photo')
    this.audioShell.hidden = mode !== 'audio'
    this.liveVideo.hidden = mode === 'audio'
    this.status.textContent = 'Preparando permisos del navegador…'
    this.supportCopy.textContent = this.getSupportCopy(mode)
    this.clearPreview()
    this.stopTimer()
    await this.teardownStream()
    await this.prepareStream()
    this.syncUi()
  }

  getSupportCopy(mode) {
    if (!window.isSecureContext) return 'Este navegador requiere HTTPS o localhost para acceder a cámara y micrófono.'
    if (!navigator.mediaDevices?.getUserMedia) return 'El navegador no soporta getUserMedia para esta función.'
    if (mode !== 'photo' && typeof MediaRecorder === 'undefined') return 'El navegador no soporta grabación multimedia con MediaRecorder.'
    if (mode === 'video') return 'Puedes grabar video con o sin audio usando el selector visible en este modo.'
    if (mode === 'av') return 'Se usarán cámara y micrófono simultáneamente para registrar la atención completa.'
    if (mode === 'audio') return 'Solo se solicitará acceso al micrófono para la grabación de audio.'
    return 'La fotografía se toma desde el stream real de cámara, con vista previa antes de guardar.'
  }

  async prepareStream() {
    if (!window.isSecureContext) {
      this.status.textContent = 'No se puede abrir la captura multimedia fuera de HTTPS o localhost.'
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      this.status.textContent = 'Este navegador no soporta acceso a cámara o micrófono.'
      return
    }

    const constraints = this.getConstraints()
    if (!constraints) {
      this.status.textContent = 'Este modo no está soportado por el navegador actual.'
      return
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints)
      if (this.mode === 'audio') {
        this.status.textContent = 'Micrófono listo. Puedes iniciar la grabación.'
        this.liveVideo.srcObject = null
      } else {
        this.liveVideo.srcObject = this.stream
        await this.liveVideo.play().catch(() => {})
        this.status.textContent = 'Vista previa en vivo activa. Cuando estés listo, ejecuta la captura.'
      }
    } catch (error) {
      this.status.textContent = this.normalizeMediaError(error)
    }
  }

  getConstraints() {
    if (this.mode === 'photo') {
      return {
        audio: false,
        video: {
          facingMode: this.currentFacingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      }
    }
    if (this.mode === 'audio') {
      return { audio: true, video: false }
    }
    if (this.mode === 'video') {
      return {
        audio: Boolean(this.videoWithAudioInput.checked),
        video: {
          facingMode: this.currentFacingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      }
    }
    if (this.mode === 'av') {
      return {
        audio: true,
        video: {
          facingMode: this.currentFacingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      }
    }
    return null
  }

  normalizeMediaError(error) {
    if (error?.name === 'NotAllowedError') return 'Permiso denegado. Debes autorizar cámara o micrófono para continuar.'
    if (error?.name === 'NotFoundError') return this.mode === 'audio' ? 'No se detectó un micrófono disponible.' : 'No se detectó una cámara disponible.'
    if (error?.name === 'NotReadableError') return 'La cámara o el micrófono están siendo usados por otra aplicación.'
    if (error?.name === 'OverconstrainedError') return 'El dispositivo no soporta la configuración solicitada para este modo.'
    return 'Ocurrió un problema al inicializar la captura multimedia.'
  }

  syncUi() {
    const hasPreview = Boolean(this.previewBlob)
    const isRecording = this.recorder?.state === 'recording'
    const isPaused = this.recorder?.state === 'paused'
    this.liveChip.hidden = !isRecording
    this.buttons.pause.disabled = !this.recorder || (this.mode === 'photo') || !['recording', 'paused'].includes(this.recorder.state)
    this.buttons.pause.textContent = isPaused ? 'Reanudar' : 'Pausar'
    this.buttons.stop.disabled = !isRecording && !isPaused
    this.buttons.start.disabled = !this.stream || hasPreview || isRecording || isPaused || this.mode === 'photo'
    this.buttons.capturePhoto.disabled = this.mode !== 'photo' || !this.stream || hasPreview
    this.buttons.repeat.disabled = !hasPreview
    this.buttons.delete.disabled = !hasPreview
    this.buttons.save.disabled = !hasPreview
  }

  async capturePhoto() {
    if (!this.stream || !this.liveVideo.videoWidth || !this.liveVideo.videoHeight) {
      this.status.textContent = 'La cámara todavía no está lista para capturar la fotografía.'
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = this.liveVideo.videoWidth
    canvas.height = this.liveVideo.videoHeight
    const context = canvas.getContext('2d')
    if (!context) {
      this.status.textContent = 'No fue posible preparar el cuadro de captura.'
      return
    }
    context.drawImage(this.liveVideo, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    if (!blob) {
      this.status.textContent = 'No fue posible generar la fotografía.'
      return
    }
    await this.setPreview(blob, 'image/jpeg')
    this.status.textContent = 'Fotografía capturada. Revísala antes de guardarla.'
  }

  async handleManualPhotoUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return
    await this.setPreview(file, file.type || 'image/jpeg')
    this.status.textContent = 'Imagen cargada manualmente. Puedes guardarla como avatar o respaldo visual.'
    event.target.value = ''
  }

  async startRecording() {
    if (!this.stream) {
      this.status.textContent = 'No hay un stream activo para comenzar la grabación.'
      return
    }
    if (typeof MediaRecorder === 'undefined') {
      this.status.textContent = 'El navegador no soporta grabación multimedia con MediaRecorder.'
      return
    }
    const mimeType = detectBestMimeType(this.mode === 'audio' ? 'audio' : 'video')
    this.chunks = []
    try {
      this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined)
    } catch (error) {
      this.status.textContent = 'No fue posible iniciar MediaRecorder en este navegador o dispositivo.'
      return
    }
    this.recorder.addEventListener('dataavailable', (event) => {
      if (event.data?.size) this.chunks.push(event.data)
    })
    this.recorder.addEventListener('stop', async () => {
      const fallbackType = this.mode === 'audio' ? 'audio/webm' : 'video/webm'
      const blob = new Blob(this.chunks, { type: this.recorder.mimeType || mimeType || fallbackType })
      await this.setPreview(blob, blob.type || fallbackType)
      this.status.textContent = `${MEDIA_TYPE_LABELS[this.mode]} lista para reproducción y guardado.`
    })
    this.recorder.start(250)
    this.recordingStartedAt = Date.now()
    this.pausedAccumulatedMs = 0
    this.pauseStartedAt = 0
    this.startTimer()
    this.status.textContent = 'Grabación en curso…'
    this.syncUi()
  }

  togglePause() {
    if (!this.recorder) return
    if (this.recorder.state === 'recording') {
      this.recorder.pause()
      this.pauseStartedAt = Date.now()
      this.status.textContent = 'Grabación en pausa.'
    } else if (this.recorder.state === 'paused') {
      this.recorder.resume()
      if (this.pauseStartedAt) this.pausedAccumulatedMs += Date.now() - this.pauseStartedAt
      this.pauseStartedAt = 0
      this.status.textContent = 'Grabación reanudada.'
    }
    this.syncUi()
  }

  stopRecording() {
    if (!this.recorder || !['recording', 'paused'].includes(this.recorder.state)) return
    if (this.recorder.state === 'paused' && this.pauseStartedAt) {
      this.pausedAccumulatedMs += Date.now() - this.pauseStartedAt
      this.pauseStartedAt = 0
    }
    this.recorder.stop()
    this.stopTimer()
    this.syncUi()
  }

  async setPreview(blob, mimeType) {
    this.clearPreview(false)
    this.previewBlob = blob
    this.previewMimeType = mimeType
    this.previewUrl = URL.createObjectURL(blob)
    const durationSeconds = this.currentDurationSeconds()
    this.timer.textContent = formatDuration(durationSeconds)
    this.previewEmpty.hidden = true

    if (mimeType.startsWith('image/')) {
      const previewDataUrl = await blobToDataUrl(blob)
      this.photoPreview.src = previewDataUrl
      this.photoPreview.hidden = false
    } else if (mimeType.startsWith('audio/')) {
      this.audioPreview.src = this.previewUrl
      this.audioPreview.hidden = false
    } else {
      this.videoPreview.src = this.previewUrl
      this.videoPreview.hidden = false
    }
    this.syncUi()
  }

  clearPreview(resetTimer = true) {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl)
    this.previewBlob = null
    this.previewUrl = ''
    this.previewMimeType = ''
    this.photoPreview.hidden = true
    this.audioPreview.hidden = true
    this.videoPreview.hidden = true
    this.photoPreview.removeAttribute('src')
    this.audioPreview.removeAttribute('src')
    this.videoPreview.removeAttribute('src')
    this.previewEmpty.hidden = false
    if (resetTimer) this.timer.textContent = '00:00'
    this.syncUi()
  }

  async repeatCapture() {
    this.clearPreview()
    if (!this.stream) await this.prepareStream()
    this.status.textContent = this.mode === 'photo'
      ? 'La foto fue descartada. Puedes capturar una nueva.'
      : 'La grabación fue descartada. Puedes registrar una nueva toma.'
  }

  async deletePreview() {
    this.clearPreview()
    this.status.textContent = 'El archivo previo fue eliminado.'
  }

  currentDurationSeconds() {
    if (!this.recordingStartedAt) return 0
    const pausedMs = this.pausedAccumulatedMs + (this.pauseStartedAt ? (Date.now() - this.pauseStartedAt) : 0)
    return Math.max(0, Math.round((Date.now() - this.recordingStartedAt - pausedMs) / 1000))
  }

  startTimer() {
    this.stopTimer()
    this.timerInterval = window.setInterval(() => {
      this.timer.textContent = formatDuration(this.currentDurationSeconds())
      this.syncUi()
    }, 250)
  }

  stopTimer() {
    if (this.timerInterval) {
      window.clearInterval(this.timerInterval)
      this.timerInterval = null
    }
  }

  async switchCamera() {
    if (!(this.mode === 'photo' || this.mode === 'video' || this.mode === 'av')) return
    this.currentFacingMode = this.currentFacingMode === 'user' ? 'environment' : 'user'
    this.status.textContent = this.currentFacingMode === 'environment'
      ? 'Intentando usar la cámara trasera.'
      : 'Intentando usar la cámara frontal.'
    await this.teardownStream()
    await this.prepareStream()
    this.syncUi()
  }

  async save() {
    if (!this.previewBlob || typeof this.onSave !== 'function') {
      this.status.textContent = 'Primero debes capturar o cargar un archivo antes de guardarlo.'
      return
    }
    const durationSeconds = this.mode === 'photo' ? null : this.currentDurationSeconds() || Number(this.timer.textContent.split(':').reduce((acc, part) => acc * 60 + Number(part), 0))
    try {
      await this.onSave({
        blob: this.previewBlob,
        mode: this.mode,
        mimeType: this.previewMimeType || this.previewBlob.type,
        durationSeconds,
        notes: this.notes.value.trim(),
        fileName: buildMediaFileName({ mediaType: this.mode, mimeType: this.previewMimeType || this.previewBlob.type, prefix: 'alpha-avocat' }),
        context: this.context,
        hasAudio: this.mode === 'av' || this.mode === 'audio' || (this.mode === 'video' && this.videoWithAudioInput.checked)
      })
      await this.close()
    } catch (error) {
      this.status.textContent = error?.message || 'No fue posible guardar el archivo multimedia.'
    }
  }

  async teardownStream() {
    if (this.recorder && ['recording', 'paused'].includes(this.recorder.state)) {
      this.recorder.stop()
    }
    this.recorder = null
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }
    if (this.liveVideo) this.liveVideo.srcObject = null
    this.syncUi()
  }
}
