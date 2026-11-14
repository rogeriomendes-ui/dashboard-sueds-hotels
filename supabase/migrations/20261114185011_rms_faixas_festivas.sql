begin;
create table public.rms_faixas_festivas (
  hotel_id uuid not null references public.hotels(id),
  nome text not null,
  inicio date not null, fim date not null check (fim >= inicio),
  pct0 numeric(7,2) not null check (pct0 between 0 and 99999),
  pct50 numeric(7,2) not null check (pct50 between 0 and 99999),
  pct60 numeric(7,2) not null check (pct60 between 0 and 99999),
  pct70 numeric(7,2) not null check (pct70 between 0 and 99999),
  pct80 numeric(7,2) not null check (pct80 between 0 and 99999),
  gravado_em timestamptz, gravado_por text,
  primary key (hotel_id,inicio)
);
alter table public.rms_faixas_festivas enable row level security;
revoke all on public.rms_faixas_festivas from public, anon, authenticated;
grant select, update(pct0,pct50,pct60,pct70,pct80) on public.rms_faixas_festivas to authenticated;
create policy rms_faixas_owner on public.rms_faixas_festivas to authenticated
using (exists(select 1 from public.rms_owner o join public.profiles p on p.id=o.user_id where o.user_id=(select auth.uid()) and p.status='active'));
insert into public.rms_faixas_festivas(hotel_id,nome,inicio,fim,pct0,pct50,pct60,pct70,pct80)
select h.id,s.nome,s.inicio,s.fim,0,10,15,20,30 from public.hotels h cross join
(values ('Réveillon 2026',date '2026-12-25',date '2027-01-01'),('Carnaval 2027',date '2027-02-05',date '2027-02-12')) s(nome,inicio,fim)
where h.code='PLAZA';
create trigger rms_autoria before update on public.rms_faixas_festivas
for each row execute function public.rms_registrar_gravacao();
commit;
