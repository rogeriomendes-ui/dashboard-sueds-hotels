# Definição de Venda no BI Relatórios by KPI (27/09/2026)

## Decisão

Para **2025 e 2026**, o valor de `Venda` no BI Relatórios by KPI e no XLS é a soma de `Diária × RN` de cada trecho de hospedagem da reserva na aba `base kpi 2025` ou `base kpi 2026`. A reserva conta uma vez nos indicadores de quantidade, mas trechos distintos de hospedagem contribuem com suas próprias diárias e room nights. Linhas com o mesmo hotel, número de reserva, check-in, check-out, diária e RN são tratadas como repetição do mesmo trecho.

O campo `Total` bruto das abas permanece **inalterado**. No XLS, a coluna X é `Venda (KPI)` e a coluna Y preserva `Total bruto (planilha)` para auditoria.
Trechos com `RN > 0` e diária zero continuam contribuindo para UH, sem aumentar a receita.

## Por que mudamos

Na consulta KPI Full para vendas de **01 a 31/01/2026**, hotel **SUEDS PLAZA**, o painel mostrava `Venda = R$ 931.326,66` e `UH = 2.044`. A soma de `Diária × RN` das 366 linhas correspondentes já capturadas na aba `base kpi 2026` resulta exatamente em **R$ 931.326,66** e **2.044 RN**. O BI anterior somava `Total` por reserva e mostrava **R$ 1.596.800,92**, com 2.036 room nights. A reserva **43099** exemplifica a distorção: `Total bruto = R$ 670.088,50`, mas `Diária = R$ 1.811,05` e `RN = 5`, correspondendo a `Venda = R$ 9.055,25` no painel KPI.

## Implementação e eventual reversão

- Código: `server.js`, funções `kpiObjectsFromColumnRanges`, `kpiUniqueStayRows`, `kpiReservationNights`, `kpiReservationRevenue`, `normalizeKpiReportObjects`, `filterBiKpiSourceRows` e `buildBiKpiSourceWorkbook`.
- A leitura compacta passou a incluir `H` (`Diária`) das duas abas; a consolidação e o XLS passaram a usar `Diária × RN`.
- Testes: `tools/test_bi_reports.cjs` cobre 2025/2026, trechos distintos, linha repetida, reserva de crédito e colunas do XLS.
- Para voltar à definição anterior, restaurar no código a receita por reserva como o maior `Total` bruto entre suas linhas e a coluna X do XLS como esse valor. Não é necessário desfazer nem alterar dados das abas KPI, pois elas guardam os valores originais.

Esta definição é específica do relatório **BI Relatórios by KPI**; não altera as rotinas de vendas DeskHotel, TV de Vendas ou outras bases comerciais.

## Versões de captura — 16/10/2026

Na base de 2026, a coluna Y (`KPI Atual v1`) define quais linhas participam dos cálculos. `HISTORICO` e controles vazios são excluídos; `PRESERVADO` mantém a linha original; um controle JSON substitui os campos da linha pela versão atual, validando hotel, reserva e data de venda numérica. Uma base sem essa coluna mantém o tratamento anterior, inclusive o comparativo de 2025.

Indicadores, ocupação calculada e XLS utilizam a mesma seleção. Somam-se somente os trechos da versão atual, distinguindo apartamentos e empresas KPI. O total bruto permanece disponível na coluna Y do XLS para auditoria; ele não substitui `Diária × RN`.

Regressão da reserva 20413 do Premium: as versões antigas tinham 6 RN e a versão atual registra saída antecipada com 5 RN. O cálculo antigo somava 11 RN (R$ 2.361,15); com o controle atual são 5 RN (R$ 1.073,25), mantendo R$ 1.287,90 como total bruto. A correção não transforma o total bruto em receita calculada e não altera as linhas da planilha.

Validação: `node tools/test_kpi_current_versions.cjs` cobre histórico, versão atual, leitura compacta, XLS, cancelamentos, apartamentos, trechos distintos e controles inválidos.

### Atribuição de apartamento

Quando dois controles atuais têm o mesmo hotel, empresa, reserva, período de hospedagem, data de venda, diária, RN e total bruto, a linha com apartamento atribuído substitui a linha com apartamento `0` ou vazio. A seleção ocorre antes do filtro de status e é compartilhada pelo relatório, ocupação e XLS. A ordem física das linhas não define a versão vencedora. Apartamentos atribuídos distintos, empresas distintas e trechos distintos continuam preservados.

Regressão: Trancoso/BTF/2354, localizador RES007811-19865, apartamento 0 e depois 2, corresponde a uma hospedagem de 3 RN × R$ 605,34 = R$ 1.816,02. Não são 6 RN nem R$ 3.632,04. O controle antigo deve ser marcado HISTORICO; a proteção de leitura impede nova soma dupla caso uma captura volte a deixar ambas as versões ativas.
