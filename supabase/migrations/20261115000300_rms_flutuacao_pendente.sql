begin;
create table public.rms_flutuacao_diaria (
  hotel_id uuid primary key references public.hotels,
  automatica boolean not null
);
create table public.rms_flutuacao_pendente (
  hotel_id uuid not null references public.hotels,
  noite date not null,
  modelo text not null check (modelo in ('proprio','beeprice')),
  tarifas jsonb not null check (jsonb_typeof(tarifas)='object' and tarifas <> '{}'::jsonb),
  gestor jsonb not null check (jsonb_typeof(gestor)='object'),
  gravado_em timestamptz not null default now(),
  gravado_por uuid not null default auth.uid(),
  primary key (hotel_id,noite)
);
alter table public.rms_flutuacao_diaria enable row level security;
alter table public.rms_flutuacao_pendente enable row level security;
revoke all on public.rms_flutuacao_diaria, public.rms_flutuacao_pendente from public, anon, authenticated;
grant select,insert,update on public.rms_flutuacao_diaria, public.rms_flutuacao_pendente to authenticated;
create policy rms_diaria on public.rms_flutuacao_diaria for all to authenticated
using ((select public.rms_acesso_liberado())) with check ((select public.rms_acesso_liberado()));
create policy rms_pendente on public.rms_flutuacao_pendente for all to authenticated
using ((select public.rms_acesso_liberado())) with check ((select public.rms_acesso_liberado()) and gravado_por=(select auth.uid()));
commit;
