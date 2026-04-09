-- Ensure PJUD causes index table exists and is compatible with HTML importer payloads.
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
  detail_action text null,
  has_detail_access boolean not null default false,
  alpha_case_id uuid null references public.cases(id) on delete set null,
  sync_status text not null default 'indexed',
  last_seen_at timestamptz null,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Required compatibility fields for external integrations/import payloads.
alter table if exists public.pjud_causes_index
  add column if not exists caratulado text,
  add column if not exists estado text,
  add column if not exists corte text;

-- Keep legacy/new aliases in sync for reads/writes across modules.
update public.pjud_causes_index
set
  caratulado = coalesce(caratulado, caratula),
  caratula = coalesce(caratula, caratulado),
  estado = coalesce(estado, estado_causa),
  estado_causa = coalesce(estado_causa, estado),
  corte = coalesce(corte, court_name),
  court_name = coalesce(court_name, corte)
where
  caratulado is distinct from caratula
  or estado is distinct from estado_causa
  or corte is distinct from court_name;

create or replace function public.sync_pjud_causes_index_aliases()
returns trigger
language plpgsql
as $$
begin
  new.caratula := coalesce(new.caratula, new.caratulado);
  new.caratulado := coalesce(new.caratulado, new.caratula);
  new.estado_causa := coalesce(new.estado_causa, new.estado);
  new.estado := coalesce(new.estado, new.estado_causa);
  new.court_name := coalesce(new.court_name, new.corte);
  new.corte := coalesce(new.corte, new.court_name);
  return new;
end;
$$;

drop trigger if exists pjud_causes_index_sync_aliases on public.pjud_causes_index;
create trigger pjud_causes_index_sync_aliases
before insert or update on public.pjud_causes_index
for each row execute function public.sync_pjud_causes_index_aliases();

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
