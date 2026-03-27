-- Hotfix: tolerate historical schema drift in PJUD batch metrics.
-- Objective: never break imports because of accessory metric columns.

alter table public.pjud_import_batches
  add column if not exists discarded_count integer,
  add column if not exists discarded_rows integer,
  add column if not exists recognized_sheets jsonb,
  add column if not exists sheet_row_counts jsonb,
  add column if not exists rows_processed integer,
  add column if not exists rows_invalid integer,
  add column if not exists causes_consolidated integer,
  add column if not exists imported_count integer,
  add column if not exists updated_count integer;

update public.pjud_import_batches
set
  discarded_count = coalesce(discarded_count, discarded_rows, 0),
  discarded_rows = coalesce(discarded_rows, discarded_count, 0),
  recognized_sheets = coalesce(recognized_sheets, sheets_detected, '[]'::jsonb),
  sheet_row_counts = coalesce(sheet_row_counts, '{}'::jsonb),
  rows_processed = coalesce(rows_processed, 0),
  rows_invalid = coalesce(rows_invalid, 0),
  causes_consolidated = coalesce(causes_consolidated, 0),
  imported_count = coalesce(imported_count, 0),
  updated_count = coalesce(updated_count, 0);

alter table public.pjud_import_batches
  alter column discarded_count set default 0,
  alter column discarded_rows set default 0,
  alter column recognized_sheets set default '[]'::jsonb,
  alter column sheet_row_counts set default '{}'::jsonb,
  alter column rows_processed set default 0,
  alter column rows_invalid set default 0,
  alter column causes_consolidated set default 0,
  alter column imported_count set default 0,
  alter column updated_count set default 0;

