create extension if not exists pgcrypto;

create table if not exists public.pjud_access_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  access_type text not null default 'pjud',
  status text not null default 'active' check (status in ('active','expired','disconnected')),
  base_url_mis_causas text,
  raw_detected_url text,
  session_context jsonb,
  last_connected_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.pjud_access_connections
  add column if not exists raw_detected_url text;

create index if not exists idx_pjud_access_connections_user_id
  on public.pjud_access_connections(user_id);

create index if not exists idx_pjud_access_connections_status
  on public.pjud_access_connections(status);

create index if not exists idx_pjud_access_connections_updated_at
  on public.pjud_access_connections(updated_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_pjud_access_connections_updated_at
on public.pjud_access_connections;

create trigger trg_pjud_access_connections_updated_at
before update on public.pjud_access_connections
for each row
execute function public.set_updated_at();

alter table public.pjud_access_connections enable row level security;

drop policy if exists "pjud_access_select_own"
on public.pjud_access_connections;

create policy "pjud_access_select_own"
on public.pjud_access_connections
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "pjud_access_insert_own"
on public.pjud_access_connections;

create policy "pjud_access_insert_own"
on public.pjud_access_connections
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "pjud_access_update_own"
on public.pjud_access_connections;

create policy "pjud_access_update_own"
on public.pjud_access_connections
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
