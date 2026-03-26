export const MONITORING_CATALOG_SEED = [
  {
    slug: 'juicio-ordinario-mayor-cuantia',
    materia: 'Civil',
    name: 'Juicio ordinario de mayor cuantía',
    competentBody: 'Juzgado Civil',
    startForm: 'Demanda ordinaria',
    legalBasis: 'Código de Procedimiento Civil',
    milestones: ['Demanda', 'Notificación', 'Contestación', 'Prueba', 'Sentencia'],
    routes: ['demanda directa', 'contesta', 'no contesta', 'recurso'],
    alerts: [{ title: 'Control de emplazamiento', urgency: 'alta' }]
  },
  {
    slug: 'procedimiento-familia-ordinario',
    materia: 'Familia',
    name: 'Procedimiento ordinario ante tribunales de familia',
    competentBody: 'Juzgado de Familia',
    startForm: 'Demanda de familia',
    legalBasis: 'Ley de Tribunales de Familia',
    milestones: ['Demanda', 'Audiencia preparatoria', 'Audiencia de juicio', 'Sentencia'],
    routes: ['admisible', 'inadmisible', 'acuerdo', 'sentencia'],
    alerts: [{ title: 'Preparar audiencia', urgency: 'media' }]
  }
]
