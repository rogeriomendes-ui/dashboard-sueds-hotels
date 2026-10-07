begin;

insert into public.portal_environments (slug, name, description, sort_order, status)
values (
  'mapa_ocupacao',
  'Mapa de ocupação',
  'Acesso ao mapa diário de ocupação por hotel, com UHs, manutenção e disponibilidade.',
  48,
  'active'
)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    status = excluded.status;

commit;
