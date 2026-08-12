begin;

insert into public.portal_environments (
  slug,
  name,
  description,
  sort_order,
  status
)
values (
  'treinamentos',
  'Centro de Conhecimentos e Treinamentos',
  'Manuais, procedimentos e treinamentos do grupo SUEDS Hotels.',
  90,
  'active'
)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    status = excluded.status;

insert into public.user_environment_access (user_id, environment_id, granted_by)
select profiles.id, environments.id, profiles.id
from public.profiles
cross join public.portal_environments as environments
where environments.slug = 'treinamentos'
  and profiles.deleted_at is null
on conflict (user_id, environment_id) do nothing;

commit;
