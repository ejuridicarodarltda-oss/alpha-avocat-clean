create table if not exists public.pjud_index_uploads (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  uploaded_at timestamptz not null default timezone('utc', now()),
  uploaded_by uuid references auth.users(id) on delete set null,
  is_active boolean not null default false,
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  invalid_rows integer not null default 0,
  status text not null default 'uploaded',
  error_summary text,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists pjud_index_uploads_one_active_per_owner
  on public.pjud_index_uploads (owner_user_id)
  where is_active = true;

create table if not exists public.pjud_index_rows (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  upload_id uuid not null references public.pjud_index_uploads(id) on delete cascade,
  rol text not null,
  tribunal text not null,
  tribunal_normalized text not null,
  fecha_ingreso text,
  caratula text,
  estado_causa text,
  institucion text,
  tipo_causa text,
  ruc text,
  row_number integer not null,
  row_hash text not null
);

create index if not exists pjud_index_rows_owner_upload_idx on public.pjud_index_rows (owner_user_id, upload_id);
create unique index if not exists pjud_index_rows_unique_key_per_upload on public.pjud_index_rows (upload_id, rol, tribunal_normalized);

create table if not exists public.pjud_index_processing_log (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  upload_id uuid not null references public.pjud_index_uploads(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  step text not null,
  status text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.pjud_index_uploads enable row level security;
alter table public.pjud_index_rows enable row level security;
alter table public.pjud_index_processing_log enable row level security;

create policy "pjud_index_uploads_rw_own" on public.pjud_index_uploads
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create policy "pjud_index_rows_rw_own" on public.pjud_index_rows
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create policy "pjud_index_processing_log_rw_own" on public.pjud_index_processing_log
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

grant select, insert, update, delete on public.pjud_index_uploads to authenticated, service_role;
grant select, insert, update, delete on public.pjud_index_rows to authenticated, service_role;
grant select, insert, update, delete on public.pjud_index_processing_log to authenticated, service_role;
