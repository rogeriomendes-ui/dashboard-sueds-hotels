# Dashboard SUEDS Hotels

Base profissional para a Sala de Comando Comercial da SUEDS Hotels.

## Objetivo

Centralizar em uma tela os principais indicadores de vendas, funil, site, canais, atendentes e hotéis, com visual adequado para TV da central de vendas e versão responsiva para celular.

## Fontes previstas

- Google Sheets: base de vendas, metas, ranking de atendentes e canais.
- Asksuite: funil do dia, solicitações humanas, indisponibilidades e reservas.
- Google Analytics 4: usuários online, usuários únicos, origem de tráfego e dispositivos.
- KPIFull: ocupação, ADR, RevPAR, pickup e indicadores hoteleiros.
- Omnibees: reservas online, motor de reservas e receita direta.
- Google Ads e Meta Ads: investimento, leads, conversões, CPL e ROAS.
- Vetor Trade: competitividade e inteligência de mercado.

## Próxima estrutura de dados

Recomendação para a planilha principal:

| Aba | Função |
| --- | --- |
| `Base_Vendas` | Uma linha por reserva, sem fórmulas manuais. |
| `Metas` | Meta diária e mensal por hotel, canal e equipe. |
| `Funil_Asksuite` | Captura diária das etapas do atendimento. |
| `Canais` | Padronização de canal macro, canal detalhado e origem. |
| `De_Para` | Normalização de nomes de hotéis, vendedores, robôs e operadoras. |

## Como rodar localmente

```powershell
node server.js
```

Depois abra:

- TV vendas: `http://localhost:3000/dashboard-tv.html`
- Gestores: `http://localhost:3000/dashboard-gestores.html`
- API TV: `http://localhost:3000/api/dashboard/tv`
- API gestores: `http://localhost:3000/api/dashboard/gestores`

Sem credenciais do Google, o servidor roda com dados demo.

## Como conectar ao Google Sheets

1. Criar um projeto no Google Cloud.
2. Ativar a Google Sheets API.
3. Criar uma Service Account.
4. Gerar a chave JSON da Service Account.
5. Compartilhar a planilha com o e-mail da Service Account como leitor.
6. Configurar as variáveis da `.env.example` no ambiente do servidor.

O backend lê `Base_Dashboard` e `Metas`, calcula os KPIs e expõe duas visões separadas:

- `/api/dashboard/gestores`: completa, com valores.
- `/api/dashboard/tv`: restrita, sem valores de venda.
