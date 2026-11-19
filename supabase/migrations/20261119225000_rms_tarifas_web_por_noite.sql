begin;

create table public.rms_tarifas_web_por_noite (
  hotel_id uuid not null references public.hotels(id),
  codigo integer not null check (codigo > 0),
  tarifario text not null,
  primeira_noite date not null,
  ultima_noite date not null check (ultima_noite >= primeira_noite),
  grade jsonb not null check (jsonb_typeof(grade) = 'array'),
  capturado_em timestamptz not null,
  primary key (hotel_id, codigo)
);

alter table public.rms_tarifas_web_por_noite enable row level security;
revoke all on public.rms_tarifas_web_por_noite from public, anon, authenticated;
grant select on public.rms_tarifas_web_por_noite to authenticated;
create policy rms_tarifas_web_por_noite_leitura on public.rms_tarifas_web_por_noite
  for select to authenticated using ((select public.rms_acesso_liberado()));

commit;
