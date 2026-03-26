const DEFAULT_HITO = {
  name: 'Presentación',
  description: 'Ingreso formal del procedimiento.',
  term: 'plazo variable según norma/resolución',
  startsFrom: 'Desde presentación o resolución de admisibilidad',
  triggerDocument: 'Escrito inicial o resolución del tribunal/autoridad',
  outputRoute: 'Con oposición / sin oposición',
  linkedAlert: 'Actuación pendiente'
}

function slugify(value = '') {
  return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function createProcedure(materia, name, overrides = {}) {
  return {
    materia,
    name,
    slug: slugify(`${materia}-${name}`),
    competentBody: overrides.competentBody || 'Tribunal u órgano competente según norma especial',
    startForm: overrides.startForm || 'Solicitud, demanda, recurso o requerimiento según procedimiento',
    legalBasis: overrides.legalBasis || 'Normativa procesal especial aplicable',
    editableByUser: true,
    milestones: overrides.milestones || [DEFAULT_HITO],
    routes: overrides.routes || [
      { name: 'sin oposición', condition: 'No existe oposición o impugnación', nextMilestone: 'Resolución', legalTerm: 'plazo variable según norma/resolución' },
      { name: 'con oposición', condition: 'Se deduce oposición o recurso', nextMilestone: 'Prueba/traslado', legalTerm: 'plazo variable según norma/resolución' }
    ],
    alerts: overrides.alerts || [
      { type: 'actuacion_pendiente', milestone: 'Presentación', route: 'sin oposición', term: 'plazo variable según norma/resolución' },
      { type: 'vencimiento_plazo', milestone: 'Presentación', route: 'con oposición', term: 'plazo variable según norma/resolución' }
    ]
  }
}

const RAW = [
  ['Civil / CPC / Código Civil', ['Medidas prejudiciales preparatorias','Medidas prejudiciales probatorias','Medidas prejudiciales precautorias','Medidas precautorias dentro del juicio','Juicio ordinario de mayor cuantía','Juicio ordinario de menor cuantía','Juicio de mínima cuantía','Procedimiento incidental','Procedimiento sumario','Juicio ejecutivo de obligación de dar','Juicio ejecutivo de obligación de hacer','Juicio ejecutivo de obligación de no hacer','Cumplimiento incidental de sentencia','Juicios sobre cuentas','Juicios sobre pago de ciertos honorarios','Querella de amparo','Querella de restitución','Querella de restablecimiento','Denuncia de obra nueva','Denuncia de obra ruinosa','Interdictos especiales','Habilitación para comparecer en juicio','Nombramiento de tutores y curadores','Discernimiento','Inventario solemne','Sucesión por causa de muerte','Insinuación de donaciones','Pago por consignación','Información para perpetua memoria']],
  ['Arbitraje y Partición', ['Árbitro de derecho','Árbitro arbitrador','Árbitro mixto','Juez partidor']],
  ['Recursos civiles y disciplinarios', ['Reposición','Aclaración / rectificación / enmienda','Apelación civil','Casación en la forma','Casación en el fondo','Revisión civil','Queja disciplinaria','Recurso de queja']],
  ['Familia', ['Procedimiento ordinario o común de familia','Protección de niños, niñas y adolescentes','Violencia intrafamiliar','Actos no contenciosos de familia','Contravencional de familia']],
  ['Penal', ['Ordinario con juicio oral','Simplificado penal','Monitorio penal','Acción penal privada','Abreviado','Querella de capítulos','Extradición activa','Extradición pasiva','Extradición pasiva simplificada','Aplicación exclusiva de medidas de seguridad','Nulidad penal']],
  ['Minería', ['Constitución de concesión de exploración','Pedimento','Constitución de concesión de explotación','Manifestación','Solicitud de mensura','Sentencia constitutiva','Oposición a la mensura','Nulidad de concesión minera','Servidumbres mineras','Remate de pertenencias o concesiones']],
  ['JPL / Tránsito / Consumidor / Alcoholes', ['Ordinario ante JPL','Infraccional de tránsito','Contravenciones de alcoholes de competencia JPL','Gestiones de preparación de la vía ejecutiva','Notificación de protesto de letras y cheques','Juicios ejecutivos de competencia JPL','Terminación de arrendamiento en sede JPL','Consumidor individual','Consumidor colectivo o difuso','Procedimiento voluntario colectivo de consumo']],
  ['Pesca', ['Sancionatorio LGPA','Caducidad de concesiones o autorizaciones','Reclamación administrativa por caducidad','Procedimientos sobre concesiones y autorizaciones de acuicultura','Relocalización de concesiones']],
  ['Aguas', ['Constitución de derechos de aprovechamiento','Regularización de derechos','Perfeccionamiento del derecho','Cambio de punto de captación','Organización de comunidades de aguas','Organización de comunidades de aguas subterráneas','Juntas de vigilancia y asociaciones de canalistas','Procedimientos administrativos y judiciales sobre organizaciones de usuarios']],
  ['Comercio', ['Declaración de avería gruesa o común','Impugnación de la legitimidad de la avería común','Liquidación o arreglo de avería común','Nombramiento judicial de perito liquidador','Procedimiento arbitral en avería común']],
  ['Tributario', ['Procedimiento general de reclamaciones','Reclamo por vulneración de derechos','Declaración judicial de abuso o simulación','Procedimiento general para sanciones','Procedimientos especiales para ciertas multas']],
  ['Electricidad / Concesiones eléctricas', ['Concesión eléctrica provisional','Concesión eléctrica definitiva','Constitución de servidumbres eléctricas','Aprobación de planos especiales de servidumbre']],
  ['Arrendamiento', ['Terminación del contrato y restitución','Restitución anticipada','Monitorio de cobro de rentas y cuentas','Restitución consecuencial']],
  ['Código Orgánico de Tribunales', ['Contiendas de competencia','Cuestiones de competencia','Implicancias','Recusaciones','Nombramiento de árbitros','Juicio arbitral de derecho','Juicio arbitral arbitrador','Juicio arbitral mixto','Recurso de queja','Apelación disciplinaria','Reclamación económica','Visitas extraordinarias / ministros en visita']],
  ['Laboral', ['Aplicación general laboral','Tutela laboral','Monitorio laboral','Reclamación de multas y resoluciones administrativas','Cumplimiento de sentencia laboral','Ejecución de títulos ejecutivos laborales','Cobranza judicial de cotizaciones','Sistema único de cobranza de cotizaciones','Negociación colectiva reglada','Servicios mínimos y equipos de emergencia','Empresas sin derecho a huelga','Arbitraje obligatorio laboral','Investigación de acoso sexual','Investigación de acoso laboral','Investigación de violencia ejercida por terceros','Nulidad laboral']],
  ['Insolvencia y Reemprendimiento', ['Acuerdo de reorganización extrajudicial','Reorganización de empresa deudora','Liquidación de empresa deudora','Liquidación voluntaria','Liquidación forzosa','Renegociación de persona deudora','Liquidación simplificada','Reorganización simplificada']],
  ['Constitucional y administrativo especial', ['Amparo','Protección','Inaplicabilidad por inconstitucionalidad','Reclamación de ilegalidad municipal']]
]

export const MONITORING_CATALOG_SEED = RAW.flatMap(([materia, names]) => names.map((name) => createProcedure(materia, name)))
