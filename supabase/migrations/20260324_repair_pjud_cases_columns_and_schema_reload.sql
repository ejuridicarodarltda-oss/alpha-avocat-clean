-- Final repair for PJUD import flow.
-- Ensures required backend objects exist and that PostgREST sees them.

create extension if not exists pgcrypto;

create table if not exists public.pjud_import_batches (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'pjud_excel_mis_causas',
  source_confidence text not null default 'high',
  file_name text,
  file_size_bytes bigint not null default 0,
  sheets_detected text[] not null default '{}',
  sheet_row_counts jsonb not null default '{}'::jsonb,
  rows_processed integer not null default 0,
  rows_invalid integer not null default 0,
  causes_consolidated integer not null default 0,
  counts_by_materia jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.pjud_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.pjud_import_batches(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  materia text,
  sheet_name text,
  row_number integer,
  dedupe_key text,
  row_signature text,
  is_valid boolean not null default true,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.cases
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists source text,
  add column if not exists source_confidence text,
  add column if not exists import_batch_id uuid references public.pjud_import_batches(id) on delete set null,
  add column if not exists imported_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists pjud_case_key text,
  add column if not exists pjud_materia text,
  add column if not exists pjud_submateria text,
  add column if not exists pjud_tribunal text,
  add column if not exists pjud_corte text,
  add column if not exists pjud_era text,
  add column if not exists pjud_rit text,
  add column if not exists pjud_ruc text,
  add column if not exists pjud_tipo_causa text,
  add column if not exists pjud_fecha_ingreso date,
  add column if not exists pjud_caratulado text,
  add column if not exists pjud_estado_causa text,
  add column if not exists pjud_estado_procesal text,
  add column if not exists pjud_ubicacion text,
  add column if not exists pjud_fecha_ubicacion date,
  add column if not exists pjud_institucion text;

update public.cases
set updated_at = coalesce(updated_at, now())
where true;

create unique index if not exists cases_owner_pjud_case_key_uidx
  on public.cases (owner_user_id, pjud_case_key)
  where pjud_case_key is not null;

create index if not exists cases_import_batch_idx on public.cases (import_batch_id);
create index if not exists pjud_import_batches_owner_created_idx on public.pjud_import_batches (owner_user_id, created_at desc);
create index if not exists pjud_import_rows_batch_idx on public.pjud_import_rows (batch_id, row_number);
create index if not exists pjud_import_rows_owner_idx on public.pjud_import_rows (owner_user_id, created_at desc);
create index if not exists pjud_import_rows_dedupe_idx on public.pjud_import_rows (dedupe_key);

alter table public.pjud_import_batches enable row level security;
alter table public.pjud_import_rows enable row level security;

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on public.pjud_import_batches to authenticated, service_role;
grant select, insert, update, delete on public.pjud_import_rows to authenticated, service_role;

notify pgrst, 'reload schema';
