create extension if not exists pgcrypto;

create table if not exists public.wnmu_monthly_schedules_shared_marks (
  id uuid primary key default gen_random_uuid(),

  channel_code text not null check (channel_code in ('13.1', '13.3')),
  channel_slug text not null,
  month_key text not null check (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  entry_key text not null,

  mark_json jsonb not null default '{}'::jsonb,

  legacy_project_scope text,
  legacy_entry_key text,
  legacy_is_marked boolean,
  legacy_note text,

  source text not null default 'browser-localstorage',
  updated_by text,
  updated_at timestamptz not null default now(),

  unique (channel_code, month_key, entry_key)
);

create index if not exists wnmu_monthly_schedules_shared_marks_lookup_idx
  on public.wnmu_monthly_schedules_shared_marks (channel_code, month_key, entry_key);

create index if not exists wnmu_monthly_schedules_shared_marks_updated_idx
  on public.wnmu_monthly_schedules_shared_marks (updated_at desc);

alter table public.wnmu_monthly_schedules_shared_marks replica identity full;
alter table public.wnmu_monthly_schedules_shared_marks enable row level security;

drop policy if exists "wnmu monthly schedules shared marks read"
  on public.wnmu_monthly_schedules_shared_marks;
create policy "wnmu monthly schedules shared marks read"
  on public.wnmu_monthly_schedules_shared_marks
  for select
  to anon, authenticated
  using (true);

drop policy if exists "wnmu monthly schedules shared marks insert"
  on public.wnmu_monthly_schedules_shared_marks;
create policy "wnmu monthly schedules shared marks insert"
  on public.wnmu_monthly_schedules_shared_marks
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "wnmu monthly schedules shared marks update"
  on public.wnmu_monthly_schedules_shared_marks;
create policy "wnmu monthly schedules shared marks update"
  on public.wnmu_monthly_schedules_shared_marks
  for update
  to anon, authenticated
  using (true)
  with check (true);

do $$ begin
  alter publication supabase_realtime add table public.wnmu_monthly_schedules_shared_marks;
exception when duplicate_object then null; end $$;
