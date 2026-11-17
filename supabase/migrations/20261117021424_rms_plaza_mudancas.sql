create index if not exists rms_plaza_historico_por_captura
  on public.rms_plaza_historico_simulacao (captura, noite);

create function public.rms_plaza_mudancas(dia date)
returns table (noite date, captura timestamptz, anterior jsonb, atual jsonb)
language sql stable security invoker set search_path = ''
as $$
  select h.noite, h.captura, to_jsonb(p), to_jsonb(h)
  from public.rms_plaza_historico_simulacao h
  cross join lateral (
    select a.captura, a.faixa, a.nivel, a.standard, a.luxo, a.suite
    from public.rms_plaza_historico_simulacao a
    where a.noite = h.noite and a.captura < h.captura
    order by a.captura desc limit 1
  ) p
  where h.captura >= (dia::timestamp at time zone 'America/Bahia')
    and h.captura < ((dia+1)::timestamp at time zone 'America/Bahia')
    and (p.faixa, p.standard, p.luxo, p.suite)
      is distinct from (h.faixa, h.standard, h.luxo, h.suite)
  order by h.captura, h.noite
$$;
revoke all on function public.rms_plaza_mudancas(date) from public, anon;
grant execute on function public.rms_plaza_mudancas(date) to authenticated;
