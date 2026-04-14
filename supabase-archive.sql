create extension if not exists pgcrypto;

create table if not exists public.wnmu_monthly_archives (
  id uuid primary key default gen_random_uuid(),
  channel_code text not null check (channel_code in ('13.1', '13.3')),
  channel_label text not null,
  archive_name text not null,
  archive_note text,
  build_version text,
  schedule_file text,
  verification_file text,
  storage_key text,
  snapshot_json jsonb not null default '{}'::jsonb,
  stats_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists wnmu_monthly_archives_channel_created_idx
  on public.wnmu_monthly_archives (channel_code, created_at desc);

alter table public.wnmu_monthly_archives enable row level security;

drop policy if exists "wnmu archives anon read" on public.wnmu_monthly_archives;
create policy "wnmu archives anon read"
  on public.wnmu_monthly_archives
  for select
  to anon, authenticated
  using (true);

drop policy if exists "wnmu archives anon insert" on public.wnmu_monthly_archives;
create policy "wnmu archives anon insert"
  on public.wnmu_monthly_archives
  for insert
  to anon, authenticated
  with check (true);
