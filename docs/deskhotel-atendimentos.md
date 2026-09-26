# Rotina manual — Atendimentos Deskhotel

Executar somente quando solicitado pelo usuário; não criar agendamento.

1. Acessar a sessão autenticada em `https://dash.chatbooking.com.br/atendentes` (Dashboard > Atendentes) e selecionar o filtro **MÊS**. Confirmar o mês exibido antes de ler a tabela.
2. Capturar todas as linhas de atendentes e os campos da tela: Atendente, Atendimentos, Cotações, % atend x cotações, Vendas, % Cotações x Vendas, Valor Total e % Atend. X Vendas. Não usar totais da tela como se fossem atendentes.
3. Na planilha `Vendas Sueds Hotels - V3 Google Sheets`, aba `Atendimentos Deskhotel`, usar as colunas A:I: MES, Atendente, Atendimentos, Cotações, % atend x cotações, Vendas, % Cotações x Vendas, Valor Total, % Atend. X Vendas. A coluna MES identifica o mês de referência (por exemplo, `09/2026`). As cinco linhas já existentes pertencem a setembro de 2026.
4. Antes de gravar, ler as linhas atuais. Atualizar a linha existente pela chave **mês + atendente**; acrescentar somente atendentes ainda ausentes naquele mês. Preservar os outros meses e evitar duplicatas. Conferir os valores gravados com nova leitura.
5. Na TV Vendas, a partir de setembro de 2026, o card Deskhotel usa Atendimentos (C), Cotações (D), Vendas (F) e a taxa de conversão **diretamente da coluna I**. Rogério Mendes permanece na planilha, mas é uma exceção e não deve aparecer na TV nem entrar no total da equipe exibida nela. O histórico anterior a setembro continua usando Asksuite.

Se a sessão do Deskhotel não estiver acessível, não reutilizar números antigos como se fossem uma captura nova. Informar que a atualização ao vivo ficou pendente.
