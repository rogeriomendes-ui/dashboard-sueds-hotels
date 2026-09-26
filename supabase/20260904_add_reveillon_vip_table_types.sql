begin;

alter table public.reveillon_vip_tables
  add column if not exists table_type text not null default 'exclusive',
  add column if not exists participants jsonb not null default '[]'::jsonb;

update public.reveillon_vip_tables
set table_type = 'exclusive'
where table_type is null or table_type not in ('shared', 'exclusive');

alter table public.reveillon_vip_tables
  drop constraint if exists reveillon_vip_table_type_check,
  add constraint reveillon_vip_table_type_check check (table_type in ('shared', 'exclusive'));

commit;
