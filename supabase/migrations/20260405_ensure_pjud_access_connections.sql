create extension if not exists pgcrypto;

create table if not exists public.pjud_access_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  access_type text not null default 'pjud',
  status text not null default 'active' check (status in ('active','expired','disconnected')),
  base_url_mis_causas text,
  session_context jsonb,
  last_connected_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pjud_access_connections_user_id
  on public.pjud_access_connections(user_id);

create index if not exists idx_pjud_access_connections_status
  on public.pjud_access_connections(status);

create index if not exists idx_pjud_access_connections_updated_at
  on public.pjud_access_connections(updated_at);
