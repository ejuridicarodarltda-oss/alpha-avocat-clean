alter table if exists public.cause_monitoring_state
  add column if not exists prescriptions_rows jsonb not null default '[]'::jsonb,
  add column if not exists special_prescription_rows jsonb not null default '[]'::jsonb;
