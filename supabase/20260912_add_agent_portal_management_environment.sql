begin;
insert into public.portal_environments (slug,name,description,sort_order,status)
values ('gerenciar_portal_agente','Gerenciar Portal do Agente','Permite publicar banners, artes sociais, tarifas e campanhas no Portal do Agente.',121,'active')
on conflict (slug) do update set name=excluded.name,description=excluded.description,sort_order=excluded.sort_order,status=excluded.status;
commit;
