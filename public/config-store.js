const STORAGE_KEY = 'alpha-avocat:settings:v1'

const deepClone = (value) => JSON.parse(JSON.stringify(value))

export const categoryDefinitions = [
  { id: 'perfil', label: 'Perfil del estudio', icon: '🏛️', description: 'Identidad institucional y datos base para documentos.' },
  { id: 'usuarios', label: 'Usuarios y permisos', icon: '👥', description: 'Roles, accesos por módulo y administración del equipo.' },
  { id: 'apariencia', label: 'Apariencia e identidad visual', icon: '🎨', description: 'Paleta transversal, tipografía y reglas visuales del sistema.' },
  { id: 'alertas', label: 'Alertas y notificaciones', icon: '🔔', description: 'Reglas de anticipación, destinatarios y criticidad.' },
  { id: 'plantillas', label: 'Plantillas y formatos', icon: '🧾', description: 'Modelos, firmas, citas y exportaciones.' },
  { id: 'ia', label: 'Producción IA / Motor jurídico', icon: '🧠', description: 'Fuentes, automatización y revisión humana.' },
  { id: 'estilo', label: 'Estilo del abogado y del estudio', icon: '✍️', description: 'Tono argumentativo y criterios propios de redacción.' },
  { id: 'integraciones', label: 'Integraciones', icon: '🔗', description: 'Conectores con Poder Judicial, correo, videollamadas y almacenamiento.' },
  { id: 'catalogos', label: 'Catálogos maestros', icon: '🗂️', description: 'Listas maestras y estructuras base del sistema.' },
  { id: 'documentos', label: 'Documentos y almacenamiento', icon: '🗄️', description: 'Estructura de carpetas, nomenclatura y versionado.' },
  { id: 'seguridad', label: 'Seguridad', icon: '🔐', description: 'Contraseñas, sesiones activas y auditoría.' },
  { id: 'respaldo', label: 'Respaldo y mantenimiento', icon: '🛠️', description: 'Exportación, respaldos y tareas de normalización.' },
]

export const defaultSettings = {
  meta: {
    version: 1,
    updatedAt: null,
    preparedPersistence: 'localStorage adapter listo para backend futuro',
  },
  perfil: {
    nombreEstudio: 'Alpha Avocat',
    razonSocial: 'Alpha Avocat SpA',
    rut: '76.123.456-7',
    direccion: 'Av. Apoquindo 4501, Oficina 1204',
    ciudad: 'Santiago',
    correoGeneral: 'contacto@alphaavocat.cl',
    telefonos: '+56 9 5555 1234 · +56 2 2345 6789',
    sitioWeb: 'https://alphaavocat.cl',
    pieInstitucional: 'Alpha Avocat · Sistema de gestión jurídica inteligente',
    baseDocumentos: 'Usar encabezado institucional, identificación completa y datos tributarios del estudio.',
    logoName: 'logo-alpha-avocat.png',
  },
  usuarios: {
    roles: ['Administrador', 'Abogado', 'Procurador', 'Secretaria', 'Asistente', 'Solo lectura'],
    actions: ['Ver', 'Crear', 'Editar', 'Eliminar', 'Aprobar', 'Presentar', 'Administrar'],
    modules: ['Clientes', 'Agenda', 'Causas', 'Producción', 'Documentos', 'Configuración'],
    users: [
      {
        id: 'usr-1',
        nombre: 'Mario Rodríguez',
        correo: 'mario@alphaavocat.cl',
        rol: 'Administrador',
        estado: 'Activo',
        permisos: {
          Clientes: ['Ver', 'Crear', 'Editar', 'Administrar'],
          Agenda: ['Ver', 'Crear', 'Editar', 'Administrar'],
          Causas: ['Ver', 'Crear', 'Editar', 'Aprobar', 'Presentar', 'Administrar'],
          Producción: ['Ver', 'Crear', 'Editar', 'Aprobar'],
          Documentos: ['Ver', 'Crear', 'Editar', 'Eliminar'],
          Configuración: ['Ver', 'Editar', 'Administrar'],
        },
      },
      {
        id: 'usr-2',
        nombre: 'Constanza Herrera',
        correo: 'constanza@alphaavocat.cl',
        rol: 'Abogado',
        estado: 'Activo',
        permisos: {
          Clientes: ['Ver', 'Editar'],
          Agenda: ['Ver', 'Crear', 'Editar'],
          Causas: ['Ver', 'Crear', 'Editar', 'Presentar'],
          Producción: ['Ver', 'Crear', 'Editar'],
          Documentos: ['Ver', 'Crear', 'Editar'],
          Configuración: ['Ver'],
        },
      },
      {
        id: 'usr-3',
        nombre: 'Laura Pérez',
        correo: 'laura@alphaavocat.cl',
        rol: 'Secretaria',
        estado: 'Inactivo',
        permisos: {
          Clientes: ['Ver', 'Crear'],
          Agenda: ['Ver', 'Crear', 'Editar'],
          Causas: ['Ver'],
          Producción: ['Ver'],
          Documentos: ['Ver', 'Crear'],
          Configuración: ['Ver'],
        },
      },
    ],
  },
  apariencia: {
    coloresGenerales: {
      fondoGeneral: '#F6F8FA',
      contenedorPrincipal: '#E9EEF2',
      bloquePrincipal: '#D8E0E7',
      subbloque: '#C7D2DB',
      borde: '#A8B7C4',
      titulo: '#3C536B',
      activo: '#163A5F',
      critico: '#7A1E2C',
      botonBase: '#FFFFFF',
      textoOscuro: '#111111',
      textoSecundario: '#2B2B2B',
      textoClaro: '#FFFFFF',
      textoClaroSecundario: '#F4F4F4',
    },
    identidadModulos: [
      { modulo: 'Clientes', familia: 'Celeste turquesa', color: '#61C3D0' },
      { modulo: 'Agenda', familia: 'Lila', color: '#9A77C8' },
      { modulo: 'Causas', familia: 'Verde turquesa', color: '#4EB6A9' },
      { modulo: 'Configuración', familia: 'Neutro jurídico', color: '#163A5F' },
    ],
    tipografia: 'Inter, Arial, sans-serif',
    tamanoBase: '14px',
    estiloBotones: 'Blancos en reposo, azul jurídico activo, burdeo destructivo',
    bordes: '16px / 24px',
    sombras: 'Suaves, administrativas, sin saturación',
    iconografia: 'Lineal con apoyo de emoji semántico',
    logoPanel: 'logo-alpha-avocat.png',
    disenoGeneral: 'Sobrio, administrativo, modular y escalable',
  },
  alertas: {
    alimentaPanelPrincipal: true,
    requiereConfirmacion: true,
    canales: ['Panel principal', 'Listado interno', 'Correo electrónico'],
    reglas: [
      { id: 'al-1', nombre: 'Reunión 24 horas antes', origen: 'Agenda', anticipacion: '24 horas', asignadoA: 'Responsable del evento', destino: 'Panel principal', confirmacion: true, activa: true },
      { id: 'al-2', nombre: 'Reunión 1 hora antes', origen: 'Agenda', anticipacion: '1 hora', asignadoA: 'Participantes', destino: 'Correo y panel', confirmacion: false, activa: true },
      { id: 'al-3', nombre: 'Plazo fatal 7 días antes', origen: 'Causas', anticipacion: '7 días', asignadoA: 'Abogado a cargo', destino: 'Panel principal', confirmacion: true, activa: true },
      { id: 'al-4', nombre: 'Cliente sin seguimiento en 15 días', origen: 'Clientes', anticipacion: '15 días', asignadoA: 'Ejecutivo responsable', destino: 'Listado interno', confirmacion: false, activa: true },
      { id: 'al-5', nombre: 'Escrito pendiente de revisión', origen: 'Producción', anticipacion: 'Inmediata', asignadoA: 'Revisor designado', destino: 'Panel y correo', confirmacion: true, activa: true },
    ],
  },
  plantillas: {
    plantillas: [
      { id: 'pl-1', nombre: 'Demanda civil base', materia: 'Civil', formato: 'Word / PDF', firma: 'Socio director', estado: 'Activa' },
      { id: 'pl-2', nombre: 'Escrito de téngase presente', materia: 'General', formato: 'Word', firma: 'Abogado patrocinante', estado: 'Activa' },
      { id: 'pl-3', nombre: 'Carta de cobranza prejudicial', materia: 'Cobranza', formato: 'PDF', firma: 'Área comercial', estado: 'Borrador' },
    ],
    encabezado: 'Encabezado institucional completo con logo, razón social y RUT.',
    piePagina: 'Pie institucional con contacto, dirección y reserva de confidencialidad.',
    firma: 'Firma electrónica y nombre completo del abogado responsable.',
    principalYOtrosi: 'Mantener bloque principal separado del otrosí con numeración interna.',
    reglasCita: 'Usar citas normativas y jurisprudenciales en formato uniforme del estudio.',
    textosFrecuentes: 'Se tenga presente, en subsidio, por acompañado, con citación.',
  },
  ia: {
    priorizaFuentes: ['Normativa vigente', 'Jurisprudencia', 'Causas similares', 'Doctrina', 'Reuniones / actas'],
    pesoEstiloAbogado: 70,
    pesoEstiloEstudio: 85,
    consultaCausasSimilares: true,
    consultaReunionesActas: true,
    consultaJurisprudencia: true,
    consultaDoctrina: true,
    consultaNormativa: true,
    revisionHumanaObligatoria: true,
    automatizacion: 'Asistida',
    borradores: 'Generar primer borrador con checklist de validación',
    reglasRedaccion: 'Priorizar claridad, estructura escalonada y peticiones explícitas.',
    reglasCita: 'Citar fuentes con jerarquía normativa y referencias completas.',
  },
  estilo: {
    nombreAbogado: 'Mario Javier Rodríguez Ardiles',
    nombreEstudio: 'Alpha Avocat',
    estiloRedaccion: 'Técnico, claro, estructurado y persuasivo.',
    estructuraUsual: 'Hechos, derecho, análisis y petitorio en bloques legibles.',
    tonoArgumentativo: 'Firme, respetuoso y estratégico.',
    formulasFrecuentes: 'En subsidio, a mayor abundamiento, en mérito de lo expuesto.',
    modoPeticionar: 'Peticiones precisas, escaladas y numeradas.',
    usoSubsidios: 'Sí, cuando mejora la cobertura táctica del escrito.',
    reglasPropias: 'Consistencia terminológica, control de fuentes y revisión final humana.',
    criteriosRevision: 'Verificar hechos, citas, plazos, coherencia y documentos adjuntos.',
    aprendizajePreparado: 'Preparado para entrenar desde escritos previos del abogado y del estudio.',
  },
  integraciones: {
    servicios: [
      { id: 'int-1', nombre: 'Poder Judicial', estado: 'Preparado', detalle: 'Estructura lista para autenticación y consulta de causas.' },
      { id: 'int-2', nombre: 'Oficina Judicial Virtual', estado: 'Preparado', detalle: 'Campos listos para credenciales, certificados y flujo de presentación.' },
      { id: 'int-3', nombre: 'Correo electrónico', estado: 'Configuración parcial', detalle: 'Listo para SMTP/API, remitentes y notificaciones.' },
      { id: 'int-4', nombre: 'Zoom', estado: 'Preparado', detalle: 'Espacio reservado para API key, webhooks y creación de reuniones.' },
      { id: 'int-5', nombre: 'Google Meet', estado: 'Preparado', detalle: 'Conector planificado desde Google Workspace.' },
      { id: 'int-6', nombre: 'Almacenamiento documental', estado: 'Preparado', detalle: 'Abstracción lista para S3, Drive o repositorio interno.' },
    ],
    correoRemitente: 'notificaciones@alphaavocat.cl',
    webhookBase: '',
    proveedorAlmacenamiento: 'Pendiente de definir',
    observaciones: 'Las integraciones conservan estructura y puntos de extensión listos para backend.',
  },
  catalogos: {
    listas: [
      { nombre: 'Materias', items: ['Civil', 'Laboral', 'Familia', 'Penal'] },
      { nombre: 'Submaterias', items: ['Cobranza', 'Despido', 'Compensación económica', 'Querella'] },
      { nombre: 'Procedimientos', items: ['Ordinario', 'Monitorio', 'Tutela', 'Cobranza ejecutiva'] },
      { nombre: 'Tipos de audiencia', items: ['Preparación', 'Juicio', 'Revisión cautelar', 'Conciliación'] },
      { nombre: 'Estados procesales', items: ['Borrador', 'En trámite', 'Para revisión', 'Concluida'] },
      { nombre: 'Tipos de escritos', items: ['Demanda', 'Contestación', 'Escrito simple', 'Recurso'] },
      { nombre: 'Tipos de alertas', items: ['Plazo fatal', 'Seguimiento', 'Reunión', 'Documento'] },
      { nombre: 'Tipos de documentos', items: ['Contrato', 'Poder', 'Sentencia', 'Acta'] },
      { nombre: 'Tipos de reuniones', items: ['Cliente', 'Interna', 'Mediación', 'Audiencia virtual'] },
      { nombre: 'Tipos de intervinientes', items: ['Demandante', 'Demandado', 'Testigo', 'Perito'] },
      { nombre: 'Prioridades', items: ['Alta', 'Media', 'Baja'] },
      { nombre: 'Estados internos', items: ['Pendiente', 'En progreso', 'Bloqueado', 'Finalizado'] },
    ],
  },
  documentos: {
    estructuraCarpetas: 'Cliente / Causa / Escritos / Evidencia / Resoluciones / Exportados',
    categorias: ['Escritos', 'Documentos base', 'Prueba', 'Audios', 'Actas', 'Exportaciones'],
    tiposPermitidos: ['pdf', 'docx', 'xlsx', 'jpg', 'png', 'mp3'],
    pesoMaximoMb: 25,
    nomenclatura: 'AAAAMMDD_cliente_causa_tipo_version',
    versionado: 'Mayor y menor, con historial visible.',
    permisos: 'Herencia por rol y restricción por documento sensible.',
  },
  seguridad: {
    cambioContrasena: 'Habilitado con política mínima de 12 caracteres.',
    sesionesActivas: [
      { dispositivo: 'Chrome / macOS', ubicacion: 'Santiago, CL', ultimoAcceso: 'Hoy 09:12', estado: 'Actual' },
      { dispositivo: 'Safari / iPhone', ubicacion: 'Santiago, CL', ultimoAcceso: 'Ayer 19:34', estado: 'Activa' },
    ],
    permisosSensibles: ['Exportación masiva', 'Eliminación definitiva', 'Gestión de usuarios'],
    actividadUsuario: 'Auditoría básica preparada para registrar cambios relevantes.',
    cierreSesionAutomatico: '60 minutos de inactividad',
    auditoria: 'Registro inicial preparado para backend persistente.',
  },
  respaldo: {
    exportacionDatos: 'JSON / CSV preparado',
    importacionDatos: 'Asistente previsto para catálogos y usuarios',
    respaldos: 'Programación semanal preparada',
    restauracion: 'Flujo guiado con confirmación múltiple',
    mantenimientoRegistros: 'Normalización periódica de catálogos y datos huérfanos',
    limpiezaCatalogos: 'Detección de duplicados y desuso',
  },
}

export function loadSettings() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return deepClone(defaultSettings)
    const parsed = JSON.parse(raw)
    return mergeSettings(defaultSettings, parsed)
  } catch (error) {
    console.warn('No fue posible cargar configuración persistida.', error)
    return deepClone(defaultSettings)
  }
}

export function saveSettings(settings) {
  const payload = deepClone(settings)
  payload.meta = {
    ...payload.meta,
    version: defaultSettings.meta.version,
    updatedAt: new Date().toISOString(),
    preparedPersistence: defaultSettings.meta.preparedPersistence,
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  return payload
}

export function resetSettings() {
  const cloned = deepClone(defaultSettings)
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cloned))
  return cloned
}

export function exportSettings(settings) {
  const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `alpha-avocat-config-${new Date().toISOString().slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function searchCategories(query) {
  if (!query) return categoryDefinitions
  const normalized = query.toLowerCase().trim()
  return categoryDefinitions.filter((category) => {
    const haystack = `${category.label} ${category.description}`.toLowerCase()
    return haystack.includes(normalized)
  })
}

function mergeSettings(base, incoming) {
  if (Array.isArray(base)) {
    return Array.isArray(incoming) ? incoming : deepClone(base)
  }

  if (base && typeof base === 'object') {
    const output = {}
    for (const key of Object.keys(base)) {
      output[key] = mergeSettings(base[key], incoming?.[key])
    }
    if (incoming && typeof incoming === 'object') {
      for (const key of Object.keys(incoming)) {
        if (!(key in output)) output[key] = incoming[key]
      }
    }
    return output
  }

  return incoming ?? base
}
