const MODE_STORAGE_KEY = 'modo'

export const formatNumericDate = (value = new Date()) => new Intl.DateTimeFormat('es-CL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
}).format(value)

export function initTopbarChrome({ doc = document } = {}) {
  const body = doc.body
  const modeButton = doc.querySelector('#modo-toggle')
  const dateNode = doc.querySelector('#fecha')

  const applyMode = (mode) => {
    const isDark = mode === 'oscuro'
    body.classList.toggle('dark-mode', isDark)
    if (modeButton) {
      modeButton.textContent = isDark ? '☀️' : '🌙'
      modeButton.setAttribute('aria-label', isDark ? 'Cambiar a modo diurno' : 'Cambiar a modo nocturno')
      modeButton.title = isDark ? 'Cambiar a modo diurno' : 'Cambiar a modo nocturno'
    }
  }

  const currentMode = localStorage.getItem(MODE_STORAGE_KEY) === 'oscuro' ? 'oscuro' : 'claro'
  applyMode(currentMode)

  if (modeButton) {
    modeButton.addEventListener('click', () => {
      const nextMode = body.classList.contains('dark-mode') ? 'claro' : 'oscuro'
      localStorage.setItem(MODE_STORAGE_KEY, nextMode)
      applyMode(nextMode)
    })
  }

  if (dateNode) dateNode.textContent = formatNumericDate()
}
