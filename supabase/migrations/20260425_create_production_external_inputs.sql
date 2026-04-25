create table if not exists public.production_external_inputs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  type text not null,
  file_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_external_inputs_name_not_empty check (char_length(trim(name)) > 0)
);

create index if not exists production_external_inputs_owner_created_idx
  on public.production_external_inputs(owner_user_id, created_at desc);

alter table public.production_external_inputs enable row level security;

drop policy if exists "production_external_inputs_owner_select" on public.production_external_inputs;
create policy "production_external_inputs_owner_select"
  on public.production_external_inputs
  for select
  using (auth.uid() = owner_user_id);

drop policy if exists "production_external_inputs_owner_insert" on public.production_external_inputs;
create policy "production_external_inputs_owner_insert"
  on public.production_external_inputs
  for insert
  with check (auth.uid() = owner_user_id);

drop policy if exists "production_external_inputs_owner_update" on public.production_external_inputs;
create policy "production_external_inputs_owner_update"
  on public.production_external_inputs
  for update
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

drop policy if exists "production_external_inputs_owner_delete" on public.production_external_inputs;
create policy "production_external_inputs_owner_delete"
  on public.production_external_inputs
  for delete
  using (auth.uid() = owner_user_id);

create or replace function public.touch_production_external_inputs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists production_external_inputs_touch_updated_at on public.production_external_inputs;
create trigger production_external_inputs_touch_updated_at
before update on public.production_external_inputs
for each row execute function public.touch_production_external_inputs_updated_at();
