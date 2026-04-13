alter table if exists public.cases
  add column if not exists manual_caratula text,
  add column if not exists manual_procedure text,
  add column if not exists manual_court_type text,
  add column if not exists manual_entry_date date,
  add column if not exists manual_participants_text text,
  add column if not exists manual_complementary_data text,
  add column if not exists manual_deleted_at timestamptz,
  add column if not exists manual_deleted_by uuid,
  add column if not exists manual_deleted_note text;

create index if not exists cases_owner_manual_deleted_idx
  on public.cases (owner_user_id, manual_deleted_at, created_at desc);

create unique index if not exists cases_owner_manual_role_tribunal_unique_active
  on public.cases (
    owner_user_id,
    lower(coalesce(rol, '')),
    lower(coalesce(court, ''))
  )
  where manual_deleted_at is null
    and coalesce(rol, '') <> ''
    and coalesce(court, '') <> '';
