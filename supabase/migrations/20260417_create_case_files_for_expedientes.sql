create extension if not exists pgcrypto;

create table if not exists public.case_files (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  folder_category text not null check (folder_category in (
    'ebook',
    'documento',
    'absolucion_posiciones',
    'jurisprudencia',
    'doctrina',
    'incidentes',
    'escritos',
    'resoluciones',
    'notificaciones',
    'trazabilidad',
    'importados_pjud'
  )),
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0,
  storage_bucket text not null default 'case-files',
  storage_path text,
  file_url text,
  source_type text not null default 'manual' check (source_type in ('manual', 'pjud', 'generado', 'migrado')),
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists case_files_case_idx on public.case_files (case_id, created_at desc);
create index if not exists case_files_folder_idx on public.case_files (folder_category);
create index if not exists case_files_source_idx on public.case_files (source_type);

create or replace function public.touch_case_files_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_case_files_updated_at on public.case_files;
create trigger trg_touch_case_files_updated_at
before update on public.case_files
for each row
execute function public.touch_case_files_updated_at();

alter table public.case_files enable row level security;

drop policy if exists "case_files_select_authenticated" on public.case_files;
create policy "case_files_select_authenticated"
  on public.case_files
  for select
  to authenticated
  using (true);

drop policy if exists "case_files_insert_authenticated" on public.case_files;
create policy "case_files_insert_authenticated"
  on public.case_files
  for insert
  to authenticated
  with check (auth.uid() = created_by or created_by is null);

drop policy if exists "case_files_update_authenticated" on public.case_files;
create policy "case_files_update_authenticated"
  on public.case_files
  for update
  to authenticated
  using (auth.uid() = created_by or created_by is null)
  with check (auth.uid() = created_by or created_by is null);

drop policy if exists "case_files_delete_authenticated" on public.case_files;
create policy "case_files_delete_authenticated"
  on public.case_files
  for delete
  to authenticated
  using (auth.uid() = created_by or created_by is null);

insert into storage.buckets (id, name, public, file_size_limit)
values ('case-files', 'case-files', false, 524288000)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "case_files_storage_select_authenticated" on storage.objects;
create policy "case_files_storage_select_authenticated"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'case-files');

drop policy if exists "case_files_storage_insert_authenticated" on storage.objects;
create policy "case_files_storage_insert_authenticated"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'case-files');

drop policy if exists "case_files_storage_update_authenticated" on storage.objects;
create policy "case_files_storage_update_authenticated"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'case-files')
  with check (bucket_id = 'case-files');

drop policy if exists "case_files_storage_delete_authenticated" on storage.objects;
create policy "case_files_storage_delete_authenticated"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'case-files');
