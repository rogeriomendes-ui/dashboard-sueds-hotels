create table if not exists public.dashboard_snapshots (
  id bigint generated always as identity primary key,
  source text not null,
  period_month text not null,
  period_date date,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists dashboard_snapshots_source_month_created_idx
  on public.dashboard_snapshots (source, period_month, created_at desc);

create table if not exists public.dashboard_access_profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role text not null check (role in ('gestor', 'tv', 'admin')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.dashboard_snapshots enable row level security;
alter table public.dashboard_access_profiles enable row level security;

create policy "Service role can manage dashboard snapshots"
  on public.dashboard_snapshots
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Service role can manage dashboard access profiles"
  on public.dashboard_access_profiles
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
