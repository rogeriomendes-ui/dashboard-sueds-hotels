begin;

insert into public.portal_environments (
  slug,
  name,
  description,
  sort_order,
  status
)
values (
  'mesas_vip_reveillon',
  'Mesas VIP Réveillon',
  'Controle de disponibilidade, vendas e bloqueios das 59 mesas VIP do Réveillon.',
  45,
  'active'
)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    status = excluded.status;

insert into public.user_environment_access (user_id, environment_id, granted_by)
select distinct user_roles.user_id, environments.id, user_roles.user_id
from public.user_roles
join public.roles on roles.id = user_roles.role_id
cross join public.portal_environments as environments
where roles.slug = 'vendedor'
  and environments.slug = 'mesas_vip_reveillon'
on conflict (user_id, environment_id) do nothing;

create table if not exists public.reveillon_vip_tables (
  table_number smallint primary key check (table_number between 1 and 59),
  status text not null check (status in ('sold', 'blocked')),
  reservation_number text,
  notes text not null default '',
  owner_user_id uuid references public.profiles(id) on delete set null,
  owner_name text not null default '',
  owner_email text not null default '',
  updated_by_user_id uuid references public.profiles(id) on delete set null,
  updated_by_name text not null default '',
  updated_at timestamptz not null default now(),
  constraint reveillon_vip_sold_reservation_required check (
    status <> 'sold' or nullif(btrim(reservation_number), '') is not null
  ),
  constraint reveillon_vip_reservation_length check (char_length(coalesce(reservation_number, '')) <= 80),
  constraint reveillon_vip_notes_length check (char_length(notes) <= 1000)
);

create table if not exists public.reveillon_vip_table_audit (
  id bigint generated always as identity primary key,
  table_number smallint not null check (table_number between 1 and 59),
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_name text not null default '',
  action text not null check (action in ('occupy', 'update', 'release')),
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create index if not exists reveillon_vip_table_audit_table_created_idx
  on public.reveillon_vip_table_audit (table_number, created_at desc);

alter table public.reveillon_vip_tables enable row level security;
alter table public.reveillon_vip_table_audit enable row level security;

commit;
