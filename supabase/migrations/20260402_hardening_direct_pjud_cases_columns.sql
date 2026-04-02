-- Hardening final para asegurar columnas de vínculo PJUD directo en public.cases.

alter table public.cases
  add column if not exists pjud_role_type text,
  add column if not exists pjud_role_letter text,
  add column if not exists pjud_role_number integer,
  add column if not exists pjud_role_year integer,
  add column if not exists pjud_court_name text,
  add column if not exists pjud_normalized_key text,
  add column if not exists pjud_url text,
  add column if not exists pjud_ebook_url text,
  add column if not exists pjud_link_status text not null default 'unlinked',
  add column if not exists pjud_last_sync_at timestamptz,
  add column if not exists pjud_source_mode text default 'modo_directo_pjud',
  add column if not exists pjud_last_error text,
  add column if not exists pjud_files_downloaded_count integer default 0;

update public.cases
set
  pjud_role_type = coalesce(pjud_role_type, pjud_rol_tipo),
  pjud_role_letter = coalesce(pjud_role_letter, pjud_rol_letra),
  pjud_role_number = coalesce(pjud_role_number, pjud_rol_numero),
  pjud_role_year = coalesce(pjud_role_year, pjud_rol_anio),
  pjud_court_name = coalesce(pjud_court_name, pjud_tribunal, court),
  pjud_link_status = coalesce(pjud_link_status, pjud_estado_vinculo, 'unlinked'),
  pjud_source_mode = coalesce(pjud_source_mode, 'modo_directo_pjud'),
  pjud_files_downloaded_count = coalesce(pjud_files_downloaded_count, 0)
where true;

select pg_notify('pgrst', 'reload schema');
