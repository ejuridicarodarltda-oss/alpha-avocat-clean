-- Optimiza almacenamiento de lotes PJUD para cargas masivas sin payloads pesados.

alter table public.pjud_import_batches
  add column if not exists status text not null default 'processing',
  add column if not exists imported_count integer not null default 0,
  add column if not exists updated_count integer not null default 0,
  add column if not exists discarded_count integer not null default 0,
  add column if not exists summary jsonb not null default '{}'::jsonb,
  add column if not exists error_summary jsonb not null default '[]'::jsonb;

update public.pjud_import_batches
set status = coalesce(nullif(trim(status), ''), 'processing'),
    imported_count = coalesce(imported_count, 0),
    updated_count = coalesce(updated_count, 0),
    discarded_count = coalesce(discarded_count, 0),
    summary = coalesce(summary, '{}'::jsonb),
    error_summary = coalesce(error_summary, '[]'::jsonb)
where true;

create index if not exists pjud_import_batches_status_idx
  on public.pjud_import_batches (owner_user_id, status, created_at desc);

-- Nota operativa: pjud_import_rows.payload se mantiene por compatibilidad,
-- pero la aplicación guarda ahora solo metadatos mínimos por fila.

notify pgrst, 'reload schema';
