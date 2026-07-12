# Arquitetura do módulo Dashboard SUEDS

> Documento do módulo legado. A arquitetura da plataforma está em [docs/ecossistema/ARQUITETURA.md](docs/ecossistema/ARQUITETURA.md). Novos cadastros e conteúdos devem seguir a Central de Conhecimento e não podem ser adicionados como hardcode neste módulo.

## Fluxo

1. Vendedores preenchem a planilha Google Sheets.
2. O backend lê a aba `Base_Dashboard` via Google Sheets API.
3. O backend calcula KPIs, metas e agrupamentos.
4. O backend expõe dois endpoints:
   - `/api/dashboard/gestores`
   - `/api/dashboard/tv`
5. Cada painel consome apenas o endpoint adequado.

## Visões

### Gestores

Arquivo: `dashboard-gestores.html`

Endpoint: `/api/dashboard/gestores`

Aceita filtro opcional:

- `/api/dashboard/gestores?date=2026-05-30&month=2026-05`

Pode exibir:

- Valores de venda.
- Receita do dia e mês.
- Recebido e a receber.
- Ranking de vendedores com valores.
- Canais.
- Hotéis.

### TV da equipe

Arquivo: `dashboard-tv.html`

Endpoint: `/api/dashboard/tv`

Aceita filtro opcional:

- `/api/dashboard/tv?date=2026-05-30&month=2026-05`

Nao recebe valores em reais.

Exibe apenas:

- Nome do vendedor.
- Reservas do dia.
- Percentual da meta do dia.
- Percentual da meta do mês.
- Status visual.

## Configuração Google

1. Criar um projeto no Google Cloud.
2. Ativar a API Google Sheets.
3. Criar uma Service Account.
4. Gerar uma chave JSON.
5. Compartilhar a planilha Google Sheets com o e-mail da Service Account como leitor.
6. Configurar as variáveis de ambiente conforme `.env.example`.

## Variáveis principais

- `GOOGLE_SHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_BASE_RANGE`
- `GOOGLE_METAS_RANGE`

## Segurança

- O painel da TV nunca deve ler `/api/dashboard/gestores`.
- O endpoint da TV nao inclui valores de venda.
- A planilha deve manter a aba `Base_Dashboard` protegida.
- Quando publicar em produção, proteger o painel de gestores com login ou rede interna.
