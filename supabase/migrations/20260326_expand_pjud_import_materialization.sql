-- Expande trazabilidad y materialización PJUD hacia expediente digital.

alter table public.cases
  add column if not exists pjud_represented_client text,
  add column if not exists pjud_client_role text,
  add column if not exists pjud_traceability jsonb not null default '{}'::jsonb,
  add column if not exists pjud_documents_count integer not null default 0;

alter table public.pjud_import_rows
  add column if not exists represented_client_name text,
  add column if not exists represented_client_role text,
  add column if not exists imported_documents_count integer not null default 0,
  add column if not exists traceability jsonb not null default '{}'::jsonb;

create index if not exists cases_pjud_represented_client_idx on public.cases (pjud_represented_client);
create index if not exists pjud_import_rows_represented_client_idx on public.pjud_import_rows (represented_client_name);
