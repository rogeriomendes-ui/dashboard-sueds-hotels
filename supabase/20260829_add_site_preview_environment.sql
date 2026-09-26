begin;

insert into public.portal_environments (
  slug,
  name,
  description,
  sort_order,
  status
)
values (
  'site_novo_preview',
  'Site novo Preview',
  'Acesso ao botão do site novo em modo preview.',
  110,
  'active'
)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    status = excluded.status;

commit;
