begin;
create table public.rms_grade_tarifaria (
  hotel_id uuid not null references public.hotels(id),
  base text not null, plano smallint not null check (plano between 0 and 2),
  quarto text not null check (quarto in ('standard','luxo','suite')),
  pax smallint not null check (pax between 1 and 4),
  dia smallint not null check (dia between 0 and 6),
  valor numeric(10,2) not null check (valor > 0),
  gravado_em timestamptz, gravado_por text,
  primary key(hotel_id,base,plano,quarto,pax,dia)
);
alter table public.rms_grade_tarifaria enable row level security;
revoke all on public.rms_grade_tarifaria from public,anon,authenticated;
grant select,insert(hotel_id,base,plano,quarto,pax,dia,valor),update(hotel_id,base,plano,quarto,pax,dia,valor) on public.rms_grade_tarifaria to authenticated;
create policy rms_grade_owner on public.rms_grade_tarifaria to authenticated
using (exists(select 1 from public.rms_owner o join public.profiles p on p.id=o.user_id where o.user_id=(select auth.uid()) and p.status='active'));
create trigger rms_autoria before insert or update on public.rms_grade_tarifaria
for each row execute function public.rms_registrar_gravacao();
commit;
