-- Flujo principal: vinculación directa PJUD <-> causa Alpha (tabla cases).
-- Excel queda como mecanismo opcional de apoyo (histórico/contingencia/importación extraordinaria).

alter table public.cases
  add column if not exists pjud_rol_tipo text,
  add column if not exists pjud_rol_letra text,
  add column if not exists pjud_rol_numero integer,
  add column if not exists pjud_rol_anio integer,
  add column if not exists pjud_tribunal text,
  add column if not exists pjud_url text,
  add column if not exists pjud_ebook_url text,
  add column if not exists pjud_estado_vinculo text default 'unlinked',
  add column if not exists pjud_ultima_sincronizacion timestamptz,
  add column if not exists pjud_normalized_key text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cases_pjud_estado_vinculo_check'
  ) then
    alter table public.cases
      add constraint cases_pjud_estado_vinculo_check
      check (pjud_estado_vinculo in ('linked', 'unlinked', 'ambiguous', 'needs_review'));
  end if;
end $$;

create index if not exists cases_owner_pjud_estado_vinculo_idx
  on public.cases (owner_user_id, pjud_estado_vinculo);

update public.cases c
set
  pjud_rol_tipo = coalesce(c.pjud_rol_tipo, pc.role_type),
  pjud_rol_letra = coalesce(c.pjud_rol_letra, pc.role_letter),
  pjud_rol_numero = coalesce(c.pjud_rol_numero, pc.role_number),
  pjud_rol_anio = coalesce(c.pjud_rol_anio, pc.role_year),
  pjud_tribunal = coalesce(c.pjud_tribunal, pc.court_name, c.court),
  pjud_url = coalesce(c.pjud_url, pc.pjud_url, c.pjud_case_url),
  pjud_ebook_url = coalesce(c.pjud_ebook_url, pc.ebook_url, c.pjud_ebook_url),
  pjud_estado_vinculo = coalesce(c.pjud_estado_vinculo, c.pjud_link_status, pc.link_status, 'unlinked'),
  pjud_ultima_sincronizacion = coalesce(c.pjud_ultima_sincronizacion, c.pjud_last_sync_at),
  pjud_normalized_key = coalesce(c.pjud_normalized_key, pc.normalized_key)
from public.pjud_cases pc
where c.pjud_case_id = pc.id;

update public.cases
set
  pjud_estado_vinculo = coalesce(pjud_estado_vinculo, pjud_link_status, 'unlinked'),
  pjud_ultima_sincronizacion = coalesce(pjud_ultima_sincronizacion, pjud_last_sync_at),
  pjud_tribunal = coalesce(pjud_tribunal, court),
  pjud_url = coalesce(pjud_url, pjud_case_url);

select pg_notify('pgrst', 'reload schema');
