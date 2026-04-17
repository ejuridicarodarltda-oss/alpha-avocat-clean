create table if not exists public.cause_excel_upload_batches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  original_filename text,
  tribunal_name text,
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  empty_rows integer not null default 0,
  structural_errors integer not null default 0,
  processed_count integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  discarded_count integer not null default 0,
  status text not null default 'pending',
  error_summary text,
  uploaded_by uuid,
  metadata_json jsonb not null default '{}'::jsonb,
  source_type text not null default 'excel_depurado_tribunal'
);

create index if not exists idx_cause_excel_upload_batches_created_at
  on public.cause_excel_upload_batches (created_at desc);

alter table public.cause_excel_upload_batches enable row level security;

drop policy if exists "cause_excel_upload_batches_select_own" on public.cause_excel_upload_batches;
drop policy if exists "cause_excel_upload_batches_insert_own" on public.cause_excel_upload_batches;
drop policy if exists "cause_excel_upload_batches_update_own" on public.cause_excel_upload_batches;
drop policy if exists "cause_excel_upload_batches_delete_own" on public.cause_excel_upload_batches;

drop policy if exists "cause_excel_upload_batches_select_authenticated" on public.cause_excel_upload_batches;
create policy "cause_excel_upload_batches_select_authenticated"
on public.cause_excel_upload_batches
for select
to authenticated
using (true);

drop policy if exists "cause_excel_upload_batches_insert_authenticated" on public.cause_excel_upload_batches;
create policy "cause_excel_upload_batches_insert_authenticated"
on public.cause_excel_upload_batches
for insert
to authenticated
with check (true);

drop policy if exists "cause_excel_upload_batches_update_authenticated" on public.cause_excel_upload_batches;
create policy "cause_excel_upload_batches_update_authenticated"
on public.cause_excel_upload_batches
for update
to authenticated
using (true)
with check (true);
