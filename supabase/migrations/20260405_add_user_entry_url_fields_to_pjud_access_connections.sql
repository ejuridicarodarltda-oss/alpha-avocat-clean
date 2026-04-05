alter table if exists public.pjud_access_connections
  add column if not exists raw_user_url text,
  add column if not exists normalized_entry_url text,
  add column if not exists url_validation_status text,
  add column if not exists last_validated_at timestamptz,
  add column if not exists access_status text;

update public.pjud_access_connections
set
  raw_user_url = coalesce(raw_user_url, base_url_mis_causas),
  normalized_entry_url = coalesce(normalized_entry_url, base_url_mis_causas),
  url_validation_status = coalesce(url_validation_status, case
    when base_url_mis_causas is null or btrim(base_url_mis_causas) = '' then 'invalid'
    else 'valid_with_reservations'
  end),
  last_validated_at = coalesce(last_validated_at, last_verified_at, updated_at, now()),
  access_status = coalesce(access_status, status)
where true;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pjud_access_connections_url_validation_status_check'
      and conrelid = 'public.pjud_access_connections'::regclass
  ) then
    alter table public.pjud_access_connections
      add constraint pjud_access_connections_url_validation_status_check
      check (url_validation_status in ('valid', 'valid_with_reservations', 'invalid')) not valid;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'pjud_access_connections_url_validation_status_check'
      and conrelid = 'public.pjud_access_connections'::regclass
      and not convalidated
  ) then
    alter table public.pjud_access_connections
      validate constraint pjud_access_connections_url_validation_status_check;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pjud_access_connections_access_status_check'
      and conrelid = 'public.pjud_access_connections'::regclass
  ) then
    alter table public.pjud_access_connections
      add constraint pjud_access_connections_access_status_check
      check (access_status in ('active', 'expired', 'disconnected')) not valid;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'pjud_access_connections_access_status_check'
      and conrelid = 'public.pjud_access_connections'::regclass
      and not convalidated
  ) then
    alter table public.pjud_access_connections
      validate constraint pjud_access_connections_access_status_check;
  end if;
end
$$;

create index if not exists idx_pjud_access_connections_user_validation
  on public.pjud_access_connections(user_id, url_validation_status);

select pg_notify('pgrst', 'reload schema');
