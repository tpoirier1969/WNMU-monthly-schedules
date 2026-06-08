-- WNMU Monthly Schedules remote localStorage mirror
-- Run this once in Supabase SQL Editor before using v1.5.81 remote storage sync.

create table if not exists public.wnmu_monthly_local_storage (
  storage_key text primary key,
  channel_code text not null,
  month_key text not null,
  value_json jsonb not null default '{}'::jsonb,
  byte_length integer not null default 0,
  source text not null default 'monthly-app',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wnmu_monthly_local_storage_channel_month_idx
  on public.wnmu_monthly_local_storage (channel_code, month_key);

create or replace function public.wnmu_monthly_local_storage_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_wnmu_monthly_local_storage_updated_at on public.wnmu_monthly_local_storage;
create trigger trg_wnmu_monthly_local_storage_updated_at
before update on public.wnmu_monthly_local_storage
for each row execute function public.wnmu_monthly_local_storage_set_updated_at();

alter table public.wnmu_monthly_local_storage enable row level security;

drop policy if exists "WNMU monthly local storage read" on public.wnmu_monthly_local_storage;
create policy "WNMU monthly local storage read"
on public.wnmu_monthly_local_storage
for select
to anon, authenticated
using (true);

drop policy if exists "WNMU monthly local storage insert" on public.wnmu_monthly_local_storage;
create policy "WNMU monthly local storage insert"
on public.wnmu_monthly_local_storage
for insert
to anon, authenticated
with check (true);

drop policy if exists "WNMU monthly local storage update" on public.wnmu_monthly_local_storage;
create policy "WNMU monthly local storage update"
on public.wnmu_monthly_local_storage
for update
to anon, authenticated
using (true)
with check (true);
