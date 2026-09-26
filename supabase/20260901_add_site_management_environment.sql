begin;

insert into public.portal_environments (
  slug,
  name,
  description,
  sort_order,
  status
)
values (
  'gerenciar_site',
  'Gerenciar site',
  'Permite abrir o painel administrativo e publicar banners, imagens, vídeos e links do novo site.',
  120,
  'active'
)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    status = excluded.status;

commit;
