import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') || 'gpt-4.1-mini'

type ChatEntry = { role: 'user' | 'assistant'; content: string }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function buildPrompt(input: any) {
  const antecedentes = Array.isArray(input?.antecedentes) ? input.antecedentes : []
  const antecedentesText = antecedentes.map((item: any, i: number) => {
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

    const openAiResponse = await fetch('https://api.openai.com/v1/responses', {
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
    })

    const result = await openAiResponse.json()
    if (!openAiResponse.ok) {
      return new Response(JSON.stringify({ error: result?.error?.message || 'Error en OpenAI Responses API' }), {
        status: openAiResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const draft = String(result?.output_text || '').trim()
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
    return new Response(JSON.stringify({ error: `No fue posible generar borrador con ChatGPT: ${error?.message || 'Error desconocido'}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
