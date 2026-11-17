create table public.rms_plaza_historico_simulacao (
  noite date not null,
  captura timestamptz not null,
  ocupacao numeric not null,
  periodo text,
  faixa text,
  nivel text,
  situacao text not null,
  standard numeric,
  luxo numeric,
  suite numeric,
  primary key (noite,captura)
);
alter table public.rms_plaza_historico_simulacao enable row level security;
revoke all on public.rms_plaza_historico_simulacao from public, anon, authenticated;
grant select on public.rms_plaza_historico_simulacao to authenticated;
grant select,insert on public.rms_plaza_historico_simulacao to service_role;
create policy leitura_rms on public.rms_plaza_historico_simulacao for select to authenticated using ((select public.rms_acesso_liberado()));
