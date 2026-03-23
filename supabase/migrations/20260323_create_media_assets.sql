create extension if not exists pgcrypto;

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  media_type text not null check (media_type in ('photo', 'audio', 'video', 'av')),
  media_role text not null default 'attachment' check (media_role in ('avatar', 'evidence', 'activity_record', 'attachment')),
  storage_bucket text not null default 'alpha-media',
  storage_path text not null unique,
  file_url text not null,
  file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null default 0,
  duration_seconds numeric(10,2),
  client_id uuid null references public.clients(id) on delete set null,
  case_id uuid null references public.cases(id) on delete set null,
  appointment_id uuid null references public.appointments(id) on delete cascade,
  client_ref text null,
  case_ref text null,
  created_by uuid null references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  notes text null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists media_assets_appointment_idx on public.media_assets (appointment_id, created_at desc);
create index if not exists media_assets_case_idx on public.media_assets (case_id, created_at desc);
create index if not exists media_assets_client_idx on public.media_assets (client_id, created_at desc);
create index if not exists media_assets_type_idx on public.media_assets (media_type);
create index if not exists media_assets_role_idx on public.media_assets (media_role);

alter table public.media_assets enable row level security;

drop policy if exists "media_assets_select_authenticated" on public.media_assets;

create policy "media_assets_select_authenticated"
  on public.media_assets
  for select
  to authenticated
  using (true);

drop policy if exists "media_assets_insert_authenticated" on public.media_assets;

create policy "media_assets_insert_authenticated"
  on public.media_assets
  for insert
  to authenticated
  with check (auth.uid() = created_by or created_by is null);

drop policy if exists "media_assets_update_authenticated" on public.media_assets;

create policy "media_assets_update_authenticated"
  on public.media_assets
  for update
  to authenticated
  using (auth.uid() = created_by or created_by is null)
  with check (auth.uid() = created_by or created_by is null);

drop policy if exists "media_assets_delete_authenticated" on public.media_assets;

create policy "media_assets_delete_authenticated"
  on public.media_assets
  for delete
  to authenticated
  using (auth.uid() = created_by or created_by is null);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'alpha-media',
  'alpha-media',
  true,
  230686720,
  array['image/jpeg', 'image/png', 'image/webp', 'audio/webm', 'audio/mp4', 'audio/ogg', 'video/webm', 'video/mp4']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "alpha_media_public_read" on storage.objects;

create policy "alpha_media_public_read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'alpha-media');

drop policy if exists "alpha_media_authenticated_upload" on storage.objects;

create policy "alpha_media_authenticated_upload"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'alpha-media');

drop policy if exists "alpha_media_authenticated_update" on storage.objects;

create policy "alpha_media_authenticated_update"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'alpha-media')
  with check (bucket_id = 'alpha-media');

drop policy if exists "alpha_media_authenticated_delete" on storage.objects;

create policy "alpha_media_authenticated_delete"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'alpha-media');
