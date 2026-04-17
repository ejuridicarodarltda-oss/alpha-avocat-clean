create table if not exists public.extraction_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  cause_id uuid null,
  context_key text null,
  extraction_payload jsonb not null default '{}'::jsonb,
  confidence_payload jsonb not null default '{}'::jsonb,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists extraction_logs_user_created_idx
  on public.extraction_logs (user_id, created_at desc);

create table if not exists public.extraction_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  cause_id uuid null,
  field_name text not null,
  detected_value text null,
  corrected_value text not null,
  confidence_level text null,
  source_type text not null default 'correccion_usuario',
  created_at timestamptz not null default now()
);

create index if not exists extraction_feedback_user_field_idx
  on public.extraction_feedback (user_id, field_name, created_at desc);

create table if not exists public.normalization_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  entity_type text not null,
  source_value text not null,
  normalized_value text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists normalization_rules_user_entity_source_uidx
  on public.normalization_rules (user_id, entity_type, source_value);

alter table public.extraction_logs enable row level security;
alter table public.extraction_feedback enable row level security;
alter table public.normalization_rules enable row level security;

drop policy if exists extraction_logs_owner_rw on public.extraction_logs;
create policy extraction_logs_owner_rw
on public.extraction_logs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists extraction_feedback_owner_rw on public.extraction_feedback;
create policy extraction_feedback_owner_rw
on public.extraction_feedback
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists normalization_rules_owner_rw on public.normalization_rules;
create policy normalization_rules_owner_rw
on public.normalization_rules
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
