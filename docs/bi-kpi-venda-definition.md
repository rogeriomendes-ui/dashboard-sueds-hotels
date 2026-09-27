# Definição de Venda no BI Relatórios by KPI (27/09/2026)

## Decisão

Para **2025 e 2026**, o valor de `Venda` no BI Relatórios by KPI e no XLS é a soma de `Diária × RN` de cada trecho de hospedagem da reserva na aba `base kpi 2025` ou `base kpi 2026`. A reserva conta uma vez nos indicadores de quantidade, mas trechos distintos de hospedagem contribuem com suas próprias diárias e room nights. Linhas com o mesmo hotel, número de reserva, check-in, check-out, diária e RN são tratadas como repetição do mesmo trecho.

O campo `Total` bruto das abas permanece **inalterado**. No XLS, a coluna X é `Venda (KPI)` e a coluna Y preserva `Total bruto (planilha)` para auditoria.

## Por que mudamos

Na consulta KPI Full para vendas de **01 a 31/01/2026**, hotel **SUEDS PLAZA**, o painel mostrava `Venda = R$ 931.326,66` e `UH = 2.044`. A soma de `Diária × RN` das 366 linhas correspondentes já capturadas na aba `base kpi 2026` resulta exatamente em **R$ 931.326,66** e **2.044 RN**. O BI anterior somava `Total` por reserva e mostrava **R$ 1.596.800,92**, com 2.036 room nights. A reserva **43099** exemplifica a distorção: `Total bruto = R$ 670.088,50`, mas `Diária = R$ 1.811,05` e `RN = 5`, correspondendo a `Venda = R$ 9.055,25` no painel KPI.

## Implementação e eventual reversão

- Código: `server.js`, funções `kpiObjectsFromColumnRanges`, `kpiUniqueStayRows`, `kpiReservationNights`, `kpiReservationRevenue`, `normalizeKpiReportObjects`, `filterBiKpiSourceRows` e `buildBiKpiSourceWorkbook`.
- A leitura compacta passou a incluir `H` (`Diária`) das duas abas; a consolidação e o XLS passaram a usar `Diária × RN`.
- Testes: `tools/test_bi_reports.cjs` cobre 2025/2026, trechos distintos, linha repetida, reserva de crédito e colunas do XLS.
- Para voltar à definição anterior, restaurar no código a receita por reserva como o maior `Total` bruto entre suas linhas e a coluna X do XLS como esse valor. Não é necessário desfazer nem alterar dados das abas KPI, pois elas guardam os valores originais.

Esta definição é específica do relatório **BI Relatórios by KPI**; não altera as rotinas de vendas DeskHotel, TV de Vendas ou outras bases comerciais.
