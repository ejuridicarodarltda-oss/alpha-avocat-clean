-- Ensure Excel depurado tribunal infrastructure exists and is visible to PostgREST/authenticated users.

create table if not exists public.cause_excel_upload_batches (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  uploaded_by uuid references auth.users(id) on delete set null,
  upload_type text not null default 'listado' check (upload_type in ('listado','estado_diario')),
  source_type text not null default 'excel_depurado_tribunal',
  status text not null default 'pending',
  file_name text not null default 'archivo.xlsx',
  original_filename text,
  tribunal_name text,
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  empty_rows integer not null default 0,
  structural_errors integer not null default 0,
  duplicate_rows integer not null default 0,
  processed_count integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  linked_rows integer not null default 0,
  discarded_count integer not null default 0,
  error_summary text,
  metadata jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  raw_preview jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cause_excel_upload_batches
  add column if not exists uploaded_by uuid references auth.users(id) on delete set null,
  add column if not exists source_type text not null default 'excel_depurado_tribunal',
  add column if not exists status text not null default 'pending',
  add column if not exists original_filename text,
  add column if not exists tribunal_name text,
  add column if not exists empty_rows integer not null default 0,
  add column if not exists structural_errors integer not null default 0,
  add column if not exists processed_count integer not null default 0,
  add column if not exists created_count integer not null default 0,
  add column if not exists updated_count integer not null default 0,
  add column if not exists discarded_count integer not null default 0,
  add column if not exists error_summary text,
  add column if not exists metadata_json jsonb not null default '{}'::jsonb,
  add column if not exists raw_preview jsonb,
  add column if not exists updated_at timestamptz not null default now();

update public.cause_excel_upload_batches
set
  uploaded_by = coalesce(uploaded_by, owner_user_id),
  source_type = coalesce(nullif(source_type, ''), 'excel_depurado_tribunal'),
  original_filename = coalesce(original_filename, file_name),
  metadata_json = coalesce(metadata_json, metadata, '{}'::jsonb),
  updated_at = coalesce(updated_at, created_at, now())
where
  uploaded_by is null
  or source_type is null
  or source_type = ''
  or original_filename is null
  or metadata_json is null
  or updated_at is null;

create table if not exists public.cause_excel_upload_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.cause_excel_upload_batches(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  upload_type text not null check (upload_type in ('listado','estado_diario')),
  row_number integer not null,
  rol text,
  tribunal text,
  caratula text,
  estado text,
  fecha_text text,
  linked_case_id uuid references public.cases(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Optional compatibility alias used by some backend routines.
create or replace view public.cause_excel_upload_batch_rows as
select * from public.cause_excel_upload_rows;

create index if not exists cause_excel_upload_batches_owner_created_idx
  on public.cause_excel_upload_batches (owner_user_id, created_at desc);

create index if not exists cause_excel_upload_batches_status_created_idx
  on public.cause_excel_upload_batches (status, created_at desc);

create index if not exists cause_excel_upload_rows_batch_idx
  on public.cause_excel_upload_rows (batch_id, row_number);

create index if not exists cause_excel_upload_rows_owner_created_idx
  on public.cause_excel_upload_rows (owner_user_id, created_at desc);

alter table public.cause_excel_upload_batches enable row level security;
alter table public.cause_excel_upload_rows enable row level security;

-- Explicit table grants for authenticated clients.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.cause_excel_upload_batches to authenticated;
grant select, insert, update, delete on public.cause_excel_upload_rows to authenticated;
grant select on public.cause_excel_upload_batch_rows to authenticated;

drop policy if exists "cause_excel_upload_batches_select_own" on public.cause_excel_upload_batches;
create policy "cause_excel_upload_batches_select_own"
  on public.cause_excel_upload_batches
  for select
  to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists "cause_excel_upload_batches_insert_own" on public.cause_excel_upload_batches;
create policy "cause_excel_upload_batches_insert_own"
  on public.cause_excel_upload_batches
  for insert
  to authenticated
  with check (owner_user_id = auth.uid());

drop policy if exists "cause_excel_upload_batches_update_own" on public.cause_excel_upload_batches;
create policy "cause_excel_upload_batches_update_own"
  on public.cause_excel_upload_batches
  for update
  to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "cause_excel_upload_batches_delete_own" on public.cause_excel_upload_batches;
create policy "cause_excel_upload_batches_delete_own"
  on public.cause_excel_upload_batches
  for delete
  to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists "cause_excel_upload_rows_select_own" on public.cause_excel_upload_rows;
create policy "cause_excel_upload_rows_select_own"
  on public.cause_excel_upload_rows
  for select
  to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists "cause_excel_upload_rows_insert_own" on public.cause_excel_upload_rows;
create policy "cause_excel_upload_rows_insert_own"
  on public.cause_excel_upload_rows
  for insert
  to authenticated
  with check (owner_user_id = auth.uid());

drop policy if exists "cause_excel_upload_rows_update_own" on public.cause_excel_upload_rows;
create policy "cause_excel_upload_rows_update_own"
  on public.cause_excel_upload_rows
  for update
  to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "cause_excel_upload_rows_delete_own" on public.cause_excel_upload_rows;
create policy "cause_excel_upload_rows_delete_own"
  on public.cause_excel_upload_rows
  for delete
  to authenticated
  using (owner_user_id = auth.uid());

drop trigger if exists cause_excel_upload_batches_touch_updated_at on public.cause_excel_upload_batches;
create trigger cause_excel_upload_batches_touch_updated_at
before update on public.cause_excel_upload_batches
for each row execute function public.touch_updated_at();

select pg_notify('pgrst', 'reload schema');
