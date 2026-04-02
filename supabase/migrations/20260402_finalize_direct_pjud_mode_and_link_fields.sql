-- Consolidación final de campos PJUD directos en la estructura central de Alpha (tabla cases).

alter table public.cases
  add column if not exists pjud_role_type text,
  add column if not exists pjud_role_letter text,
  add column if not exists pjud_role_number integer,
  add column if not exists pjud_role_year integer,
  add column if not exists pjud_court_name text,
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
  pjud_source_mode = coalesce(pjud_source_mode, 'modo_directo_pjud'),
  pjud_files_downloaded_count = coalesce(pjud_files_downloaded_count, 0)
where true;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'cases_pjud_estado_vinculo_check'
  ) then
    alter table public.cases drop constraint cases_pjud_estado_vinculo_check;
  end if;
end $$;

alter table public.cases
  add constraint cases_pjud_estado_vinculo_check
  check (coalesce(pjud_estado_vinculo, pjud_link_status, 'unlinked') in ('linked', 'unlinked', 'ambiguous', 'needs_review', 'sync_pending', 'sync_failed'));

alter table public.pjud_cases
  drop constraint if exists pjud_cases_link_status_check;

alter table public.pjud_cases
  add constraint pjud_cases_link_status_check
  check (link_status in ('linked', 'unlinked', 'ambiguous', 'needs_review', 'sync_pending', 'sync_failed'));

select pg_notify('pgrst', 'reload schema');
