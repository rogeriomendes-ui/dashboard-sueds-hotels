begin;
alter table public.rms_faixas_festivas
  add column base_origem text,
  add column precos_duplo numeric(10,2)[],
  add column niveis_pct numeric(7,2)[],
  add constraint rms_base_duplo_valida check (
    (precos_duplo is null and niveis_pct is null) or
    (base_origem is null and precos_duplo is not null and niveis_pct is not null
     and cardinality(precos_duplo)=3 and cardinality(niveis_pct)=5
     and array_position(precos_duplo,null) is null and array_position(niveis_pct,null) is null
     and 0 < all(precos_duplo) and 0 <= all(niveis_pct)));
grant insert(hotel_id,nome,inicio,fim,pct0,pct50,pct60,pct70,pct80,base_origem,precos_duplo,niveis_pct)
on public.rms_faixas_festivas to authenticated;
create function public.rms_verificar_novo_periodo() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.hotel_id::text,0));
  if exists(select 1 from public.rms_faixas_festivas p where p.hotel_id=new.hotel_id
    and p.inicio<=new.fim and p.fim>=new.inicio) then
    raise exception 'O período coincide com outro cadastro.' using errcode='23P01';
  end if;
  return new;
end $$;
create trigger rms_validar_periodo before insert on public.rms_faixas_festivas
for each row execute function public.rms_verificar_novo_periodo();
create trigger rms_autoria_inclusao before insert on public.rms_faixas_festivas
for each row execute function public.rms_registrar_gravacao();
commit;
