begin;
create table public.rms_bloqueios_flutuacao (
 hotel_id uuid primary key references public.hotels(id),
 periodos jsonb not null default '[]' check(jsonb_typeof(periodos)='array' and jsonb_array_length(periodos)<=100),
 gravado_em timestamptz, gravado_por text
);
alter table public.rms_bloqueios_flutuacao enable row level security;
revoke all on public.rms_bloqueios_flutuacao from public,anon,authenticated;
grant select,insert(hotel_id,periodos),update(periodos) on public.rms_bloqueios_flutuacao to authenticated;
create policy rms_bloqueios_acesso on public.rms_bloqueios_flutuacao to authenticated
 using ((select public.rms_acesso_liberado())) with check ((select public.rms_acesso_liberado()));
create function public.rms_validar_bloqueios() returns trigger language plpgsql security invoker set search_path='' as $$
declare p jsonb;
begin
 for p in select value from jsonb_array_elements(new.periodos) loop
  if jsonb_typeof(p->'inicio') is distinct from 'string' or jsonb_typeof(p->'fim') is distinct from 'string' then raise exception 'Datas obrigatórias' using errcode='23514';end if;
  if (p->>'inicio') !~ '^\d{4}-\d{2}-\d{2}$' or (p->>'fim') !~ '^\d{4}-\d{2}-\d{2}$' or (p->>'fim')::date<(p->>'inicio')::date then raise exception 'Datas inválidas' using errcode='23514';end if;
 end loop;
 return new;
end $$;
revoke all on function public.rms_validar_bloqueios() from public,anon;
create trigger rms_bloqueios_validacao before insert or update on public.rms_bloqueios_flutuacao for each row execute function public.rms_validar_bloqueios();
create trigger rms_bloqueios_autoria before insert or update on public.rms_bloqueios_flutuacao for each row execute function public.rms_registrar_gravacao();
commit;
