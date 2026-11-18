-- Preparação para publicação. Preserva políticas RLS, registros e modelos ativos.
begin;
set local lock_timeout = '5s';
alter table public.rms_politicas drop constraint rms_politicas_modelo_check;
alter table public.rms_politicas add constraint rms_politicas_modelo_check
  check (modelo in ('beeprice', 'proprio', 'simples'));
commit;
