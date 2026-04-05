create extension if not exists pgcrypto;

create table if not exists public.pjud_access_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  access_type text not null default 'pjud',
  status text not null default 'active',
  base_url_mis_causas text,
  session_context jsonb,
  last_connected_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pjud_access_connections
  alter column access_type set default 'pjud',
  alter column status set default 'active',
  alter column updated_at set default now(),
  alter column created_at set default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pjud_access_connections_status_check'
      and conrelid = 'public.pjud_access_connections'::regclass
  ) then
    alter table public.pjud_access_connections
      add constraint pjud_access_connections_status_check
      check (status in ('active', 'expired', 'disconnected')) not valid;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'pjud_access_connections_status_check'
      and conrelid = 'public.pjud_access_connections'::regclass
      and not convalidated
  ) then
    alter table public.pjud_access_connections
      validate constraint pjud_access_connections_status_check;
  end if;
end
$$;

create index if not exists idx_pjud_access_connections_user_id
  on public.pjud_access_connections(user_id);

create index if not exists idx_pjud_access_connections_status
  on public.pjud_access_connections(status);

create index if not exists idx_pjud_access_connections_updated_at
  on public.pjud_access_connections(updated_at);

create unique index if not exists pjud_access_connections_user_type_uidx
  on public.pjud_access_connections (user_id, access_type);

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
