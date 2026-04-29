-- WNMU Monthly Schedules v1.5.26
-- Manual program overrides table for explicit Commit to Schedule workflow
-- Run this once in Supabase SQL Editor before using v1.5.26 manual-program sync.

create extension if not exists pgcrypto;

create table if not exists public.wnmu_monthly_schedule_overrides (
  id uuid primary key default gen_random_uuid(),
  channel_code text not null check (channel_code in ('13.1','13.3')),
  month_key text not null,
  entry_key text not null,
  date date not null,
  slot_time text not null check (slot_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  duration_min integer not null default 30 check (duration_min > 0 and duration_min <= 720),
  source_entry_id text,
  override_type text not null default 'manual_program',
  title_text text,
  tags_json jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wnmu_monthly_schedule_overrides_unique unique (channel_code, month_key, entry_key)
);

create index if not exists wnmu_monthly_schedule_overrides_lookup_idx
  on public.wnmu_monthly_schedule_overrides (channel_code, month_key, is_active, date, slot_time);

create or replace function public.wnmu_touch_monthly_schedule_overrides_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_wnmu_monthly_schedule_overrides_updated_at on public.wnmu_monthly_schedule_overrides;
create trigger trg_wnmu_monthly_schedule_overrides_updated_at
before update on public.wnmu_monthly_schedule_overrides
for each row execute function public.wnmu_touch_monthly_schedule_overrides_updated_at();

alter table public.wnmu_monthly_schedule_overrides enable row level security;

drop policy if exists "WNMU overrides read" on public.wnmu_monthly_schedule_overrides;
create policy "WNMU overrides read"
on public.wnmu_monthly_schedule_overrides
for select
to anon, authenticated
using (true);

drop policy if exists "WNMU overrides insert" on public.wnmu_monthly_schedule_overrides;
create policy "WNMU overrides insert"
on public.wnmu_monthly_schedule_overrides
for insert
to anon, authenticated
with check (true);

drop policy if exists "WNMU overrides update" on public.wnmu_monthly_schedule_overrides;
create policy "WNMU overrides update"
on public.wnmu_monthly_schedule_overrides
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "WNMU overrides delete" on public.wnmu_monthly_schedule_overrides;
create policy "WNMU overrides delete"
on public.wnmu_monthly_schedule_overrides
for delete
to anon, authenticated
using (true);
