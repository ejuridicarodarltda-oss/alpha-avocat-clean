alter table if exists public.procedure_catalog
  add column if not exists competent_body text default '',
  add column if not exists start_form text default '',
  add column if not exists legal_basis text default '',
  add column if not exists editable_by_user boolean not null default true;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'procedure_flow_nodes_unique_name'
  ) then
    alter table public.procedure_flow_nodes
      add constraint procedure_flow_nodes_unique_name unique (procedure_slug, node_name);
  end if;
end $$;

alter table if exists public.procedure_flow_routes
  add column if not exists route_name text default '';

create unique index if not exists procedure_flow_routes_unique_route_name
  on public.procedure_flow_routes (procedure_slug, route_name);

create table if not exists public.procedure_alert_templates (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  procedure_name text not null,
  milestone_name text not null default '',
  route_name text not null default '',
  alert_type text not null,
  term text not null default 'plazo variable según norma/resolución',
  visible_panel boolean not null default true,
  visible_monitoring boolean not null default true,
  visible_case boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(category, procedure_name, milestone_name, route_name, alert_type)
);

create unique index if not exists procedure_catalog_unique_category_name
  on public.procedure_catalog (category, name);

create unique index if not exists cause_monitoring_alerts_case_alert_key
  on public.cause_monitoring_alerts (case_id, alert_key);
