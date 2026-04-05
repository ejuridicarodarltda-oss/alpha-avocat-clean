create table if not exists public.pjud_causes_index (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  access_connection_id uuid null references public.pjud_access_connections(id) on delete set null,
  pjud_row_key text null,
  row_position integer null,
  rol text null,
  rit text null,
  procedure_type text null,
  year integer null,
  court_name text null,
  court_code text null,
  caratula text null,
  materia text null,
  estado_causa text null,
  fecha_ingreso text null,
  fecha_ultima_gestion text null,
  raw_row_payload jsonb null,
  detail_url text null,
  has_detail_access boolean not null default false,
  alpha_case_id uuid null references public.cases(id) on delete set null,
  sync_status text not null default 'indexed',
  last_seen_at timestamptz null,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pjud_causes_index_sync_status_check check (sync_status in ('indexed', 'linked', 'error', 'pending_refresh')),
  constraint pjud_causes_index_row_position_check check (row_position is null or row_position > 0),
  constraint pjud_causes_index_year_check check (year is null or year between 1900 and 2999)
);

create unique index if not exists pjud_causes_index_user_row_key_uidx
  on public.pjud_causes_index (user_id, pjud_row_key)
  where pjud_row_key is not null;

create index if not exists pjud_causes_index_user_id_idx on public.pjud_causes_index (user_id);
create index if not exists pjud_causes_index_rol_idx on public.pjud_causes_index (rol);
create index if not exists pjud_causes_index_rit_idx on public.pjud_causes_index (rit);
create index if not exists pjud_causes_index_court_name_idx on public.pjud_causes_index (court_name);
create index if not exists pjud_causes_index_synced_at_idx on public.pjud_causes_index (synced_at desc);
create index if not exists pjud_causes_index_alpha_case_id_idx on public.pjud_causes_index (alpha_case_id);
create index if not exists pjud_causes_index_sync_status_idx on public.pjud_causes_index (sync_status);

drop trigger if exists pjud_causes_index_touch_updated_at on public.pjud_causes_index;
create trigger pjud_causes_index_touch_updated_at
before update on public.pjud_causes_index
for each row execute function public.touch_updated_at();

alter table public.pjud_causes_index enable row level security;

grant select, insert, update, delete on public.pjud_causes_index to authenticated, service_role;

drop policy if exists "pjud_causes_index_select_own" on public.pjud_causes_index;
create policy "pjud_causes_index_select_own" on public.pjud_causes_index
for select using (user_id = auth.uid());

drop policy if exists "pjud_causes_index_insert_own" on public.pjud_causes_index;
create policy "pjud_causes_index_insert_own" on public.pjud_causes_index
for insert with check (user_id = auth.uid());

drop policy if exists "pjud_causes_index_update_own" on public.pjud_causes_index;
create policy "pjud_causes_index_update_own" on public.pjud_causes_index
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "pjud_causes_index_delete_own" on public.pjud_causes_index;
create policy "pjud_causes_index_delete_own" on public.pjud_causes_index
for delete using (user_id = auth.uid());

select pg_notify('pgrst', 'reload schema');
