alter table if exists public.pjud_causes_index
  add column if not exists detail_action text,
  add column if not exists detail_selector text;

create index if not exists pjud_causes_index_detail_action_idx
  on public.pjud_causes_index (detail_action);

select pg_notify('pgrst', 'reload schema');
