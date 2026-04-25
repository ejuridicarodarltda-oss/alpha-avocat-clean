import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') || 'gpt-4.1-mini'
const OPENAI_TIMEOUT_MS = Number(Deno.env.get('OPENAI_TIMEOUT_MS') || 90000)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ChatEntry = { role: 'user' | 'assistant'; content: string }

type PromptInput = {
  cause_id?: string
  rol?: string
  tribunal?: string
  caratula?: string
  tipoEscrito?: string
  tipo_escrito?: string
  instrucciones?: string
  instrucciones_usuario?: string
  ajuste?: string
  stylePrompt?: string
  cause?: Record<string, unknown>
  antecedentes?: Array<Record<string, unknown>>
  documentosSeleccionados?: Array<Record<string, unknown>>
  documentos_seleccionados?: Array<Record<string, unknown>>
  history?: Array<ChatEntry>
  sessionId?: string
}

type HierarchyLevel =
  | 'acta'
  | 'caso'
  | 'normativa'
  | 'jurisprudencia'
  | 'doctrina'
  | 'instrucciones_abogado'
  | 'practica_forense'
  | 'otros'

const HIERARCHY_ORDER: Array<{ level: HierarchyLevel; label: string }> = [
  { level: 'acta', label: '1) Acta de entrevista del cliente' },
  { level: 'caso', label: '2) Caso concreto (hechos/documentos)' },
  { level: 'normativa', label: '3) Normativa aplicable' },
  { level: 'jurisprudencia', label: '4) Jurisprudencia pertinente' },
  { level: 'doctrina', label: '5) Doctrina relevante' },
  { level: 'instrucciones_abogado', label: '6) Instrucciones del abogado' },
  { level: 'practica_forense', label: '7) Práctica forense' },
]

function normalizeText(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function inferHierarchyLevel(item: Record<string, unknown>): HierarchyLevel {
  const name = normalizeText(item?.name)
  const category = normalizeText(item?.category)
  const content = normalizeText(String(item?.content || '').slice(0, 900))
  const haystack = `${category} ${name} ${content}`

  if (/(acta|entrevista|reunion cliente|minuta cliente)/.test(haystack)) return 'acta'
  if (/(normativa|codigo|cod\.|ley|decreto|reglamento|articulo)/.test(haystack)) return 'normativa'
  if (/(jurisprud|sentencia|fallo|rol|cs|corte suprema|corte de apelaciones)/.test(haystack)) return 'jurisprudencia'
  if (/(doctrina|tratado|manual|autor|articulo academico|revista juridica)/.test(haystack)) return 'doctrina'
  if (/(instruccion|lineamiento|estrategia|abogado|socio)/.test(haystack)) return 'instrucciones_abogado'
  if (/(practica forense|plantilla|formato tipo|machote|costumbre forense|estilo tribunal)/.test(haystack)) return 'practica_forense'
  if (/(hecho|documento|prueba|expediente|contrato|correo|whatsapp|anexo|causa)/.test(haystack)) return 'caso'
  return 'otros'
}

function renderAntecedente(item: Record<string, unknown>, i: number) {
  const snippet = String(item?.content || '').slice(0, 1400)
  return `${i + 1}. ${item?.name || 'Antecedente'} (${item?.category || 'Sin categoría'})\n${snippet || 'Sin contenido extraído.'}`
}

function buildPrompt(input: PromptInput) {
  const tipoEscrito = String(input?.tipoEscrito || input?.tipo_escrito || '').trim()
  const instrucciones = String(input?.instrucciones || input?.instrucciones_usuario || '').trim()
  const antecedentesRaw = Array.isArray(input?.antecedentes) && input.antecedentes.length
    ? input.antecedentes
    : (Array.isArray(input?.documentosSeleccionados) && input.documentosSeleccionados.length
      ? input.documentosSeleccionados
      : (Array.isArray(input?.documentos_seleccionados) ? input.documentos_seleccionados : []))

  const grouped = antecedentesRaw.reduce<Record<HierarchyLevel, Array<Record<string, unknown>>>>((acc, item) => {
    const level = inferHierarchyLevel(item)
    if (!acc[level]) acc[level] = []
    acc[level].push(item)
    return acc
  }, {
    acta: [],
    caso: [],
    normativa: [],
    jurisprudencia: [],
    doctrina: [],
    instrucciones_abogado: [],
    practica_forense: [],
    otros: [],
  })

  const causeInfo = {
    id: input?.cause_id || input?.cause?.id || null,
    rol: input?.rol || input?.cause?.rol || null,
    tribunal: input?.tribunal || input?.cause?.tribunal || null,
    caratula: input?.caratula || input?.cause?.caratula || null,
    ...(input?.cause || {}),
  }

  const hasActa = grouped.acta.length > 0
  const hasCaso = grouped.caso.length > 0
  const priorityStart = hasActa
    ? 'Existe acta: parte desde el interés del cliente y úsala como criterio rector sobre todo lo demás.'
    : (hasCaso
      ? 'No existe acta: parte desde los hechos/documentos del caso concreto.'
      : 'No hay acta ni hechos documentales claros: redacta con lo disponible sin inventar hechos y deja constancia de faltantes.')

  const hierarchySections = HIERARCHY_ORDER
    .filter(({ level }) => grouped[level].length > 0)
    .map(({ label, level }) => `${label}\n${grouped[level].map(renderAntecedente).join('\n\n')}`)
    .join('\n\n')

  const fallbackOthers = grouped.otros.length
    ? `Otros antecedentes no clasificados:\n${grouped.otros.map(renderAntecedente).join('\n\n')}`
    : 'Otros antecedentes no clasificados: ninguno.'

  return [
    `Tipo de escrito: ${tipoEscrito || 'No indicado'}`,
    `Instrucciones del abogado/usuario: ${instrucciones || 'Sin instrucciones adicionales'}`,
    `Ajuste de iteración: ${input?.ajuste || 'Sin ajuste'}`,
    `Estilo requerido: ${input?.stylePrompt || 'Jurídico chileno, tono forense técnico.'}`,
    `Contexto de causa: ${JSON.stringify(causeInfo, null, 2)}`,
    `Jerarquía obligatoria de insumos (de mayor a menor): ${HIERARCHY_ORDER.map((item) => item.label).join(' > ')}.`,
    `Criterio de inicio: ${priorityStart}`,
    'Reglas obligatorias: (a) prioriza siempre interés del cliente cuando exista acta; (b) no partas desde práctica forense; (c) no ignores hechos/documentos del caso; (d) usa jurisprudencia/doctrina solo si aportan al caso concreto; (e) si faltan niveles, continúa con los disponibles sin detenerte.',
    `Antecedentes clasificados por jerarquía:\n${hierarchySections || 'No hay antecedentes clasificados en la jerarquía.'}\n\n${fallbackOthers}`,
    'Entrega solo el borrador del escrito jurídico en español formal chileno. Si citas doctrina/jurisprudencia, incorpóralas únicamente cuando sean pertinentes y déjalas marcadas para pie de página.',
  ].join('\n\n')
}

function resolveDraftFromResponse(result: Record<string, unknown>) {
  const outputText = String(result?.output_text || '').trim()
  if (outputText) return outputText

  const output = Array.isArray(result?.output) ? result.output : []
  const chunks: string[] = []
  output.forEach((item: any) => {
    const content = Array.isArray(item?.content) ? item.content : []
    content.forEach((part: any) => {
      if (part?.type === 'output_text' && typeof part?.text === 'string') {
        chunks.push(part.text)
      }
    })
  })

  return chunks.join('\n').trim()
}

serve(async (req) => {
  console.log('FUNCTION EXECUTED')

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  if (!OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: 'Falta OPENAI_API_KEY en Supabase secrets' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  try {
    const payload: PromptInput = await req.json()
    const causeId = String(payload?.cause_id || payload?.cause?.id || '').trim()
    if (!causeId) {
      return new Response(JSON.stringify({ error: 'Falta cause_id para identificar la causa seleccionada.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const history: ChatEntry[] = Array.isArray(payload?.history) ? payload.history : []
    const messages = [
      {
        role: 'system',
        content: 'Eres abogado litigante chileno senior. Redacta escritos procesales sólidos, claros y accionables para revisión profesional.',
      },
      ...history.map((entry) => ({ role: entry.role, content: String(entry.content || '') })),
      { role: 'user', content: buildPrompt(payload) },
    ]

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort('timeout'), OPENAI_TIMEOUT_MS)

    let openAiResponse: Response
    try {
      openAiResponse = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          input: messages,
          temperature: 0.2,
        }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    const result = await openAiResponse.json().catch(() => ({}))
    if (!openAiResponse.ok) {
      const providerMessage = String(result?.error?.message || result?.message || 'Error en OpenAI Responses API')
      return new Response(JSON.stringify({
        error: providerMessage,
        provider: 'openai',
        provider_status: openAiResponse.status,
        provider_error: result?.error || null,
      }), {
        status: openAiResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const draft = resolveDraftFromResponse(result)
    if (!draft) {
      return new Response(JSON.stringify({ error: 'OpenAI respondió sin contenido de borrador utilizable.' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const responseHistory = [
      ...history,
      { role: 'user', content: String(payload?.ajuste || payload?.instrucciones || payload?.instrucciones_usuario || payload?.tipoEscrito || payload?.tipo_escrito || 'Solicitud de borrador') },
      { role: 'assistant', content: draft },
    ]

    return new Response(JSON.stringify({
      sessionId: payload?.sessionId || crypto.randomUUID(),
      draft,
      history: responseHistory.slice(-20),
      model: OPENAI_MODEL,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    console.error('ERROR EN FUNCTION:', e)

    return new Response(JSON.stringify({
      error: e?.message || 'error desconocido'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
})
