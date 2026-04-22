# Diagnóstico exacto: `production-chatgpt-draft: Failed to fetch`

Fecha verificación: 2026-04-22 UTC.

## 1) Existencia/despliegue en Supabase producción

Proyecto que usa el frontend: `ryekhruwglpzncktypnx`.

Prueba directa al endpoint de Edge Functions:

- `OPTIONS https://ryekhruwglpzncktypnx.supabase.co/functions/v1/production-chatgpt-draft`
- `POST https://ryekhruwglpzncktypnx.supabase.co/functions/v1/production-chatgpt-draft`

Resultado real (gateway Supabase):

- HTTP `404 Not Found`
- Header `sb-error-code: NOT_FOUND`
- Body `{"code":"NOT_FOUND","message":"Requested function was not found"}`

Conclusión: la función **no está desplegada (o no existe con ese nombre) en el proyecto de producción real**.

## 2) Verificación de nombre exacto invocado por frontend

El frontend invoca exactamente:

- `supabase.functions.invoke('production-chatgpt-draft', { body: payload })`

También hay fallback con `fetch` al endpoint `/functions/v1/production-chatgpt-draft`.

Conclusión: **el nombre invocado por frontend coincide exactamente** con `production-chatgpt-draft`.

## 3) Logs reales al pulsar “Generar borrador con ChatGPT”

No hay logs de runtime de la función porque **la función no se encuentra**.

Lo único que existe como evidencia real al momento de invocar es el log/respuesta del gateway:

- `sb-error-code: NOT_FOUND`
- `{"code":"NOT_FOUND","message":"Requested function was not found"}`

## 4) ¿Falla antes de entrar a función o dentro al llamar OpenAI?

Falla **antes de entrar a la función**.

No hay ejecución de `index.ts`, por lo que no se alcanza ningún `fetch` hacia OpenAI (`https://api.openai.com/v1/responses`).

## 5) Secreto OpenAI en backend para esa Edge Function

La función local requiere `OPENAI_API_KEY` por `Deno.env.get('OPENAI_API_KEY')`.

Pero en producción, al no estar desplegada/encontrable, **no es posible validar en ejecución** si ese secreto está o no en ese proyecto para esa función.

Estado práctico actual: bloqueado por `NOT_FOUND` antes de llegar al punto donde se usaría la clave.

## 6) API key en frontend

No se debe poner la API key de OpenAI en frontend.

El flujo correcto es backend-only (Edge Function), y el frontend solo debe invocar la función.

## 7) Error real exacto (clasificación)

**NOT_FOUND**.

No corresponde a `auth`, `CORS`, `relay`, `timeout` ni `clave faltante/inválida` en el estado actual, porque la función ni siquiera es encontrada por el gateway.
