-- Ensure cases.import_batch_id exists and is exposed to PostgREST

alter table public.cases
add column if not exists import_batch_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cases_import_batch_id_fkey'
      and conrelid = 'public.cases'::regclass
  ) then
    alter table public.cases
    add constraint cases_import_batch_id_fkey
    foreign key (import_batch_id)
    references public.pjud_import_batches(id)
    on delete set null;
  end if;
end
$$;

create index if not exists idx_cases_import_batch_id
on public.cases(import_batch_id);

notify pgrst, 'reload schema';
