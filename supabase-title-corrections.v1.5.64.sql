-- v1.5.64: shared title corrections for WNMU Monthly Schedules.
-- Run this once in Supabase SQL Editor. The static GitHub Pages app uses the anon key,
-- so read/write policies are intentionally open for this small project-scoped table.

create extension if not exists pgcrypto;

create table if not exists public.wnmu_monthly_title_corrections (
  id uuid primary key default gen_random_uuid(),
  raw_title text not null,
  raw_title_key text not null unique,
  compact_title_key text not null,
  corrected_title text not null,
  channel_code text not null default 'all',
  source_channel_code text,
  source_month_key text,
  source text not null default 'schedule-page-title-review',
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wnmu_monthly_title_corrections_active_idx
  on public.wnmu_monthly_title_corrections (is_active, raw_title_key);

create index if not exists wnmu_monthly_title_corrections_compact_idx
  on public.wnmu_monthly_title_corrections (compact_title_key)
  where is_active = true;

create or replace function public.wnmu_monthly_title_corrections_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_wnmu_monthly_title_corrections_updated_at on public.wnmu_monthly_title_corrections;
create trigger trg_wnmu_monthly_title_corrections_updated_at
before update on public.wnmu_monthly_title_corrections
for each row execute function public.wnmu_monthly_title_corrections_touch_updated_at();

alter table public.wnmu_monthly_title_corrections enable row level security;

drop policy if exists "wnmu monthly title corrections read" on public.wnmu_monthly_title_corrections;
create policy "wnmu monthly title corrections read"
on public.wnmu_monthly_title_corrections
for select
to anon, authenticated
using (true);

drop policy if exists "wnmu monthly title corrections insert" on public.wnmu_monthly_title_corrections;
create policy "wnmu monthly title corrections insert"
on public.wnmu_monthly_title_corrections
for insert
to anon, authenticated
with check (true);

drop policy if exists "wnmu monthly title corrections update" on public.wnmu_monthly_title_corrections;
create policy "wnmu monthly title corrections update"
on public.wnmu_monthly_title_corrections
for update
to anon, authenticated
using (true)
with check (true);

grant select, insert, update on public.wnmu_monthly_title_corrections to anon, authenticated;
