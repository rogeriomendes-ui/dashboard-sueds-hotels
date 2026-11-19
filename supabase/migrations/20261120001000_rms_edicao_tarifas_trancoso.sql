begin;

alter table public.rms_tarifas_web_por_noite
  add column edicoes jsonb not null default '{}'::jsonb check (jsonb_typeof(edicoes) = 'object'),
  add column gravado_em timestamptz not null default statement_timestamp(),
  add column gravado_por text;

grant update (edicoes) on public.rms_tarifas_web_por_noite to authenticated;

create policy rms_tarifas_web_por_noite_edicao on public.rms_tarifas_web_por_noite
  for update to authenticated
  using ((select public.rms_acesso_liberado()))
  with check ((select public.rms_acesso_liberado()));

create trigger rms_tarifas_web_por_noite_autoria
  before update of edicoes on public.rms_tarifas_web_por_noite
  for each row execute function public.rms_registrar_gravacao();

commit;
