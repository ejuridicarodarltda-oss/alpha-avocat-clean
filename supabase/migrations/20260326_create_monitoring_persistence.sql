create extension if not exists "pgcrypto";

create table if not exists public.procedure_catalog (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  category text not null,
  description text default '',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.procedure_flow_nodes (
  id uuid primary key default gen_random_uuid(),
  procedure_slug text not null references public.procedure_catalog(slug) on delete cascade,
  node_key text not null,
  node_name text not null,
  description text default '',
  term text default '',
  legal_basis text default '',
  docs text default '',
  alerts text default '',
  outputs text default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (procedure_slug, node_key)
);

create table if not exists public.procedure_flow_routes (
  id uuid primary key default gen_random_uuid(),
  procedure_slug text not null references public.procedure_catalog(slug) on delete cascade,
  from_node_key text,
  to_node_key text,
  condition text default '',
  conduct text default '',
  route text default '',
  next_milestone text default '',
  new_alert text default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.cause_monitoring_state (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  case_ref text,
  procedure_slug text,
  procedure_name text,
  procedure_status text,
  confidence numeric(5,4) not null default 0,
  current_milestone text,
  next_milestone text,
  route_followed text,
  fulfilled_milestones jsonb not null default '[]'::jsonb,
  pending_milestones jsonb not null default '[]'::jsonb,
  running_deadlines jsonb not null default '[]'::jsonb,
  flow_snapshot jsonb not null default '{}'::jsonb,
  validations jsonb not null default '[]'::jsonb,
  manual_corrections jsonb not null default '[]'::jsonb,
  updated_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (case_id)
);

create table if not exists public.cause_monitoring_alerts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  alert_key text,
  title text not null,
  summary text default '',
  foundation text default '',
  urgency text default 'media',
  deadline timestamptz,
  status text default 'pendiente',
  source text default 'Monitoreo',
  trace jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.cause_monitoring_suggestions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  title text not null,
  suggestion_type text default 'escrito',
  detail text default '',
  status text default 'activa',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.cause_monitoring_overrides (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  override_type text not null,
  payload jsonb not null default '{}'::jsonb,
  note text default '',
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.cause_monitoring_history (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz not null default timezone('utc', now())
);

insert into public.procedure_catalog (slug, name, category, description)
values
  ('juicio-ordinario-mayor-cuantia', 'juicio ordinario de mayor cuantía', 'Civil / CPC / Código Civil', 'Procedimiento ordinario civil de mayor cuantía.'),
  ('procedimiento-sumario', 'procedimiento sumario', 'Civil / CPC / Código Civil', 'Procedimiento sumario con tramitación concentrada.'),
  ('juicio-ejecutivo-obligacion-dar', 'juicio ejecutivo de obligación de dar', 'Civil / CPC / Código Civil', 'Ejecución para obligaciones de dar.'),
  ('procedimiento-familia-ordinario', 'procedimiento ordinario o común ante tribunales de familia', 'Familia', 'Aplicación general ante tribunales de familia.'),
  ('procedimiento-penal-oral', 'procedimiento ordinario con juicio oral', 'Penal', 'Secuencia penal con juicio oral.')
on conflict (slug) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  updated_at = timezone('utc', now());
