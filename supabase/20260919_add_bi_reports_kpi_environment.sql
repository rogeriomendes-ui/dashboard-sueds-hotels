begin;

insert into public.portal_environments (
  slug,
  name,
  description,
  sort_order,
  status
)
values (
  'bi_relatorios_kpi',
  'BI - Relatórios by KPI',
  'Acesso aos relatórios comerciais comparativos originados nas bases do KPI Full.',
  47,
  'active'
)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    status = excluded.status;

commit;
