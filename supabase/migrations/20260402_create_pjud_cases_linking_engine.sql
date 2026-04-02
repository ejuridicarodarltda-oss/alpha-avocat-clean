create extension if not exists unaccent;

create table if not exists public.pjud_cases (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'pjud',
  materia text,
  role_type text,
  role_letter text,
  role_number integer,
  role_year integer,
  rol_full text,
  court_name text,
  court_normalized text,
  caratula text,
  partes_json jsonb not null default '[]'::jsonb,
  pjud_url text,
  ebook_url text,
  normalized_key text,
  alpha_case_id uuid null references public.cases(id) on delete set null,
  link_status text not null default 'unlinked',
  confidence numeric(5,2) null,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pjud_cases_link_status_check check (link_status in ('linked', 'unlinked', 'ambiguous', 'needs_review'))
);

create index if not exists pjud_cases_owner_created_idx on public.pjud_cases (owner_user_id, created_at desc);
create index if not exists pjud_cases_alpha_case_idx on public.pjud_cases (alpha_case_id);
create unique index if not exists pjud_cases_owner_normalized_key_uidx
  on public.pjud_cases (owner_user_id, normalized_key)
  where normalized_key is not null;

alter table public.cases
  add column if not exists pjud_case_id uuid references public.pjud_cases(id) on delete set null,
  add column if not exists pjud_normalized_key text,
  add column if not exists pjud_url text,
  add column if not exists pjud_ebook_url text,
  add column if not exists pjud_link_status text not null default 'unlinked',
  add column if not exists pjud_last_sync_at timestamptz;

create index if not exists cases_owner_pjud_normalized_key_idx on public.cases (owner_user_id, pjud_normalized_key);
create unique index if not exists cases_owner_pjud_case_id_uidx
  on public.cases (owner_user_id, pjud_case_id)
  where pjud_case_id is not null;

create table if not exists public.pjud_case_link_audit_logs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  pjud_case_id uuid not null references public.pjud_cases(id) on delete cascade,
  alpha_case_id uuid not null references public.cases(id) on delete cascade,
  action text not null,
  mode text not null,
  linked_by uuid null references auth.users(id) on delete set null,
  confidence numeric(5,2) null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint pjud_case_link_action_check check (action in ('linked', 'unlinked', 'relinked')),
  constraint pjud_case_link_mode_check check (mode in ('automatic', 'manual'))
);

create index if not exists pjud_case_link_audit_owner_created_idx on public.pjud_case_link_audit_logs (owner_user_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pjud_cases_touch_updated_at on public.pjud_cases;
create trigger pjud_cases_touch_updated_at
before update on public.pjud_cases
for each row execute function public.touch_updated_at();

create or replace function public.normalize_pjud_text(input_text text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(lower(unaccent(coalesce(input_text, ''))), '\s+', ' ', 'g'));
$$;

create or replace function public.normalize_pjud_court(court_input text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(public.normalize_pjud_text(court_input), '[^a-z0-9]+', '_', 'g'), '');
$$;

create or replace function public.parse_pjud_role(role_input text)
returns table(role_type text, role_letter text, role_number integer, role_year integer, rol_full text)
language plpgsql
immutable
as $$
declare
  clean text := public.normalize_pjud_text(role_input);
  detected text;
  letter text;
  role_num integer;
  role_yr integer;
begin
  clean := regexp_replace(clean, '\s+', ' ', 'g');
  if clean ~ '(^|\s)ruc(\s|$)' then detected := 'RUC';
  elsif clean ~ '(^|\s)rit(\s|$)' then detected := 'RIT';
  else detected := 'ROL';
  end if;

  letter := upper(coalesce((regexp_match(clean, '([a-z])\s*[-/]\s*\d+\s*[-/]\s*\d{2,4}'))[1], ''));
  if letter = '' then
    letter := upper(coalesce((regexp_match(clean, '(?:rol|rit|ruc)?\s*([a-z])\s*[-/]\s*\d+'))[1], ''));
  end if;

  role_num := nullif((regexp_match(clean, '(?:rol|rit|ruc)?\s*[a-z]?\s*[-/]?\s*(\d{1,9})\s*[-/]\s*\d{2,4}'))[1], '')::integer;
  if role_num is null then
    role_num := nullif((regexp_match(clean, '(?:rol|rit|ruc)?\s*[a-z]?\s*[-/]?\s*(\d{1,9})'))[1], '')::integer;
  end if;

  role_yr := nullif((regexp_match(clean, '(19\d{2}|20\d{2}|\d{2})\s*$'))[1], '')::integer;
  if role_yr is not null and role_yr < 100 then
    role_yr := role_yr + 2000;
  end if;

  return query select detected, nullif(letter, ''), role_num, role_yr,
    nullif(trim(concat_ws('-', nullif(letter, ''), role_num::text, role_yr::text)), '');
end;
$$;

create or replace function public.build_pjud_normalized_key(
  materia_input text,
  role_type_input text,
  role_letter_input text,
  role_number_input integer,
  role_year_input integer,
  court_input text
)
returns text
language sql
immutable
as $$
  select nullif(concat_ws('|',
    nullif(public.normalize_pjud_text(materia_input), ''),
    upper(nullif(public.normalize_pjud_text(role_type_input), '')),
    upper(nullif(public.normalize_pjud_text(role_letter_input), '')),
    nullif(role_number_input::text, ''),
    nullif(role_year_input::text, ''),
    nullif(public.normalize_pjud_court(court_input), '')
  ), '');
$$;

create or replace function public.build_pjud_normalized_key_from_text(
  materia_input text,
  role_input text,
  court_input text
)
returns text
language plpgsql
immutable
as $$
declare
  parsed record;
begin
  select * into parsed from public.parse_pjud_role(role_input);
  return public.build_pjud_normalized_key(
    materia_input,
    parsed.role_type,
    parsed.role_letter,
    parsed.role_number,
    parsed.role_year,
    court_input
  );
end;
$$;

alter table public.pjud_cases enable row level security;
alter table public.pjud_case_link_audit_logs enable row level security;

grant select, insert, update, delete on public.pjud_cases to authenticated, service_role;
grant select, insert, update, delete on public.pjud_case_link_audit_logs to authenticated, service_role;

drop policy if exists "pjud_cases_select_own" on public.pjud_cases;
create policy "pjud_cases_select_own" on public.pjud_cases
for select using (owner_user_id = auth.uid());

drop policy if exists "pjud_cases_insert_own" on public.pjud_cases;
create policy "pjud_cases_insert_own" on public.pjud_cases
for insert with check (owner_user_id = auth.uid());

drop policy if exists "pjud_cases_update_own" on public.pjud_cases;
create policy "pjud_cases_update_own" on public.pjud_cases
for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

drop policy if exists "pjud_cases_delete_own" on public.pjud_cases;
create policy "pjud_cases_delete_own" on public.pjud_cases
for delete using (owner_user_id = auth.uid());

drop policy if exists "pjud_case_link_logs_select_own" on public.pjud_case_link_audit_logs;
create policy "pjud_case_link_logs_select_own" on public.pjud_case_link_audit_logs
for select using (owner_user_id = auth.uid());

drop policy if exists "pjud_case_link_logs_insert_own" on public.pjud_case_link_audit_logs;
create policy "pjud_case_link_logs_insert_own" on public.pjud_case_link_audit_logs
for insert with check (owner_user_id = auth.uid());

select pg_notify('pgrst', 'reload schema');
