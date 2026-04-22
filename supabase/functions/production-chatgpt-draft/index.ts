import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') || 'gpt-4.1-mini'
const OPENAI_TIMEOUT_MS = Number(Deno.env.get('OPENAI_TIMEOUT_MS') || 90000)

type ChatEntry = { role: 'user' | 'assistant'; content: string }

type PromptInput = {
  tipoEscrito?: string
  instrucciones?: string
  ajuste?: string
  stylePrompt?: string
  cause?: Record<string, unknown>
  antecedentes?: Array<Record<string, unknown>>
  documentosSeleccionados?: Array<Record<string, unknown>>
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function buildPrompt(input: PromptInput) {
  const antecedentesRaw = Array.isArray(input?.antecedentes) && input.antecedentes.length
    ? input.antecedentes
    : (Array.isArray(input?.documentosSeleccionados) ? input.documentosSeleccionados : [])

  const antecedentesText = antecedentesRaw.map((item: Record<string, unknown>, i: number) => {
    const snippet = String(item?.content || '').slice(0, 1800)
    return `${i + 1}. ${item?.name || 'Antecedente'} (${item?.category || 'Sin categoría'})\n${snippet}`
  }).join('\n\n')

  return [
    `Tipo de escrito: ${input?.tipoEscrito || 'No indicado'}`,
    `Instrucciones del usuario: ${input?.instrucciones || 'Sin instrucciones adicionales'}`,
    `Ajuste de iteración: ${input?.ajuste || 'Sin ajuste'}`,
    `Estilo requerido: ${input?.stylePrompt || 'Jurídico chileno, tono forense técnico.'}`,
    `Contexto de causa: ${JSON.stringify(input?.cause || {}, null, 2)}`,
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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  if (!OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: 'OPENAI_API_KEY no configurada en backend.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  try {
    const payload = await req.json()
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

    const result = await openAiResponse.json()
    if (!openAiResponse.ok) {
      return new Response(JSON.stringify({ error: result?.error?.message || 'Error en OpenAI Responses API' }), {
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
      { role: 'user', content: String(payload?.ajuste || payload?.instrucciones || payload?.tipoEscrito || 'Solicitud de borrador') },
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
    }), {
      status: isTimeout ? 504 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
