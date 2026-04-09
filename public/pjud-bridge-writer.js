(function bootstrapAlphaPjudBridgeWriter() {
  if (window.__ALPHA_PJUD_BRIDGE_WRITER_ACTIVE__) return
  window.__ALPHA_PJUD_BRIDGE_WRITER_ACTIVE__ = true

  const BRIDGE_SNAPSHOT_STORAGE_KEY = 'alpha.pjud.bridge.snapshot'
  const BRIDGE_CHANNEL_NAME = 'alpha-pjud-bridge'
  const BRIDGE_MESSAGE_TYPE = 'alpha-pjud-live-context'
  const HEARTBEAT_INTERVAL_MS = 2000

  const params = new URLSearchParams(window.location.search)
  const targetOrigin = params.get('targetOrigin') || '*'

  const channel = typeof window.BroadcastChannel === 'function'
    ? new window.BroadcastChannel(BRIDGE_CHANNEL_NAME)
    : null

  function textContent(node) {
    return String(node?.textContent || '').replace(/\s+/g, ' ').trim()
  }

  function detectViewLabel() {
    const candidates = [
      document.querySelector('h1'),
      document.querySelector('h2'),
      document.querySelector('.page-title'),
      document.querySelector('.titulo')
    ]
    const match = candidates.map(textContent).find(Boolean)
    return match || document.title || ''
  }

  function detectAuthentication(viewLabel) {
    const url = String(window.location.href || '')
    const pageText = textContent(document.body).slice(0, 4000)
    const hasLogout = /cerrar\s*sesión|salir/i.test(pageText)
    const looksLogin = /login|autentic|clave\s*única/i.test(`${viewLabel} ${url} ${pageText}`)
    return hasLogout || !looksLogin
  }

  function collectVisibleCauses() {
    const rows = Array.from(document.querySelectorAll('table tbody tr'))
      .filter((row) => row.offsetParent !== null)

    const parsed = rows.map((row, index) => {
      const cells = Array.from(row.querySelectorAll('td'))
      const rol = textContent(cells[0]) || row.getAttribute('data-rol') || `SIN-ROL-${index + 1}`
      const caratula = textContent(cells[1]) || textContent(row.querySelector('.caratula')) || ''
      const tribunal = textContent(cells[2]) || textContent(row.querySelector('.tribunal')) || ''
      const opener = row.querySelector('a[href], button, [onclick], [role="button"]')
      const openRef = opener?.getAttribute('href') || opener?.getAttribute('onclick') || opener?.className || ''
      return { rol, caratula, tribunal, openRef }
    })

    return parsed
      .filter((entry) => (entry.rol && !/^SIN-ROL-/.test(entry.rol)) || entry.caratula || entry.tribunal)
      .slice(0, 200)
  }

  function collectOpenerControls() {
    return Array.from(document.querySelectorAll('a[href], button, [onclick], [role="button"]'))
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({
        label: textContent(el).slice(0, 80),
        ref: el.getAttribute('href') || el.getAttribute('onclick') || el.className || '',
        kind: el.tagName.toLowerCase()
      }))
      .filter((entry) => /lupa|buscar|ver|detalle/i.test(`${entry.label} ${entry.ref}`))
      .slice(0, 120)
  }

  function collectSnapshot() {
    const view = detectViewLabel()
    const causes = collectVisibleCauses()
    const openerControls = collectOpenerControls()

    return {
      timestamp: Date.now(),
      url: window.location.href,
      host: window.location.hostname,
      title: document.title || '',
      view,
      source: 'pjud-window-bridge-writer',
      isAuthenticated: detectAuthentication(view),
      hasMisCausas: /mis\s*causas/i.test(`${view} ${document.title}`) || causes.length > 0,
      hasClaveUnicaReturn: /clave\s*única|claveunica|autentic/i.test(`${view} ${window.location.href}`),
      hasOJV: /oficinajudicialvirtual|ojv|oficina\s*judicial\s*virtual/i.test(`${window.location.href} ${view}`),
      causes,
      openerControls
    }
  }

  function publishSnapshot() {
    const payload = collectSnapshot()
    try {
      window.localStorage.setItem(BRIDGE_SNAPSHOT_STORAGE_KEY, JSON.stringify(payload))
    } catch (error) {
      console.warn('[Alpha][PJUD bridge writer] No se pudo escribir localStorage.', error)
    }

    if (channel) {
      channel.postMessage({ type: BRIDGE_MESSAGE_TYPE, payload })
    }

    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: BRIDGE_MESSAGE_TYPE, payload }, targetOrigin)
    }
  }

  publishSnapshot()
  window.setInterval(publishSnapshot, HEARTBEAT_INTERVAL_MS)
  window.addEventListener('focus', publishSnapshot)
  window.addEventListener('click', () => window.setTimeout(publishSnapshot, 150))
  window.addEventListener('hashchange', publishSnapshot)
  window.addEventListener('popstate', publishSnapshot)

  console.info('[Alpha][PJUD bridge writer] Activo.')
})()
