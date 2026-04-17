create table if not exists public.pjud_ebook_routing_logs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid null references public.cases(id) on delete set null,
  expediente_digital_id text,
  tribunal_detectado text,
  rol_detectado text,
  caratula_detectada text,
  nivel_confianza text not null default 'none' check (nivel_confianza in ('high','medium','low','none')),
  fecha_descarga timestamptz not null default now(),
  origen text not null default 'PJUD',
  nombre_original_archivo text,
  resultado_matching text not null default 'pendiente_asignacion' check (resultado_matching in ('coincidencia_alta','coincidencia_con_advertencia','pendiente_asignacion','rechazado')),
  sugerencias jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pjud_ebook_routing_logs_owner_created_idx
  on public.pjud_ebook_routing_logs (owner_user_id, created_at desc);

create index if not exists pjud_ebook_routing_logs_case_idx
  on public.pjud_ebook_routing_logs (case_id, fecha_descarga desc);

alter table public.pjud_ebook_routing_logs enable row level security;

grant select, insert, update, delete on public.pjud_ebook_routing_logs to authenticated, service_role;

drop policy if exists "pjud_ebook_routing_logs_select_own" on public.pjud_ebook_routing_logs;
create policy "pjud_ebook_routing_logs_select_own"
  on public.pjud_ebook_routing_logs
  for select
  to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists "pjud_ebook_routing_logs_insert_own" on public.pjud_ebook_routing_logs;
create policy "pjud_ebook_routing_logs_insert_own"
  on public.pjud_ebook_routing_logs
  for insert
  to authenticated
  with check (owner_user_id = auth.uid());

drop policy if exists "pjud_ebook_routing_logs_update_own" on public.pjud_ebook_routing_logs;
create policy "pjud_ebook_routing_logs_update_own"
  on public.pjud_ebook_routing_logs
  for update
  to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "pjud_ebook_routing_logs_delete_own" on public.pjud_ebook_routing_logs;
create policy "pjud_ebook_routing_logs_delete_own"
  on public.pjud_ebook_routing_logs
  for delete
  to authenticated
  using (owner_user_id = auth.uid());
