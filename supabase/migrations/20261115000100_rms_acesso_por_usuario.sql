begin;

insert into public.portal_environments (slug, name, description, sort_order, status)
values ('rms', 'RMS', 'Painel e configurações de simulação de tarifas no Comercial.', 49, 'active');

insert into public.user_environment_access (user_id, environment_id, granted_by)
select o.user_id, e.id, o.user_id
from public.rms_owner o cross join public.portal_environments e
where e.slug = 'rms';

create function public.rms_acesso_liberado() returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.user_environment_access g
    join public.portal_environments e on e.id = g.environment_id
    join public.profiles p on p.id = g.user_id
    where g.user_id = (select auth.uid()) and p.status = 'active' and e.slug = 'rms'
  );
$$;
revoke all on function public.rms_acesso_liberado() from public, anon;
grant execute on function public.rms_acesso_liberado() to authenticated;

alter policy rms_owner_pisos on public.rms_pisos
  using ((select public.rms_acesso_liberado())) with check ((select public.rms_acesso_liberado()));
alter policy rms_owner_concorrentes on public.rms_concorrentes
  using ((select public.rms_acesso_liberado())) with check ((select public.rms_acesso_liberado()));
alter policy rms_owner_politicas on public.rms_politicas
  using ((select public.rms_acesso_liberado())) with check ((select public.rms_acesso_liberado()));
alter policy rms_faixas_owner on public.rms_faixas_festivas
  using ((select public.rms_acesso_liberado())) with check ((select public.rms_acesso_liberado()));
alter policy rms_grade_owner on public.rms_grade_tarifaria
  using ((select public.rms_acesso_liberado())) with check ((select public.rms_acesso_liberado()));

commit;
