-- Agrega trazabilidad de ruta documental PJUD para separar importación estructural vs descarga real por URL.
alter table if exists public.cases
  add column if not exists pjud_case_url text,
  add column if not exists pjud_case_detail_url text,
  add column if not exists pjud_ebook_url text,
  add column if not exists pjud_documents_url text,
  add column if not exists route_status text,
  add column if not exists route_error text,
  add column if not exists content_source text default 'pjud_url',
  add column if not exists content_detected_count integer not null default 0,
  add column if not exists content_downloaded_count integer not null default 0;

update public.cases
set content_source = coalesce(nullif(content_source, ''), 'pjud_url')
where content_source is null or btrim(content_source) = '';
