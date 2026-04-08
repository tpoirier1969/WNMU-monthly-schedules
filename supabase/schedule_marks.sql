create table if not exists public.wnmu_sched_shared_marks (
  project_scope text not null,
  channel_slug text not null,
  schedule_slug text not null,
  entry_key text not null,
  is_marked boolean not null default false,
  note text,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (project_scope, channel_slug, schedule_slug, entry_key)
);

create index if not exists wnmu_sched_shared_marks_updated_at_idx
  on public.wnmu_sched_shared_marks (updated_at desc);

alter table public.wnmu_sched_shared_marks enable row level security;

-- Public read policy for GitHub Pages front end.
do $$ begin
  create policy "wnmu_sched_shared_marks_read"
  on public.wnmu_sched_shared_marks
  for select
  to anon, authenticated
  using (true);
exception when duplicate_object then null; end $$;

-- Public write policy. Convenient for a small internal shareboard.
-- Tighten this later if you decide to require auth.
do $$ begin
  create policy "wnmu_sched_shared_marks_insert"
  on public.wnmu_sched_shared_marks
  for insert
  to anon, authenticated
  with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "wnmu_sched_shared_marks_update"
  on public.wnmu_sched_shared_marks
  for update
  to anon, authenticated
  using (true)
  with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "wnmu_sched_shared_marks_delete"
  on public.wnmu_sched_shared_marks
  for delete
  to anon, authenticated
  using (true);
exception when duplicate_object then null; end $$;
