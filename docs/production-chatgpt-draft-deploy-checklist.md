# production-chatgpt-draft — checklist de diagnóstico y deploy

## 1) URL de invocación esperada
- Con Supabase JS: `supabase.functions.invoke('production-chatgpt-draft', { body })`.
- Endpoint HTTP equivalente: `https://<PROJECT_REF>.supabase.co/functions/v1/production-chatgpt-draft`.

## 2) Secrets requeridos (exactos)
- `OPENAI_API_KEY` (**obligatorio**).
- `OPENAI_MODEL` (opcional, default: `gpt-4.1-mini`).
- `OPENAI_TIMEOUT_MS` (opcional, default: `90000`).
- `ALLOWED_ORIGINS` (recomendado para CORS estricto, separado por coma).

Ejemplo:
```bash
supabase secrets set OPENAI_API_KEY="sk-..." OPENAI_MODEL="gpt-4.1-mini" OPENAI_TIMEOUT_MS="90000" ALLOWED_ORIGINS="https://alphaavocat.cl,https://www.alphaavocat.cl,https://<tu-app>.vercel.app"
```

## 3) Deploy de la Edge Function
```bash
supabase login
supabase link --project-ref <PROJECT_REF>
supabase functions deploy production-chatgpt-draft --project-ref <PROJECT_REF>
```

## 4) Verificación de despliegue
```bash
supabase functions list --project-ref <PROJECT_REF>
```
Debe aparecer `production-chatgpt-draft`.

## 5) Verificación CORS y OPTIONS
```bash
curl -i -X OPTIONS "https://<PROJECT_REF>.supabase.co/functions/v1/production-chatgpt-draft" \
  -H "Origin: https://alphaavocat.cl" \
  -H "Access-Control-Request-Method: POST"
```
Debe responder `204` con:
- `Access-Control-Allow-Origin: https://alphaavocat.cl` (o el origin permitido)
- `Access-Control-Allow-Methods: POST, OPTIONS`

## 6) Verificación de error de secret faltante
Si falta `OPENAI_API_KEY`, la función ahora responde:
```json
{ "error": "Falta OPENAI_API_KEY en Supabase secrets" }
```

## 7) Verificación error real de OpenAI
Ante error de proveedor, la función responde JSON con:
- `error` (mensaje real)
- `provider: "openai"`
- `provider_status`
- `provider_error`
