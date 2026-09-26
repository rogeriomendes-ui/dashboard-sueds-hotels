begin;

insert into public.portal_environments (
  slug,
  name,
  description,
  sort_order,
  status
)
values (
  'bi_relatorios',
  'BI - Relatórios',
  'Acesso aos relatórios e painéis de inteligência comercial da SUEDS Hotels.',
  46,
  'active'
)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    status = excluded.status;

commit;
