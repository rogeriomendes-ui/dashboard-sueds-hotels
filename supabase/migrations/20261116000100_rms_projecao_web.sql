alter table public.rms_flutuacao_pendente
  add column projecao_web jsonb check (jsonb_typeof(projecao_web)='object');

create table public.rms_grade_web_simulacao (
  hotel_id uuid primary key references public.hotels(id),
  grade jsonb not null check (jsonb_typeof(grade)='object')
);
alter table public.rms_grade_web_simulacao enable row level security;
revoke all on public.rms_grade_web_simulacao from public, anon, authenticated;
grant select on public.rms_grade_web_simulacao to authenticated;
create policy rms_grade_leitura on public.rms_grade_web_simulacao for select
  to authenticated using ((select public.rms_acesso_liberado()));
