import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') || 'gpt-4.1-mini'
const OPENAI_TIMEOUT_MS = Number(Deno.env.get('OPENAI_TIMEOUT_MS') || 90000)
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS')
  || 'https://alphaavocat.cl,https://www.alphaavocat.cl,http://localhost:3000,http://localhost:5173')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)

function resolveCorsOrigin(origin: string | null) {
  if (!origin) return ALLOWED_ORIGINS[0] || '*'
  if (ALLOWED_ORIGINS.includes('*')) return '*'
  if (ALLOWED_ORIGINS.includes(origin)) return origin
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return origin
  return ALLOWED_ORIGINS[0] || 'https://alphaavocat.cl'
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

function buildCorsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': resolveCorsOrigin(origin),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

function buildPrompt(input: PromptInput) {
  const tipoEscrito = String(input?.tipoEscrito || input?.tipo_escrito || '').trim()
  const instrucciones = String(input?.instrucciones || input?.instrucciones_usuario || '').trim()
  const antecedentesRaw = Array.isArray(input?.antecedentes) && input.antecedentes.length
    ? input.antecedentes
    : (Array.isArray(input?.documentosSeleccionados) && input.documentosSeleccionados.length
      ? input.documentosSeleccionados
      : (Array.isArray(input?.documentos_seleccionados) ? input.documentos_seleccionados : []))

  const antecedentesText = antecedentesRaw.map((item: Record<string, unknown>, i: number) => {
    const snippet = String(item?.content || '').slice(0, 1800)
    return `${i + 1}. ${item?.name || 'Antecedente'} (${item?.category || 'Sin categoría'})\n${snippet}`
  }).join('\n\n')

  const causeInfo = {
    id: input?.cause_id || input?.cause?.id || null,
    rol: input?.rol || input?.cause?.rol || null,
    tribunal: input?.tribunal || input?.cause?.tribunal || null,
    caratula: input?.caratula || input?.cause?.caratula || null,
    ...(input?.cause || {}),
  }

  return [
    `Tipo de escrito: ${tipoEscrito || 'No indicado'}`,
    `Instrucciones del usuario: ${instrucciones || 'Sin instrucciones adicionales'}`,
    `Ajuste de iteración: ${input?.ajuste || 'Sin ajuste'}`,
    `Estilo requerido: ${input?.stylePrompt || 'Jurídico chileno, tono forense técnico.'}`,
    `Contexto de causa: ${JSON.stringify(causeInfo, null, 2)}`,
    `Antecedentes seleccionados:\n${antecedentesText || 'Sin antecedentes documentales seleccionados.'}`,
    'Entrega solo el borrador del escrito jurídico en español formal chileno. Si citas doctrina/jurisprudencia, déjalas marcadas para pie de página.',
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
  const corsHeaders = buildCorsHeaders(req.headers.get('origin'))
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
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
  } catch (error) {
    const errorMessage = String(error?.message || error || 'Error desconocido')
    const isTimeout = errorMessage.toLowerCase().includes('timeout') || errorMessage.toLowerCase().includes('abort')
    return new Response(JSON.stringify({
      error: isTimeout
        ? `OpenAI no respondió dentro del tiempo límite (${OPENAI_TIMEOUT_MS}ms).`
        : `No fue posible generar borrador con ChatGPT: ${errorMessage}`,
      details: isTimeout ? 'timeout' : errorMessage,
    }), {
      status: isTimeout ? 504 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
