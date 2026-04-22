# Diagnóstico técnico — flujo “ChatGPT para redactar escritos”

Fecha: 2026-04-22 (UTC)

## Alcance revisado

1. Botón “Generar borrador con ChatGPT”.
2. Invocación real de la función al hacer clic.
3. Payload enviado.
4. Edge Function/endpoint llamado.
5. Existencia/despliegue de la función.
6. Error real observable.
7. Condición de pintado en UI para “D. Respuesta de ChatGPT”.

## Hallazgos

### 1) Función exacta ejecutada por el botón

- El botón `#btnGenerarBorradorChatGPT` está dentro de `#formProducirEscritos` y es `type="submit"`.
- El formulario está enlazado a `submitProducirEscritos`.
- `submitProducirEscritos(event)` hace `event.preventDefault()` y luego llama `callProduccionChatGpt({ mode: 'generate' })`.

### 2) Confirmación de invocación al clic

- El binding existe: `bindEvent('formProducirEscritos', 'submit', submitProducirEscritos, ...)`.
- Con esto, al presionar el botón submit sí se invoca la ruta de generación.

### 3) Payload que envía

`callProduccionChatGpt` arma este `payload` y lo envía por `supabase.functions.invoke`:

- `mode`
- `sessionId`
- `tipoEscrito`
- `instrucciones`
- `ajuste`
- `stylePrompt`
- `cause`:
  - `id`
  - `rol`
  - `tribunal`
  - `caratula`
  - `estado`
  - `materia`
  - `procedimiento`
- `antecedentes` (documentos seleccionados, con `id`, `name`, `category`, `content`, `sourceUrl`)
- `history`

### 4) Edge Function/endpoint llamado

- Nombre de función invocada desde UI: `production-chatgpt-draft`.
- Endpoint real Supabase esperado: `https://<project-ref>.supabase.co/functions/v1/production-chatgpt-draft`.

### 5) Si existe y está desplegada

Verificación directa al endpoint del proyecto configurado (`ryekhruwglpzncktypnx`):

- `OPTIONS /functions/v1/production-chatgpt-draft` => **404 NOT_FOUND**
- `POST /functions/v1/production-chatgpt-draft` => **404 NOT_FOUND** con body:

```json
{"code":"NOT_FOUND","message":"Requested function was not found"}
```

Conclusión: en el proyecto Supabase apuntado por frontend, la función `production-chatgpt-draft` no está desplegada (o no existe con ese nombre).

### 6) Error real en logs

Sin acceso a dashboard/CLI de Supabase en este entorno, no se pudieron leer logs internos de ejecución.

Error real observable desde la pasarela de funciones (respuesta HTTP):

- `sb-error-code: NOT_FOUND`
- body: `{"code":"NOT_FOUND","message":"Requested function was not found"}`

Esto es consistente con “función inexistente/no desplegada”, no con un fallo interno del código Deno en runtime.

### 7) Si responde éxito, por qué la UI no muestra el borrador

La UI sí tiene lógica de pintado si hay éxito:

- Tras `invoke`, exige `!error` y `data.draft`.
- En éxito:
  - guarda `state.produccionDraft.draftText = data.draft`
  - asigna `#produccionDraftEditor.value = draftText`
  - actualiza panel resultado `#producirEscritoResultado`

Por tanto, con el estado actual (404 NOT_FOUND), la UI entra en rama de error y **no pinta** el bloque “D. Respuesta de ChatGPT” porque nunca recibe `data.draft`.

## Diagnóstico final

El botón **sí está cableado** de punta a punta en frontend, y el payload incluye los campos clave (`rol`, `tribunal`, tipo de escrito, instrucciones y documentos seleccionados). El bloqueo real está en infraestructura: la Edge Function `production-chatgpt-draft` no existe/no está desplegada en el proyecto Supabase configurado, devolviendo 404 NOT_FOUND.
