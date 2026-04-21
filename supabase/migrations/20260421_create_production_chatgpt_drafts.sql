create extension if not exists pgcrypto;

create table if not exists public.production_draft_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  cause_id text not null,
  cause_rol text,
  cause_tribunal text,
  cause_caratula text,
  status text not null default 'en_revision',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.production_draft_versions (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.production_draft_sessions(id) on delete cascade,
  owner_user_id uuid not null default auth.uid(),
  cause_id text not null,
  draft_type text not null,
  draft_text text not null,
  chat_history jsonb not null default '[]'::jsonb,
  selected_antecedentes jsonb not null default '[]'::jsonb,
  status text not null default 'en_revision',
  word_file_name text,
  word_html text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists production_draft_sessions_owner_idx on public.production_draft_sessions(owner_user_id, updated_at desc);
create index if not exists production_draft_sessions_cause_idx on public.production_draft_sessions(cause_id, updated_at desc);
create index if not exists production_draft_versions_session_idx on public.production_draft_versions(session_id, created_at desc);

alter table public.production_draft_sessions enable row level security;
alter table public.production_draft_versions enable row level security;

drop policy if exists "production_draft_sessions_owner_select" on public.production_draft_sessions;
create policy "production_draft_sessions_owner_select"
  on public.production_draft_sessions
  for select
  using (auth.uid() = owner_user_id);

drop policy if exists "production_draft_sessions_owner_insert" on public.production_draft_sessions;
create policy "production_draft_sessions_owner_insert"
  on public.production_draft_sessions
  for insert
  with check (auth.uid() = owner_user_id);

drop policy if exists "production_draft_sessions_owner_update" on public.production_draft_sessions;
create policy "production_draft_sessions_owner_update"
  on public.production_draft_sessions
  for update
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

drop policy if exists "production_draft_versions_owner_select" on public.production_draft_versions;
create policy "production_draft_versions_owner_select"
  on public.production_draft_versions
  for select
  using (auth.uid() = owner_user_id);

drop policy if exists "production_draft_versions_owner_insert" on public.production_draft_versions;
create policy "production_draft_versions_owner_insert"
  on public.production_draft_versions
  for insert
  with check (auth.uid() = owner_user_id);

create or replace function public.touch_production_draft_session_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists production_draft_sessions_touch_updated_at on public.production_draft_sessions;
create trigger production_draft_sessions_touch_updated_at
before update on public.production_draft_sessions
for each row execute function public.touch_production_draft_session_updated_at();
