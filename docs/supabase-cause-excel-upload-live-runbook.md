# Runbook: corrección real de `cause_excel_upload_batches` en la base activa

Fecha de verificación: **2026-04-17**.

## 1) Proyecto real al que apunta la app (`alphaavocat.cl`)

La app web usa `public/app.js` y ahí está hardcodeado:

- `supabaseUrl = https://ryekhruwglpzncktypnx.supabase.co`
- `supabaseAnonKey` del mismo `project_ref`

Por lo tanto, el entorno efectivo no es local sino el proyecto remoto con `project_ref=ryekhruwglpzncktypnx`.

## 2) Evidencia de falla en esa base exacta

Ejecutar:

```bash
./scripts/verify-excel-upload-live.sh
```

Resultado esperado cuando falta la tabla en la base real:

- HTTP 404 PostgREST
- `code: PGRST205`
- `message: Could not find the table 'public.cause_excel_upload_batches' in the schema cache`
- `sb-project-ref: ryekhruwglpzncktypnx`

## 3) Migración a ejecutar en ESA base

Archivo seleccionado (idempotente):

- `supabase/migrations/20260417_fix_cause_excel_upload_infrastructure.sql`

Aplica:

- tabla `public.cause_excel_upload_batches`
- tabla auxiliar `public.cause_excel_upload_rows`
- vista `public.cause_excel_upload_batch_rows`
- grants para `authenticated`
- RLS + policies de `select/insert/update/delete` por `owner_user_id`

## 4) Aplicación de migración en la base real

Necesitas la conexión Postgres del proyecto `ryekhruwglpzncktypnx` (no otra).

```bash
export SUPABASE_DB_URL='postgresql://postgres:<password>@db.ryekhruwglpzncktypnx.supabase.co:5432/postgres?sslmode=require'
./scripts/apply-cause-excel-upload-migration.sh
```

## 5) Verificación de permisos y RLS para rol authenticated

Con un usuario real de la app:

```bash
export SUPABASE_TEST_EMAIL='usuario@dominio.com'
export SUPABASE_TEST_PASSWORD='********'
./scripts/verify-excel-upload-live.sh
```

La segunda parte del script valida en vivo:

- login `authenticated`
- `INSERT` en `cause_excel_upload_batches`
- `UPDATE` del mismo registro
- `SELECT` del registro insertado

## 6) Prueba funcional final desde la app

Después de migrar y validar API:

1. Iniciar sesión en `alphaavocat.cl` con usuario real.
2. Ir al flujo de carga de Excel depurado tribunal.
3. Cargar archivo Excel.
4. Pulsar **“Procesar Excel depurado”**.
5. Confirmar que no aparezca el error de tabla faltante.
6. Confirmar que existe un registro nuevo en `public.cause_excel_upload_batches` para ese `owner_user_id`.

> Este paso es obligatorio para cerrar el incidente: no basta con que el endpoint responda sin error, debe comprobarse el flujo UI completo.
