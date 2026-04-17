-- Ensure cause Excel upload persistence is writable/readable by authenticated clients.
grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on public.cause_excel_upload_batches to authenticated, service_role;
grant select, insert, update, delete on public.cause_excel_upload_rows to authenticated, service_role;

-- Keep RLS enabled in case environments were provisioned before the initial migration.
alter table if exists public.cause_excel_upload_batches enable row level security;
alter table if exists public.cause_excel_upload_rows enable row level security;
