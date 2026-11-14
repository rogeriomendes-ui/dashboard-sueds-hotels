-- Sueds Plaza, BeePrice consultado em 14/11/2026. Todos os sete dias selecionados.
-- Bloqueio histórico sem faixas: 21/12/2024 a 27/12/2024 (fora da simulação).
insert into public.rms_faixas_festivas (hotel_id,nome,inicio,fim,pct0,pct50,pct60,pct70,pct80)
select h.id,s.nome,s.inicio,s.fim,0,10,15,20,30
from public.hotels h cross join (values
  ('1º E 2º SEMESTRE BAIXA TEMPORADA 2026',date '2026-06-08',date '2026-07-10'),
  ('JULHO 2026',date '2026-07-11',date '2026-07-24'),
  ('1º E 2º SEMESTRE BAIXA TEMPORADA 2026',date '2026-07-25',date '2026-07-31'),
  ('1º E 2º SEMESTRE BAIXA TEMPORADA 2026',date '2026-09-01',date '2026-09-02'),
  ('FERIADOS 1º E 2º SEMESTRE 2026',date '2026-09-03',date '2026-09-06'),
  ('1º E 2º SEMESTRE BAIXA TEMPORADA 2026',date '2026-09-19',date '2026-09-21'),
  ('SACO CHEIO 2026',date '2026-10-09',date '2026-10-18'),
  ('FERIADOS 1º E 2º SEMESTRE 2026',date '2026-11-01',date '2026-11-02'),
  ('1º E 2º SEMESTRE BAIXA TEMPORADA 2026',date '2026-11-03',date '2026-11-18'),
  ('FERIADOS 1º E 2º SEMESTRE 2026',date '2026-11-19',date '2026-11-22'),
  ('1º E 2º SEMESTRE BAIXA TEMPORADA 2026',date '2026-11-23',date '2026-12-17'),
  ('NATAL 2026',date '2026-12-18',date '2026-12-24'),
  ('REVEILLON 2026',date '2026-12-25',date '2027-01-01'),
  ('ALTA TEMPORADA 2027',date '2027-01-02',date '2027-02-04'),
  ('CARNAVAL 2027',date '2027-02-05',date '2027-02-12'),
  ('1º SEMESTRE BAIXA TEMPORADA 2027',date '2027-02-13',date '2027-03-24'),
  ('FERIADOS 1º SEMESTRE 2027',date '2027-03-25',date '2027-03-28'),
  ('1º SEMESTRE BAIXA TEMPORADA 2027',date '2027-03-29',date '2027-05-25'),
  ('FERIADOS 1º SEMESTRE 2027',date '2027-05-26',date '2027-05-30'),
  ('1º SEMESTRE BAIXA TEMPORADA 2027',date '2027-05-31',date '2027-06-30'),
  ('JULHO 2027',date '2027-07-01',date '2027-07-31'),
  ('2º SEMESTRE BAIXA TEMPORADA 2027',date '2027-08-01',date '2027-09-02'),
  ('FERIADOS 2º SEMESTRE 2027',date '2027-09-03',date '2027-09-07'),
  ('2º SEMESTRE BAIXA TEMPORADA 2027',date '2027-09-08',date '2027-10-01'),
  ('SACO CHEIO 2027',date '2027-10-02',date '2027-10-17'),
  ('2º SEMESTRE BAIXA TEMPORADA 2027',date '2027-10-18',date '2027-10-28'),
  ('FERIADOS 2º SEMESTRE 2027',date '2027-10-29',date '2027-11-02'),
  ('2º SEMESTRE BAIXA TEMPORADA 2027',date '2027-11-03',date '2027-11-11'),
  ('FERIADOS 2º SEMESTRE 2027',date '2027-11-12',date '2027-11-15'),
  ('2º SEMESTRE BAIXA TEMPORADA 2027',date '2027-11-16',date '2027-12-17'),
  ('NATAL 2027',date '2027-12-18',date '2027-12-24'),
  ('REVEILLON 2027',date '2027-12-25',date '2028-01-03'),
  ('ALTA TEMPORADA 2028',date '2028-01-04',date '2028-02-04'),
  ('MEDIA TEMPORADA 2028',date '2028-02-05',date '2028-02-25'),
  ('CARNAVAL 2028',date '2028-02-26',date '2028-03-04'),
  ('1º SEMESTRE BAIXA TEMPORADA 2028',date '2028-03-05',date '2028-04-08')
) s(nome,inicio,fim)
where h.code='PLAZA'
on conflict (hotel_id,inicio) do nothing;
