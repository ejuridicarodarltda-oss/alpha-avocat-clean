import { requireAuth, logout } from './app.js'
import {
  categoryDefinitions,
  defaultSettings,
  exportSettings,
  loadSettings,
  resetSettings,
  saveSettings,
  searchCategories,
} from './config-store.js'

const state = {
  settings: loadSettings(),
  draft: loadSettings(),
  activeCategory: 'perfil',
  search: '',
  modalOpen: false,
  editingUserId: null,
}

const els = {
  categoryList: document.querySelector('#configCategoryList'),
  categorySearch: document.querySelector('#configSearch'),
  categoryCount: document.querySelector('#configCategoryCount'),
  content: document.querySelector('#configContent'),
  summaryGrid: document.querySelector('#configSummaryGrid'),
  statusText: document.querySelector('#configStatusText'),
  saveAll: document.querySelector('#saveAllBtn'),
  restoreAll: document.querySelector('#restoreAllBtn'),
  exportAll: document.querySelector('#exportAllBtn'),
  userModal: document.querySelector('#userModal'),
  userModalTitle: document.querySelector('#userModalTitle'),
  userForm: document.querySelector('#userForm'),
  closeUserModal: document.querySelector('#closeUserModal'),
  cancelUserModal: document.querySelector('#cancelUserModal'),
  fecha: document.querySelector('#fecha'),
  logoutButton: document.querySelector('#cerrar-sesion-btn'),
}

const modulePermissionOptions = ['Ver', 'Crear', 'Editar', 'Eliminar', 'Aprobar', 'Presentar', 'Administrar']

const formatDateTime = (value) => {
  if (!value) return 'Sin guardado previo'
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

const deepClone = (value) => JSON.parse(JSON.stringify(value))

init()

async function init() {
  await requireAuth()
  bindGlobalEvents()
  hydrateChrome()
  render()
}

function bindGlobalEvents() {
  els.categorySearch.addEventListener('input', (event) => {
    state.search = event.target.value
    renderCategoryList()
  })

  els.saveAll.addEventListener('click', handleSaveAll)
  els.restoreAll.addEventListener('click', handleResetAll)
  els.exportAll.addEventListener('click', () => exportSettings(state.draft))
  els.logoutButton.addEventListener('click', logout)

  els.closeUserModal.addEventListener('click', closeUserModal)
  els.cancelUserModal.addEventListener('click', closeUserModal)
  els.userModal.addEventListener('click', (event) => {
    if (event.target === els.userModal) closeUserModal()
  })
  els.userForm.addEventListener('submit', handleUserSubmit)

  document.addEventListener('click', (event) => {
    const categoryButton = event.target.closest('[data-category-id]')
    if (categoryButton) {
      state.activeCategory = categoryButton.dataset.categoryId
      render()
      return
    }

    const action = event.target.closest('[data-action]')
    if (!action) return

    const { action: actionName, payload, value } = action.dataset

    if (actionName === 'toggle-rule') toggleAlertRule(payload)
    if (actionName === 'toggle-service') toggleServicePrepared(payload)
    if (actionName === 'add-user') openUserModal()
    if (actionName === 'edit-user') openUserModal(payload)
    if (actionName === 'toggle-user-status') toggleUserStatus(payload)
    if (actionName === 'remove-template') removeTemplate(payload)
    if (actionName === 'add-template') addTemplate()
    if (actionName === 'add-alert') addAlertRule()
    if (actionName === 'add-catalog-item') addCatalogGroup()
    if (actionName === 'remove-catalog-group') removeCatalogGroup(payload)
    if (actionName === 'change-automation') setAutomation(value)
    if (actionName === 'back-to-panel') window.location.href = './panel.html'
  })

  document.addEventListener('change', (event) => {
    const field = event.target.closest('[data-field]')
    if (field) {
      updatePath(field.dataset.field, field.type === 'checkbox' ? field.checked : field.value)
      renderStatus('Borrador actualizado. Pendiente guardar.')
      if (field.dataset.previewTheme === 'true') applyThemePreview()
    }

    const checkbox = event.target.closest('[data-permission-checkbox]')
    if (checkbox) updateRolePermission(checkbox)
  })

  document.addEventListener('input', (event) => {
    const field = event.target.closest('[data-field-live]')
    if (!field) return
    updatePath(field.dataset.fieldLive, field.value)
    renderStatus('Borrador actualizado. Pendiente guardar.')
    if (field.dataset.previewTheme === 'true') applyThemePreview()
  })
}

function hydrateChrome() {
  els.fecha.textContent = new Intl.DateTimeFormat('es-CL', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(new Date())
  applyThemePreview()
}

function render() {
  renderSummary()
  renderCategoryList()
  renderContent()
  renderStatus(`Último guardado: ${formatDateTime(state.settings.meta.updatedAt)}`)
}

function renderSummary() {
  const settings = state.draft
  const summaryCards = [
    { label: 'Categorías activas', value: categoryDefinitions.length, tone: 'default' },
    { label: 'Usuarios administrados', value: settings.usuarios.users.length, tone: 'default' },
    { label: 'Reglas de alerta', value: settings.alertas.reglas.filter((rule) => rule.activa).length, tone: 'active' },
    { label: 'Integraciones preparadas', value: settings.integraciones.servicios.filter((service) => service.estado.includes('Preparado')).length, tone: 'soft' },
  ]

  els.summaryGrid.innerHTML = summaryCards.map((card) => `
    <article class="config-metric config-metric-${card.tone}">
      <span>${card.label}</span>
      <strong>${card.value}</strong>
    </article>
  `).join('')
}

function renderCategoryList() {
  const filtered = searchCategories(state.search)
  els.categoryCount.textContent = `${filtered.length} secciones`
  els.categoryList.innerHTML = filtered.map((category) => `
    <button
      type="button"
      class="config-category ${state.activeCategory === category.id ? 'is-active' : ''}"
      data-category-id="${category.id}"
      aria-current="${state.activeCategory === category.id ? 'page' : 'false'}"
    >
      <span class="config-category-icon">${category.icon}</span>
      <span>
        <strong>${category.label}</strong>
        <small>${category.description}</small>
      </span>
    </button>
  `).join('')

  if (!filtered.some((category) => category.id === state.activeCategory) && filtered[0]) {
    state.activeCategory = filtered[0].id
    renderContent()
  }
}

function renderContent() {
  const category = categoryDefinitions.find((item) => item.id === state.activeCategory) || categoryDefinitions[0]
  const panel = renderers[category.id]()

  els.content.innerHTML = `
    <section class="config-panel-shell">
      <header class="config-panel-head">
        <div>
          <span class="config-chip">${category.icon} ${category.label}</span>
          <h2>${category.label}</h2>
          <p>${category.description}</p>
        </div>
        <div class="config-panel-actions">
          <button type="button" class="config-btn" data-action="back-to-panel">Volver al panel</button>
          <button type="button" class="config-btn config-btn-active" id="saveSectionBtn">Guardar cambios</button>
        </div>
      </header>
      ${panel}
    </section>
  `

  document.querySelector('#saveSectionBtn')?.addEventListener('click', handleSaveAll)
}

const renderers = {
  perfil: () => {
    const perfil = state.draft.perfil
    return `
      <div class="config-grid-2">
        <article class="config-block">
          <div class="config-block-head"><h3>Datos institucionales</h3><span class="config-badge">Persistencia activa</span></div>
          <div class="config-form-grid">
            ${textField('Nombre del estudio', 'perfil.nombreEstudio', perfil.nombreEstudio)}
            ${textField('Razón social', 'perfil.razonSocial', perfil.razonSocial)}
            ${textField('RUT', 'perfil.rut', perfil.rut)}
            ${textField('Ciudad', 'perfil.ciudad', perfil.ciudad)}
            ${textField('Dirección', 'perfil.direccion', perfil.direccion, 'wide')}
            ${textField('Correo general', 'perfil.correoGeneral', perfil.correoGeneral)}
            ${textField('Teléfonos', 'perfil.telefonos', perfil.telefonos)}
            ${textField('Sitio web', 'perfil.sitioWeb', perfil.sitioWeb)}
            ${textField('Logo del estudio', 'perfil.logoName', perfil.logoName)}
            ${textAreaField('Pie institucional', 'perfil.pieInstitucional', perfil.pieInstitucional)}
            ${textAreaField('Datos base para documentos y comunicaciones', 'perfil.baseDocumentos', perfil.baseDocumentos)}
          </div>
        </article>
        <article class="config-block config-subtle-block">
          <div class="config-block-head"><h3>Vista previa administrativa</h3><span class="config-badge is-soft">Preparada para integrarse con exportaciones</span></div>
          <div class="profile-preview-card">
            <div class="profile-preview-brand">
              <span class="profile-preview-logo">⚖️</span>
              <div>
                <strong>${perfil.nombreEstudio}</strong>
                <p>${perfil.razonSocial}</p>
              </div>
            </div>
            <dl class="profile-preview-list">
              <div><dt>RUT</dt><dd>${perfil.rut}</dd></div>
              <div><dt>Dirección</dt><dd>${perfil.direccion}, ${perfil.ciudad}</dd></div>
              <div><dt>Contacto</dt><dd>${perfil.correoGeneral}<br>${perfil.telefonos}</dd></div>
              <div><dt>Web</dt><dd>${perfil.sitioWeb}</dd></div>
            </dl>
            <p class="config-helper">${perfil.pieInstitucional}</p>
          </div>
        </article>
      </div>
    `
  },
  usuarios: () => {
    const users = state.draft.usuarios.users
    const modules = state.draft.usuarios.modules
    return `
      <div class="config-stack">
        <article class="config-block">
          <div class="config-block-head"><h3>Equipo del sistema</h3><button type="button" class="config-btn" data-action="add-user">Agregar usuario</button></div>
          <div class="config-table-wrap">
            <table class="config-table">
              <thead>
                <tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Permisos</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                ${users.map((user) => `
                  <tr>
                    <td><strong>${user.nombre}</strong><span>${user.correo}</span></td>
                    <td>${user.rol}</td>
                    <td><span class="table-pill ${user.estado === 'Activo' ? 'is-active' : 'is-critical'}">${user.estado}</span></td>
                    <td>${modules.map((module) => `<span class="inline-check">${module}: ${(user.permisos[module] || []).length}</span>`).join('')}</td>
                    <td>
                      <div class="table-actions">
                        <button type="button" class="config-btn" data-action="edit-user" data-payload="${user.id}">Editar</button>
                        <button type="button" class="config-btn ${user.estado === 'Activo' ? 'config-btn-critical' : ''}" data-action="toggle-user-status" data-payload="${user.id}">${user.estado === 'Activo' ? 'Desactivar' : 'Reactivar'}</button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </article>
        <article class="config-block config-subtle-block">
          <div class="config-block-head"><h3>Matriz de roles y permisos</h3><span class="config-badge">Preparada para backend RBAC</span></div>
          <div class="permission-grid">
            ${modules.map((module) => `
              <section class="permission-card">
                <h4>${module}</h4>
                <div class="permission-options">
                  ${modulePermissionOptions.map((action) => {
                    const checked = (users[0]?.permisos[module] || []).includes(action)
                    return `
                      <label class="toggle-row">
                        <input type="checkbox" data-permission-checkbox="true" data-module="${module}" data-action-name="${action}" ${checked ? 'checked' : ''}>
                        <span>${action}</span>
                      </label>
                    `
                  }).join('')}
                </div>
              </section>
            `).join('')}
          </div>
          <p class="config-helper">La matriz edita la base del primer usuario administrador para demostrar la persistencia y deja lista la abstracción para perfiles por rol.</p>
        </article>
      </div>
    `
  },
  apariencia: () => {
    const palette = state.draft.apariencia.coloresGenerales
    const identidad = state.draft.apariencia.identidadModulos
    return `
      <div class="config-grid-2">
        <article class="config-block">
          <div class="config-block-head"><h3>Paleta transversal</h3><span class="config-badge">Aplica vista previa local inmediata</span></div>
          <div class="config-form-grid">
            ${colorField('Fondo general', 'apariencia.coloresGenerales.fondoGeneral', palette.fondoGeneral)}
            ${colorField('Contenedor principal', 'apariencia.coloresGenerales.contenedorPrincipal', palette.contenedorPrincipal)}
            ${colorField('Bloque principal', 'apariencia.coloresGenerales.bloquePrincipal', palette.bloquePrincipal)}
            ${colorField('Subbloque', 'apariencia.coloresGenerales.subbloque', palette.subbloque)}
            ${colorField('Borde / separador', 'apariencia.coloresGenerales.borde', palette.borde)}
            ${colorField('Título interno', 'apariencia.coloresGenerales.titulo', palette.titulo)}
            ${colorField('Azul jurídico activo', 'apariencia.coloresGenerales.activo', palette.activo)}
            ${colorField('Burdeo crítico', 'apariencia.coloresGenerales.critico', palette.critico)}
            ${textField('Tipografía', 'apariencia.tipografia', state.draft.apariencia.tipografia)}
            ${textField('Tamaño base', 'apariencia.tamanoBase', state.draft.apariencia.tamanoBase)}
            ${textField('Estilo de botones', 'apariencia.estiloBotones', state.draft.apariencia.estiloBotones)}
            ${textAreaField('Diseño general del sistema', 'apariencia.disenoGeneral', state.draft.apariencia.disenoGeneral)}
          </div>
        </article>
        <article class="config-block config-subtle-block">
          <div class="config-block-head"><h3>Identidad por módulo</h3><span class="config-badge is-soft">Centralizada</span></div>
          <div class="identity-list">
            ${identidad.map((item) => `
              <div class="identity-row">
                <div>
                  <strong>${item.modulo}</strong>
                  <p>${item.familia}</p>
                </div>
                <span class="identity-swatch" style="background:${item.color}; color:${getContrastColor(item.color)};">${item.color}</span>
              </div>
            `).join('')}
          </div>
          <div class="theme-preview">
            <div class="theme-preview-shell">
              <div class="theme-preview-block">
                <span>Bloque principal</span>
                <strong>${palette.bloquePrincipal}</strong>
              </div>
              <div class="theme-preview-subblock">
                <span>Subbloque</span>
                <strong>${palette.subbloque}</strong>
              </div>
              <button type="button" class="config-btn config-btn-active">Activo</button>
              <button type="button" class="config-btn config-btn-critical">Crítico</button>
            </div>
          </div>
        </article>
      </div>
    `
  },
  alertas: () => {
    const alertas = state.draft.alertas
    return `
      <div class="config-stack">
        <article class="config-block">
          <div class="config-block-head"><h3>Motor de alertas</h3><button type="button" class="config-btn" data-action="add-alert">Agregar regla</button></div>
          <div class="config-inline-grid">
            ${toggleField('Alimenta panel principal', 'alertas.alimentaPanelPrincipal', alertas.alimentaPanelPrincipal)}
            ${toggleField('Requiere confirmación por defecto', 'alertas.requiereConfirmacion', alertas.requiereConfirmacion)}
          </div>
          <div class="config-table-wrap">
            <table class="config-table">
              <thead>
                <tr><th>Regla</th><th>Origen</th><th>Anticipación</th><th>Asignación</th><th>Destino</th><th>Estado</th></tr>
              </thead>
              <tbody>
                ${alertas.reglas.map((rule) => `
                  <tr>
                    <td><strong>${rule.nombre}</strong><span>${rule.confirmacion ? 'Requiere confirmación' : 'Sin confirmación obligatoria'}</span></td>
                    <td>${rule.origen}</td>
                    <td>${rule.anticipacion}</td>
                    <td>${rule.asignadoA}</td>
                    <td>${rule.destino}</td>
                    <td><button type="button" class="config-btn ${rule.activa ? 'config-btn-active' : ''}" data-action="toggle-rule" data-payload="${rule.id}">${rule.activa ? 'Activa' : 'Inactiva'}</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    `
  },
  plantillas: () => {
    const plantillas = state.draft.plantillas
    return `
      <div class="config-stack">
        <article class="config-block">
          <div class="config-block-head"><h3>Biblioteca de plantillas</h3><button type="button" class="config-btn" data-action="add-template">Nueva plantilla</button></div>
          <div class="template-grid">
            ${plantillas.plantillas.map((template) => `
              <article class="template-card">
                <div>
                  <span class="config-chip">${template.materia}</span>
                  <h4>${template.nombre}</h4>
                  <p>${template.formato} · ${template.firma}</p>
                </div>
                <div class="table-actions">
                  <span class="table-pill ${template.estado === 'Activa' ? 'is-active' : 'is-soft'}">${template.estado}</span>
                  <button type="button" class="config-btn config-btn-critical" data-action="remove-template" data-payload="${template.id}">Eliminar</button>
                </div>
              </article>
            `).join('')}
          </div>
        </article>
        <article class="config-block config-subtle-block">
          <div class="config-block-head"><h3>Reglas institucionales</h3><span class="config-badge">Preparadas para exportación Word / PDF</span></div>
          <div class="config-form-grid">
            ${textAreaField('Encabezados', 'plantillas.encabezado', plantillas.encabezado)}
            ${textAreaField('Pies de página', 'plantillas.piePagina', plantillas.piePagina)}
            ${textAreaField('Firmas', 'plantillas.firma', plantillas.firma)}
            ${textAreaField('Estructura principal y otrosí', 'plantillas.principalYOtrosi', plantillas.principalYOtrosi)}
            ${textAreaField('Reglas de cita', 'plantillas.reglasCita', plantillas.reglasCita)}
            ${textAreaField('Regla general de formatos', 'plantillas.reglaGeneralFormatos', plantillas.reglaGeneralFormatos)}
            ${textAreaField('Textos institucionales frecuentes', 'plantillas.textosFrecuentes', plantillas.textosFrecuentes)}
          </div>
        </article>
      </div>
    `
  },
  ia: () => {
    const ia = state.draft.ia
    return `
      <div class="config-grid-2">
        <article class="config-block">
          <div class="config-block-head"><h3>Fuentes y prioridades</h3><span class="config-badge">Preparado para motor jurídico</span></div>
          <div class="source-list">
            ${ia.priorizaFuentes.map((source, index) => `
              <div class="rank-row"><span>#${index + 1}</span><strong>${source}</strong></div>
            `).join('')}
          </div>
          <div class="config-form-grid compact-gap">
            ${rangeField('Peso del estilo del abogado', 'ia.pesoEstiloAbogado', ia.pesoEstiloAbogado)}
            ${rangeField('Peso del estilo del estudio', 'ia.pesoEstiloEstudio', ia.pesoEstiloEstudio)}
          </div>
          <div class="config-inline-grid">
            ${toggleField('Consultar causas similares', 'ia.consultaCausasSimilares', ia.consultaCausasSimilares)}
            ${toggleField('Consultar reuniones o actas', 'ia.consultaReunionesActas', ia.consultaReunionesActas)}
            ${toggleField('Consultar jurisprudencia', 'ia.consultaJurisprudencia', ia.consultaJurisprudencia)}
            ${toggleField('Consultar doctrina', 'ia.consultaDoctrina', ia.consultaDoctrina)}
            ${toggleField('Consultar normativa vigente', 'ia.consultaNormativa', ia.consultaNormativa)}
            ${toggleField('Exigir revisión humana', 'ia.revisionHumanaObligatoria', ia.revisionHumanaObligatoria)}
          </div>
        </article>
        <article class="config-block config-subtle-block">
          <div class="config-block-head"><h3>Automatización y borradores</h3><span class="config-badge is-soft">Conexión lógica lista</span></div>
          <div class="automation-switcher">
            ${['Manual', 'Asistida', 'Semi-automática'].map((mode) => `
              <button type="button" class="config-btn ${ia.automatizacion === mode ? 'config-btn-active' : ''}" data-action="change-automation" data-value="${mode}">${mode}</button>
            `).join('')}
          </div>
          <div class="config-form-grid">
            ${textAreaField('Reglas de redacción', 'ia.reglasRedaccion', ia.reglasRedaccion)}
            ${textAreaField('Reglas de cita', 'ia.reglasCita', ia.reglasCita)}
            ${textAreaField('Comportamiento de borradores', 'ia.borradores', ia.borradores)}
          </div>
        </article>
      </div>
    `
  },
  estilo: () => {
    const estilo = state.draft.estilo
    return `
      <div class="config-grid-2">
        <article class="config-block">
          <div class="config-block-head"><h3>Perfil de redacción</h3><span class="config-badge">Base reusable</span></div>
          <div class="config-form-grid">
            ${textField('Nombre del abogado', 'estilo.nombreAbogado', estilo.nombreAbogado)}
            ${textField('Nombre del estudio', 'estilo.nombreEstudio', estilo.nombreEstudio)}
            ${textAreaField('Estilo de redacción', 'estilo.estiloRedaccion', estilo.estiloRedaccion)}
            ${textAreaField('Estructura usual', 'estilo.estructuraUsual', estilo.estructuraUsual)}
            ${textAreaField('Tono argumentativo', 'estilo.tonoArgumentativo', estilo.tonoArgumentativo)}
            ${textAreaField('Fórmulas frecuentes', 'estilo.formulasFrecuentes', estilo.formulasFrecuentes)}
            ${textAreaField('Modo de peticionar', 'estilo.modoPeticionar', estilo.modoPeticionar)}
            ${textAreaField('Uso de subsidios', 'estilo.usoSubsidios', estilo.usoSubsidios)}
            ${textAreaField('Reglas propias del estudio', 'estilo.reglasPropias', estilo.reglasPropias)}
            ${textAreaField('Criterios de revisión', 'estilo.criteriosRevision', estilo.criteriosRevision)}
          </div>
        </article>
        <article class="config-block config-subtle-block">
          <div class="config-block-head"><h3>Preparación para aprendizaje futuro</h3><span class="config-badge is-soft">Pendiente de backend especializado</span></div>
          <div class="empty-illustration">
            <strong>Motor preparado</strong>
            <p>${estilo.aprendizajePreparado}</p>
            <ul>
              <li>Reutilización de escritos previos por abogado.</li>
              <li>Patrones del estudio para escritos recurrentes.</li>
              <li>Checklist de revisión antes de marcar un borrador como listo.</li>
            </ul>
          </div>
        </article>
      </div>
    `
  },
  integraciones: () => {
    const integraciones = state.draft.integraciones
    return `
      <div class="config-stack">
        <article class="config-block">
          <div class="config-block-head"><h3>Servicios e integraciones</h3><span class="config-badge">Estructura lista para conectores futuros</span></div>
          <div class="integration-grid">
            ${integraciones.servicios.map((service) => `
              <article class="integration-card">
                <div>
                  <h4>${service.nombre}</h4>
                  <p>${service.detalle}</p>
                </div>
                <div class="table-actions">
                  <span class="table-pill ${service.estado.includes('Preparado') ? 'is-active' : 'is-soft'}">${service.estado}</span>
                  <button type="button" class="config-btn" data-action="toggle-service" data-payload="${service.id}">${service.estado.includes('Preparado') ? 'Marcar parcial' : 'Marcar preparado'}</button>
                </div>
              </article>
            `).join('')}
          </div>
        </article>
        <article class="config-block config-subtle-block">
          <div class="config-block-head"><h3>Parámetros base</h3><span class="config-badge is-soft">Persistencia local</span></div>
          <div class="config-form-grid">
            ${textField('Correo remitente', 'integraciones.correoRemitente', integraciones.correoRemitente)}
            ${textField('Webhook base', 'integraciones.webhookBase', integraciones.webhookBase)}
            ${textField('Proveedor de almacenamiento', 'integraciones.proveedorAlmacenamiento', integraciones.proveedorAlmacenamiento)}
            ${textAreaField('Observaciones', 'integraciones.observaciones', integraciones.observaciones)}
          </div>
        </article>
      </div>
    `
  },
  catalogos: () => {
    const listas = state.draft.catalogos.listas
    return `
      <div class="config-stack">
        <article class="config-block">
          <div class="config-block-head"><h3>Listas maestras</h3><button type="button" class="config-btn" data-action="add-catalog-item">Agregar catálogo</button></div>
          <div class="catalog-grid">
            ${listas.map((list) => `
              <article class="catalog-card">
                <div class="catalog-head">
                  <h4>${list.nombre}</h4>
                  <button type="button" class="config-btn config-btn-critical" data-action="remove-catalog-group" data-payload="${list.nombre}">Eliminar</button>
                </div>
                <div class="chip-list">
                  ${list.items.map((item) => `<span class="config-chip">${item}</span>`).join('')}
                </div>
              </article>
            `).join('')}
          </div>
        </article>
      </div>
    `
  },
  documentos: () => {
    const documentos = state.draft.documentos
    return `
      <div class="config-grid-2">
        <article class="config-block">
          <div class="config-block-head"><h3>Reglas documentales</h3><span class="config-badge">Preparadas para repositorio central</span></div>
          <div class="config-form-grid">
            ${textAreaField('Estructura de carpetas', 'documentos.estructuraCarpetas', documentos.estructuraCarpetas)}
            ${textField('Peso máximo por archivo (MB)', 'documentos.pesoMaximoMb', documentos.pesoMaximoMb)}
            ${textAreaField('Nomenclatura', 'documentos.nomenclatura', documentos.nomenclatura)}
            ${textAreaField('Versionado', 'documentos.versionado', documentos.versionado)}
            ${textAreaField('Permisos sobre documentos', 'documentos.permisos', documentos.permisos)}
          </div>
        </article>
        <article class="config-block config-subtle-block">
          <div class="config-block-head"><h3>Categorías y tipos permitidos</h3><span class="config-badge is-soft">Listo para validación backend</span></div>
          <div class="chip-list">${documentos.categorias.map((item) => `<span class="config-chip">${item}</span>`).join('')}</div>
          <div class="chip-list">${documentos.tiposPermitidos.map((item) => `<span class="config-chip">.${item}</span>`).join('')}</div>
        </article>
      </div>
    `
  },
  seguridad: () => {
    const seguridad = state.draft.seguridad
    return `
      <div class="config-grid-2">
        <article class="config-block">
          <div class="config-block-head"><h3>Controles sensibles</h3><span class="config-badge">Preparados para auditoría persistente</span></div>
          <div class="config-form-grid">
            ${textField('Cambio de contraseña', 'seguridad.cambioContrasena', seguridad.cambioContrasena)}
            ${textField('Cierre de sesión automático', 'seguridad.cierreSesionAutomatico', seguridad.cierreSesionAutomatico)}
            ${textAreaField('Actividad del usuario', 'seguridad.actividadUsuario', seguridad.actividadUsuario)}
            ${textAreaField('Auditoría básica', 'seguridad.auditoria', seguridad.auditoria)}
          </div>
          <div class="chip-list">${seguridad.permisosSensibles.map((item) => `<span class="config-chip is-critical">${item}</span>`).join('')}</div>
        </article>
        <article class="config-block config-subtle-block">
          <div class="config-block-head"><h3>Sesiones activas</h3><span class="config-badge is-soft">Visualización funcional</span></div>
          <div class="session-list">
            ${seguridad.sesionesActivas.map((session) => `
              <article class="session-card">
                <div>
                  <strong>${session.dispositivo}</strong>
                  <p>${session.ubicacion}</p>
                </div>
                <div>
                  <span class="table-pill ${session.estado === 'Actual' ? 'is-active' : 'is-soft'}">${session.estado}</span>
                  <p>${session.ultimoAcceso}</p>
                </div>
              </article>
            `).join('')}
          </div>
        </article>
      </div>
    `
  },
  respaldo: () => {
    const respaldo = state.draft.respaldo
    return `
      <div class="config-grid-2">
        <article class="config-block">
          <div class="config-block-head"><h3>Continuidad operativa</h3><span class="config-badge">Preparada para persistencia futura</span></div>
          <div class="config-form-grid">
            ${textField('Exportación de datos', 'respaldo.exportacionDatos', respaldo.exportacionDatos)}
            ${textField('Importación', 'respaldo.importacionDatos', respaldo.importacionDatos)}
            ${textField('Respaldos', 'respaldo.respaldos', respaldo.respaldos)}
            ${textField('Restauración', 'respaldo.restauracion', respaldo.restauracion)}
            ${textAreaField('Mantenimiento de registros', 'respaldo.mantenimientoRegistros', respaldo.mantenimientoRegistros)}
            ${textAreaField('Limpieza o normalización de catálogos', 'respaldo.limpiezaCatalogos', respaldo.limpiezaCatalogos)}
          </div>
        </article>
        <article class="config-block config-subtle-block">
          <div class="config-block-head"><h3>Acciones disponibles</h3><span class="config-badge is-soft">Funcionales en frontend</span></div>
          <div class="maintenance-actions">
            <button type="button" class="config-btn" id="maintenanceExportBtn">Exportar configuración</button>
            <button type="button" class="config-btn config-btn-critical" id="maintenanceResetBtn">Restaurar predeterminados</button>
          </div>
          <p class="config-helper">El módulo ya exporta la configuración actual a JSON y puede restaurar la base predeterminada sin afectar otros módulos.</p>
        </article>
      </div>
    `
  },
}

function textField(label, path, value, span = '') {
  return `
    <label class="config-field ${span}">
      <span>${label}</span>
      <input type="text" value="${escapeHtml(String(value ?? ''))}" data-field-live="${path}">
    </label>
  `
}

function textAreaField(label, path, value) {
  return `
    <label class="config-field wide">
      <span>${label}</span>
      <textarea rows="4" data-field-live="${path}">${escapeHtml(String(value ?? ''))}</textarea>
    </label>
  `
}

function colorField(label, path, value) {
  return `
    <label class="config-field">
      <span>${label}</span>
      <div class="color-input-row">
        <input type="color" value="${escapeHtml(value)}" data-field="${path}" data-preview-theme="true">
        <input type="text" value="${escapeHtml(value)}" data-field-live="${path}" data-preview-theme="true">
      </div>
    </label>
  `
}

function toggleField(label, path, checked) {
  return `
    <label class="toggle-row toggle-card">
      <input type="checkbox" ${checked ? 'checked' : ''} data-field="${path}">
      <span>${label}</span>
    </label>
  `
}

function rangeField(label, path, value) {
  return `
    <label class="config-field wide">
      <span>${label}: <strong>${value}%</strong></span>
      <input type="range" min="0" max="100" step="5" value="${value}" data-field="${path}">
    </label>
  `
}

function updatePath(path, value) {
  const keys = path.split('.')
  let pointer = state.draft
  keys.slice(0, -1).forEach((key) => {
    pointer = pointer[key]
  })
  pointer[keys.at(-1)] = value
}

function updateRolePermission(checkbox) {
  const { module, actionName } = checkbox.dataset
  const adminUser = state.draft.usuarios.users[0]
  const current = new Set(adminUser.permisos[module] || [])
  if (checkbox.checked) current.add(actionName)
  else current.delete(actionName)
  adminUser.permisos[module] = [...current]
  renderStatus('Permisos base actualizados. Pendiente guardar.')
}

function toggleAlertRule(id) {
  const rule = state.draft.alertas.reglas.find((item) => item.id === id)
  if (!rule) return
  rule.activa = !rule.activa
  render()
}

function toggleServicePrepared(id) {
  const service = state.draft.integraciones.servicios.find((item) => item.id === id)
  if (!service) return
  service.estado = service.estado.includes('Preparado') ? 'Configuración parcial' : 'Preparado'
  render()
}

function openUserModal(userId = null) {
  state.modalOpen = true
  state.editingUserId = userId
  const user = state.draft.usuarios.users.find((item) => item.id === userId)
  els.userModalTitle.textContent = user ? 'Editar usuario' : 'Nuevo usuario'
  els.userForm.reset()
  els.userForm.querySelector('[name="nombre"]').value = user?.nombre || ''
  els.userForm.querySelector('[name="correo"]').value = user?.correo || ''
  els.userForm.querySelector('[name="rol"]').value = user?.rol || state.draft.usuarios.roles[0]
  els.userForm.querySelector('[name="estado"]').value = user?.estado || 'Activo'
  els.userModal.hidden = false
}

function closeUserModal() {
  state.modalOpen = false
  state.editingUserId = null
  els.userModal.hidden = true
}

function handleUserSubmit(event) {
  event.preventDefault()
  const formData = new FormData(event.currentTarget)
  const payload = {
    nombre: String(formData.get('nombre') || '').trim(),
    correo: String(formData.get('correo') || '').trim(),
    rol: String(formData.get('rol') || '').trim(),
    estado: String(formData.get('estado') || 'Activo').trim(),
  }

  if (!payload.nombre || !payload.correo) {
    renderStatus('Nombre y correo son obligatorios.', true)
    return
  }

  if (state.editingUserId) {
    const user = state.draft.usuarios.users.find((item) => item.id === state.editingUserId)
    if (user) Object.assign(user, payload)
  } else {
    state.draft.usuarios.users.unshift({
      id: `usr-${crypto.randomUUID()}`,
      ...payload,
      permisos: Object.fromEntries(state.draft.usuarios.modules.map((module) => [module, ['Ver']])),
    })
  }

  closeUserModal()
  render()
}

function toggleUserStatus(id) {
  const user = state.draft.usuarios.users.find((item) => item.id === id)
  if (!user) return
  user.estado = user.estado === 'Activo' ? 'Inactivo' : 'Activo'
  render()
}

function removeTemplate(id) {
  state.draft.plantillas.plantillas = state.draft.plantillas.plantillas.filter((item) => item.id !== id)
  render()
}

function addTemplate() {
  state.draft.plantillas.plantillas.unshift({
    id: `pl-${crypto.randomUUID()}`,
    nombre: 'Nueva plantilla pendiente',
    materia: 'General',
    formato: 'Word / PDF',
    firma: 'Por definir',
    estado: 'Borrador',
  })
  render()
}

function addAlertRule() {
  state.draft.alertas.reglas.unshift({
    id: `al-${crypto.randomUUID()}`,
    nombre: 'Nueva regla de alerta',
    origen: 'Configuración',
    anticipacion: 'Pendiente',
    asignadoA: 'Por definir',
    destino: 'Panel principal',
    confirmacion: false,
    activa: false,
  })
  render()
}

function addCatalogGroup() {
  state.draft.catalogos.listas.unshift({
    nombre: `Nuevo catálogo ${state.draft.catalogos.listas.length + 1}`,
    items: ['Elemento inicial'],
  })
  render()
}

function removeCatalogGroup(name) {
  state.draft.catalogos.listas = state.draft.catalogos.listas.filter((item) => item.nombre !== name)
  render()
}

function setAutomation(mode) {
  state.draft.ia.automatizacion = mode
  render()
}

function handleSaveAll() {
  state.settings = saveSettings(state.draft)
  state.draft = deepClone(state.settings)
  renderStatus(`Configuración guardada correctamente (${formatDateTime(state.settings.meta.updatedAt)}).`)
  renderSummary()
}

function handleResetAll() {
  state.settings = resetSettings()
  state.draft = deepClone(state.settings)
  applyThemePreview()
  render()
  renderStatus('Se restauró la configuración predeterminada.')
}

function renderStatus(message, isError = false) {
  els.statusText.textContent = message
  els.statusText.classList.toggle('is-error', isError)
}

function applyThemePreview() {
  const palette = state.draft.apariencia.coloresGenerales
  const root = document.documentElement
  root.style.setProperty('--settings-bg', palette.fondoGeneral)
  root.style.setProperty('--settings-shell', palette.contenedorPrincipal)
  root.style.setProperty('--settings-block', palette.bloquePrincipal)
  root.style.setProperty('--settings-subblock', palette.subbloque)
  root.style.setProperty('--settings-border', palette.borde)
  root.style.setProperty('--settings-title', palette.titulo)
  root.style.setProperty('--settings-active', palette.activo)
  root.style.setProperty('--settings-critical', palette.critico)
  root.style.setProperty('--settings-white', palette.botonBase)
  root.style.setProperty('--settings-text', palette.textoOscuro)
  root.style.setProperty('--settings-text-soft', palette.textoSecundario)
  root.style.setProperty('--settings-text-on-dark', palette.textoClaro)
  root.style.setProperty('--settings-text-on-dark-soft', palette.textoClaroSecundario)
}

function getContrastColor(hex) {
  const normalized = hex.replace('#', '')
  const value = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.62 ? '#111111' : '#FFFFFF'
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

window.addEventListener('click', (event) => {
  if (event.target.id === 'maintenanceExportBtn') exportSettings(state.draft)
  if (event.target.id === 'maintenanceResetBtn') handleResetAll()
})

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.modalOpen) closeUserModal()
})

window.__alphaConfigDebug = {
  get state() {
    return state
  },
  reset() {
    state.settings = deepClone(defaultSettings)
    state.draft = deepClone(defaultSettings)
    saveSettings(state.settings)
    render()
  },
}
