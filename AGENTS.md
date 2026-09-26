# Regras das vendas SUEDS

Em Lancamento_Vendas, R só recebe Confirmada, Pendente ou Cancelada por automação. Nunca importar Alterada nem inferir outro status a partir dela. Omnibees não atualiza R nessa aba, mesmo com Fonte vazia. Validar também todas as mudanças de status, não somente inclusões, com leituras atuais das duas abas e requests reais conforme docs/sales-routing.md.

Para qualquer captura, importação, sincronização ou correção de vendas, leia `docs/sales-routing.md` e use `lib/sales-routing.js`.
Desde 01/09/2026, `Lancamento_Vendas` contém vendas dos vendedores. Site, Robo e demais origens externas ficam exclusivamente em `teste lancamento_vendas`. Não copie essas vendas de volta para a aba dos vendedores.
Na captura DeskHotel, a origem visível é obrigatória. Não a deduza por nome de hóspede, código ou vendedor vazio. Fonte S = DESKHOTEL. Preserve o histórico anterior a setembro.
