-- FASE 1: endurecer staging serio para índice dinámico PJUD (misCausas.php)
create table if not exists public.pjud_causes_index (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'pjud',
  user_id uuid null,
  pjud_url text null,
  competencia text null,
  corte text null,
  tribunal text null,
  pjud_case_id text null,
  action_token text null,
  detail_handler text null,
  origen_tabla text null,
  rol text null,
  rit text null,
  ruc text null,
  caratula text null,
  materia text null,
  estado text null,
  fecha_ingreso date null,
  fecha_ultima_actuacion timestamptz null,
  fecha_ultima_sincronizacion timestamptz not null default now(),
  institucion text null,
  raw_row_html text null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.pjud_causes_index
  add column if not exists source text not null default 'pjud',
  add column if not exists pjud_url text null,
  add column if not exists competencia text null,
  add column if not exists tribunal text null,
  add column if not exists pjud_case_id text null,
  add column if not exists action_token text null,
  add column if not exists detail_handler text null,
  add column if not exists origen_tabla text null,
  add column if not exists ruc text null,
  add column if not exists estado text null,
  add column if not exists fecha_ultima_actuacion timestamptz null,
  add column if not exists fecha_ultima_sincronizacion timestamptz not null default now(),
  add column if not exists institucion text null,
  add column if not exists raw_row_html text null,
  add column if not exists raw_payload jsonb not null default '{}'::jsonb;

create index if not exists idx_pjud_causes_index_rol on public.pjud_causes_index (rol);
create index if not exists idx_pjud_causes_index_rit on public.pjud_causes_index (rit);
create index if not exists idx_pjud_causes_index_ruc on public.pjud_causes_index (ruc);
create index if not exists idx_pjud_causes_index_tribunal on public.pjud_causes_index (tribunal);
create index if not exists idx_pjud_causes_index_action_token on public.pjud_causes_index (action_token);

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

drop trigger if exists pjud_causes_index_touch_updated_at on public.pjud_causes_index;
create trigger pjud_causes_index_touch_updated_at
before update on public.pjud_causes_index
for each row execute function public.touch_updated_at();

select pg_notify('pgrst', 'reload schema');
