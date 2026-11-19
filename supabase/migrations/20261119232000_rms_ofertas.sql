begin;

create table public.rms_ofertas (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id),
  origem text not null,
  chave_origem text not null,
  detalhes jsonb not null check (jsonb_typeof(detalhes) = 'object'),
  excluida boolean not null default false,
  gravado_em timestamptz not null default statement_timestamp(),
  gravado_por text,
  unique (hotel_id, origem, chave_origem)
);

alter table public.rms_ofertas enable row level security;
revoke all on public.rms_ofertas from public, anon, authenticated;
grant select, update (detalhes, excluida) on public.rms_ofertas to authenticated;
create policy rms_ofertas_acesso on public.rms_ofertas to authenticated
  using ((select public.rms_acesso_liberado()))
  with check ((select public.rms_acesso_liberado()));
create trigger rms_ofertas_autoria before update on public.rms_ofertas
  for each row execute function public.rms_registrar_gravacao();

commit;
