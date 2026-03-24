-- Fixes PJUD import infra visibility issues for PostgREST authenticated role.
-- This migration is idempotent and repairs missing table/grants/RLS/policies/indexes,
-- then asks PostgREST schema cache to reload.

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

alter table public.pjud_import_batches
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists source text,
  add column if not exists source_confidence text,
  add column if not exists file_name text,
  add column if not exists file_size_bytes bigint,
  add column if not exists sheets_detected text[],
  add column if not exists sheet_row_counts jsonb,
  add column if not exists rows_processed integer,
  add column if not exists rows_invalid integer,
  add column if not exists causes_consolidated integer,
  add column if not exists counts_by_materia jsonb,
  add column if not exists metadata jsonb,
  add column if not exists created_at timestamptz;

alter table public.pjud_import_rows
  add column if not exists batch_id uuid references public.pjud_import_batches(id) on delete cascade,
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists materia text,
  add column if not exists sheet_name text,
  add column if not exists row_number integer,
  add column if not exists dedupe_key text,
  add column if not exists row_signature text,
  add column if not exists is_valid boolean,
  add column if not exists payload jsonb,
  add column if not exists created_at timestamptz;

update public.pjud_import_batches
set source = coalesce(source, 'pjud_excel_mis_causas'),
    source_confidence = coalesce(source_confidence, 'high'),
    file_size_bytes = coalesce(file_size_bytes, 0),
    sheets_detected = coalesce(sheets_detected, '{}'::text[]),
    sheet_row_counts = coalesce(sheet_row_counts, '{}'::jsonb),
    rows_processed = coalesce(rows_processed, 0),
    rows_invalid = coalesce(rows_invalid, 0),
    causes_consolidated = coalesce(causes_consolidated, 0),
    counts_by_materia = coalesce(counts_by_materia, '{}'::jsonb),
    metadata = coalesce(metadata, '{}'::jsonb),
    created_at = coalesce(created_at, now())
where true;

update public.pjud_import_rows
set is_valid = coalesce(is_valid, true),
    payload = coalesce(payload, '{}'::jsonb),
    created_at = coalesce(created_at, now())
where true;

alter table public.pjud_import_batches
  alter column source set default 'pjud_excel_mis_causas',
  alter column source_confidence set default 'high',
  alter column file_size_bytes set default 0,
  alter column sheets_detected set default '{}',
  alter column sheet_row_counts set default '{}'::jsonb,
  alter column rows_processed set default 0,
  alter column rows_invalid set default 0,
  alter column causes_consolidated set default 0,
  alter column counts_by_materia set default '{}'::jsonb,
  alter column metadata set default '{}'::jsonb,
  alter column created_at set default now();

alter table public.pjud_import_rows
  alter column is_valid set default true,
  alter column payload set default '{}'::jsonb,
  alter column created_at set default now();

create index if not exists pjud_import_batches_owner_created_idx on public.pjud_import_batches (owner_user_id, created_at desc);
create index if not exists pjud_import_rows_batch_idx on public.pjud_import_rows (batch_id, row_number);
create index if not exists pjud_import_rows_owner_idx on public.pjud_import_rows (owner_user_id, created_at desc);
create index if not exists pjud_import_rows_dedupe_idx on public.pjud_import_rows (dedupe_key);

alter table public.pjud_import_batches enable row level security;
alter table public.pjud_import_rows enable row level security;

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on public.pjud_import_batches to authenticated, service_role;
grant select, insert, update, delete on public.pjud_import_rows to authenticated, service_role;

drop policy if exists "pjud_import_batches_select_own" on public.pjud_import_batches;
create policy "pjud_import_batches_select_own"
  on public.pjud_import_batches
  for select
  to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists "pjud_import_batches_insert_own" on public.pjud_import_batches;
create policy "pjud_import_batches_insert_own"
  on public.pjud_import_batches
  for insert
  to authenticated
  with check (owner_user_id = auth.uid());

drop policy if exists "pjud_import_batches_update_own" on public.pjud_import_batches;
create policy "pjud_import_batches_update_own"
  on public.pjud_import_batches
  for update
  to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "pjud_import_batches_delete_own" on public.pjud_import_batches;
create policy "pjud_import_batches_delete_own"
  on public.pjud_import_batches
  for delete
  to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists "pjud_import_rows_select_own" on public.pjud_import_rows;
create policy "pjud_import_rows_select_own"
  on public.pjud_import_rows
  for select
  to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists "pjud_import_rows_insert_own" on public.pjud_import_rows;
create policy "pjud_import_rows_insert_own"
  on public.pjud_import_rows
  for insert
  to authenticated
  with check (owner_user_id = auth.uid());

drop policy if exists "pjud_import_rows_update_own" on public.pjud_import_rows;
create policy "pjud_import_rows_update_own"
  on public.pjud_import_rows
  for update
  to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "pjud_import_rows_delete_own" on public.pjud_import_rows;
create policy "pjud_import_rows_delete_own"
  on public.pjud_import_rows
  for delete
  to authenticated
  using (owner_user_id = auth.uid());

-- Force PostgREST to reload schema cache after creating/repairing critical tables.
notify pgrst, 'reload schema';
