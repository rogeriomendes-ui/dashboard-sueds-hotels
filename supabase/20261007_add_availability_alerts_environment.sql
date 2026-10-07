begin;

insert into public.portal_environments (slug, name, description, sort_order, status)
values (
  'alertas_disponibilidade',
  'Alertas de Disponibilidade',
  'Acesso aos alertas de baixa disponibilidade e overbooking na home do Portal SUEDS.',
  49,
  'active'
)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    status = excluded.status;

commit;
