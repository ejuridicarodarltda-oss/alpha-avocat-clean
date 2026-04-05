create table if not exists public.pjud_access_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  access_type text not null default 'pjud',
  status text not null default 'disconnected',
  base_url_mis_causas text,
  last_connected_at timestamptz,
  last_verified_at timestamptz,
  session_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pjud_access_connections_status_check check (status in ('active', 'expired', 'disconnected')),
  constraint pjud_access_connections_access_type_check check (access_type in ('pjud'))
);

create unique index if not exists pjud_access_connections_user_type_uidx
  on public.pjud_access_connections (user_id, access_type);

create index if not exists pjud_access_connections_user_status_idx
  on public.pjud_access_connections (user_id, status);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pjud_access_connections_touch_updated_at on public.pjud_access_connections;
create trigger pjud_access_connections_touch_updated_at
before update on public.pjud_access_connections
for each row execute function public.touch_updated_at();

alter table public.pjud_access_connections enable row level security;

grant select, insert, update, delete on public.pjud_access_connections to authenticated, service_role;

drop policy if exists "pjud_access_connections_select_own" on public.pjud_access_connections;
create policy "pjud_access_connections_select_own" on public.pjud_access_connections
for select using (user_id = auth.uid());

drop policy if exists "pjud_access_connections_insert_own" on public.pjud_access_connections;
create policy "pjud_access_connections_insert_own" on public.pjud_access_connections
for insert with check (user_id = auth.uid());

drop policy if exists "pjud_access_connections_update_own" on public.pjud_access_connections;
create policy "pjud_access_connections_update_own" on public.pjud_access_connections
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "pjud_access_connections_delete_own" on public.pjud_access_connections;
create policy "pjud_access_connections_delete_own" on public.pjud_access_connections
for delete using (user_id = auth.uid());

select pg_notify('pgrst', 'reload schema');
