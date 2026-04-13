create table if not exists public.cause_excel_upload_batches (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  upload_type text not null check (upload_type in ('listado','estado_diario')),
  file_name text not null,
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  linked_rows integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

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

create index if not exists cause_excel_upload_batches_owner_created_idx
  on public.cause_excel_upload_batches (owner_user_id, created_at desc);

create index if not exists cause_excel_upload_rows_batch_idx
  on public.cause_excel_upload_rows (batch_id, row_number);

create index if not exists cause_excel_upload_rows_owner_created_idx
  on public.cause_excel_upload_rows (owner_user_id, created_at desc);

alter table public.cause_excel_upload_batches enable row level security;
alter table public.cause_excel_upload_rows enable row level security;

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
