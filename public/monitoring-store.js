import { supabase } from './app.js'
export const MONITORING_ALERTS_STORAGE_KEY = 'alpha_avocat_monitoreo_alertas_v1'

export async function syncMonitoringAlertsFromDatabase(storage = window.localStorage) {
  const { data, error } = await supabase
    .from('cause_monitoring_alerts')
    .select('id,case_id,alert_key,title,summary,foundation,urgency,deadline,status,source,trace,created_at')
    .neq('status', 'cerrada')
    .order('created_at', { ascending: false })

  if (error) {
    console.warn('[monitoreo] no fue posible sincronizar alertas desde base de datos', error.message)
    return []
  }

  const normalized = (data || []).map((item) => ({
    id: item.alert_key || item.id,
    caseId: item.case_id,
    caseRef: item.case_id,
    title: item.title,
    summary: item.summary,
    foundation: item.foundation,
    urgency: item.urgency || 'media',
    deadline: item.deadline,
    status: item.status || 'pendiente',
    source: item.source || 'Monitoreo',
    trace: item.trace || {},
    createdAt: item.created_at
  }))

  storage.setItem(MONITORING_ALERTS_STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}
