# Diagnostico inicial da planilha de vendas SUEDS

Arquivo analisado: `Vendas Sueds Hotels - V19jun26.xlsx`

## Estrutura encontrada

- Aba `Vendas direta`
  - 117 registros de vendas de maio/2026.
  - Total valor: R$ 250.184,44.
  - Total recebido: R$ 209.652,65.
  - Total a receber: R$ 40.255,31.
  - Campos atuais: codigo reserva, data venda, hotel, canal, cliente, check-in, check-out, valor total, recebido, a receber, forma pagamento e vendedor.

- Aba `Metas equipe`
  - Estrutura inicial com colaborador/canal, vendas, meta, ICM MTD e ICM mes.
  - Metas ainda sem preenchimento operacional.

## Pontos de atencao

- A linha de total da aba original usa intervalos diferentes:
  - Valor total: `H3:H177`
  - Recebido: `I3:I186`
  - A receber: `J3:J164`
- A coluna `VENDEDOR` mistura pessoas e canal digital, principalmente `SITE`.
- A coluna `CANAL` mistura canais comerciais e nomes tecnicos do motor, como `BE MOBILE` e `BOOKING ENGINE`.
- O campo `FORMA PAGAMENTO` mistura metodo, parcelas, valores parciais e observacoes.
- Existe possivel divergencia de hotel: `SEGUNDO CABRALIA`, tratado na V2 como `SUEDS CABRALIA` em `De_Para`.

## Melhorias criadas na V2

Arquivo gerado: `Vendas Sueds Hotels - V2 Dashboard.xlsx`

- `Base_Vendas`: base analitica normalizada com uma linha por reserva.
- `Dashboard_Base`: resumo com KPIs, vendas por canal, vendas por hotel e grafico.
- `Metas`: estrutura para metas por mes, responsavel, hotel e canal.
- `De_Para`: padronizacao de hotel, canal, vendedor e pagamento.
- `Funil_Asksuite`: estrutura diaria para funil ate existir integracao automatica.
- `Original_*`: copia das abas recebidas para auditoria.

## Proximas decisoes

- Definir metas reais por atendente, site, operadoras, OTAs e BE Mobile.
- Definir se `PARTICULAR` deve virar `WhatsApp`, `Central`, `Walk-in` ou outro canal detalhado.
- Definir padrao oficial de hoteis.
- Definir campos obrigatorios no lancamento diario.
- Separar definitivamente `Responsavel` de `Origem/Canal`.
