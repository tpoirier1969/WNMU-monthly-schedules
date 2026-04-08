create table if not exists public.schedule_marks (
  schedule_slug text not null,
  entry_key text not null,
  is_marked boolean not null default false,
  note text,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (schedule_slug, entry_key)
);

alter table public.schedule_marks enable row level security;

-- Public read policy for GitHub Pages front end.
do $$ begin
  create policy "schedule marks public read"
  on public.schedule_marks
  for select
  to anon, authenticated
  using (true);
exception when duplicate_object then null; end $$;

-- Public write policy. This is simple, not locked down.
-- Good for small internal sharing. If you want stricter control later,
-- switch this to authenticated users only.
do $$ begin
  create policy "schedule marks public write"
  on public.schedule_marks
  for insert
  to anon, authenticated
  with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "schedule marks public update"
  on public.schedule_marks
  for update
  to anon, authenticated
  using (true)
  with check (true);
exception when duplicate_object then null; end $$;
