alter table public.profiles
  add column if not exists departments text[] not null default '{}';

alter table public.profiles
  drop constraint if exists profiles_departments_valid;

alter table public.profiles
  add constraint profiles_departments_valid check (
    departments <@ array[
      'Geral',
      'Vendas / Reservas',
      'Recepção',
      'Governança / Camareiras',
      'Manutenção',
      'Alimentos e Bebidas',
      'Administrativo',
      'Diretoria'
    ]::text[]
  );

comment on column public.profiles.departments is
  'Departamentos do colaborador usados para segmentar comunicados e, futuramente, treinamentos.';
