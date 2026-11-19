begin;
create table public.rms_conjuntos_flutuacao (
 id uuid primary key default gen_random_uuid(), hotel_id uuid not null references public.hotels(id),
 nome text not null check(length(trim(nome)) between 1 and 120),
 base_origem text not null check(length(base_origem) between 1 and 200),
 periodos jsonb not null check(jsonb_typeof(periodos)='array' and jsonb_array_length(periodos) between 1 and 100),
 faixas jsonb not null check(jsonb_typeof(faixas)='array' and jsonb_array_length(faixas) between 1 and 20),
 origens date[] not null default '{}', bloqueado boolean not null default false,
 excluido boolean not null default false, gravado_em timestamptz, gravado_por text
);
alter table public.rms_conjuntos_flutuacao enable row level security;
revoke all on public.rms_conjuntos_flutuacao from public,anon,authenticated;
grant select,insert(hotel_id,nome,base_origem,periodos,faixas,origens,bloqueado,excluido),
 update(hotel_id,nome,base_origem,periodos,faixas,origens,bloqueado,excluido)
 on public.rms_conjuntos_flutuacao to authenticated;
create policy rms_conjuntos_acesso on public.rms_conjuntos_flutuacao to authenticated
 using ((select public.rms_acesso_liberado())) with check ((select public.rms_acesso_liberado()));
create function public.rms_validar_conjunto() returns trigger language plpgsql security invoker set search_path='' as $$
declare p jsonb; f jsonb; expected numeric:=0; idx int; other jsonb; n int;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.hotel_id::text,0));
 if tg_op='UPDATE' and (old.hotel_id<>new.hotel_id or old.origens<>new.origens) then
   raise exception 'Origem imutável' using errcode='23514';
 end if;
 if cardinality(new.origens)>100 or array_position(new.origens,null) is not null then raise exception 'Origens inválidas' using errcode='23514'; end if;
 select count(*) into n from public.rms_faixas_festivas where hotel_id=new.hotel_id and inicio=any(new.origens);
 if n<>cardinality(new.origens) then raise exception 'Origem não encontrada' using errcode='23514'; end if;
 if exists(select 1 from public.rms_conjuntos_flutuacao c where c.hotel_id=new.hotel_id and c.id<>new.id and c.origens && new.origens) then raise exception 'Origem já editada' using errcode='23505'; end if;
 for f in select value from jsonb_array_elements(new.faixas) loop
   if jsonb_typeof(f->'de') is distinct from 'number' or jsonb_typeof(f->'ate') is distinct from 'number' or jsonb_typeof(f->'pct') is distinct from 'number' then raise exception 'Faixas numéricas obrigatórias' using errcode='23514'; end if;
   if not (f ?& array['de','ate','pct']) or (f->>'de')::numeric<>expected or (f->>'ate')::numeric<(f->>'de')::numeric or (f->>'ate')::numeric>100 or round((f->>'ate')::numeric,1)<>(f->>'ate')::numeric or (f->>'pct')::numeric<0 or (f->>'pct')::numeric>99999 or round((f->>'pct')::numeric,2)<>(f->>'pct')::numeric then raise exception 'Faixas inválidas' using errcode='23514'; end if;
   expected:=(f->>'ate')::numeric+0.1;
 end loop;
 if expected<>100.1 then raise exception 'Faixas devem cobrir 0 a 100' using errcode='23514';end if;
 for p in select value from jsonb_array_elements(new.periodos) loop
   if jsonb_typeof(p->'inicio') is distinct from 'string' or jsonb_typeof(p->'fim') is distinct from 'string' or jsonb_typeof(p->'dias') is distinct from 'array' then raise exception 'Datas e dias obrigatórios' using errcode='23514'; end if;
   if exists(select 1 from jsonb_array_elements(p->'dias') d where jsonb_typeof(d) is distinct from 'number' or d::text !~ '^[0-6]$') or (select count(distinct d) from jsonb_array_elements(p->'dias') d)<>jsonb_array_length(p->'dias') then raise exception 'Dias inválidos' using errcode='23514'; end if;
   if not (p ?& array['inicio','fim','dias']) or (p->>'fim')::date<(p->>'inicio')::date or (p->>'fim')::date-(p->>'inicio')::date>1826 or jsonb_typeof(p->'dias')<>'array' or jsonb_array_length(p->'dias') not between 1 and 7 or exists(select 1 from jsonb_array_elements_text(p->'dias') d where d::int not between 0 and 6) then raise exception 'Datas inválidas' using errcode='23514';end if;
 end loop;
 if not new.excluido then
  for p,idx in select value,ordinality::int from jsonb_array_elements(new.periodos) with ordinality loop
   for other in
    select value from jsonb_array_elements(new.periodos) with ordinality where ordinality<idx
    union all
    select v.value from public.rms_conjuntos_flutuacao c cross join lateral jsonb_array_elements(c.periodos) v
     where c.hotel_id=new.hotel_id and c.id<>new.id and not c.excluido
    union all
    select jsonb_build_object('inicio',l.inicio,'fim',l.fim,'dias',jsonb_build_array(0,1,2,3,4,5,6)) from public.rms_faixas_festivas l
     where l.hotel_id=new.hotel_id and not(l.inicio=any(new.origens)) and not exists(select 1 from public.rms_conjuntos_flutuacao c where c.hotel_id=l.hotel_id and l.inicio=any(c.origens))
   loop
    if greatest((p->>'inicio')::date,(other->>'inicio')::date)<=least((p->>'fim')::date,(other->>'fim')::date) and exists(
      select 1 from generate_series(greatest((p->>'inicio')::date,(other->>'inicio')::date)::timestamp,
       least(least((p->>'fim')::date,(other->>'fim')::date),greatest((p->>'inicio')::date,(other->>'inicio')::date)+6)::timestamp,interval '1 day') d
      where (p->'dias') @> to_jsonb((extract(isodow from d)::int-1)) and (other->'dias') @> to_jsonb((extract(isodow from d)::int-1))) then
       raise exception 'Períodos sobrepostos' using errcode='23P01';
    end if;
   end loop;
  end loop;
 end if;
 return new;
end $$;
revoke all on function public.rms_validar_conjunto() from public,anon;
create trigger rms_validacao before insert or update on public.rms_conjuntos_flutuacao for each row execute function public.rms_validar_conjunto();
create trigger rms_autoria before insert or update on public.rms_conjuntos_flutuacao for each row execute function public.rms_registrar_gravacao();
commit;
