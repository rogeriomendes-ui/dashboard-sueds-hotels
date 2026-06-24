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
Primeira versão publicada na Vercel.

## Importar carrinhos abandonados da Niara

Fluxo recomendado via Google Sheets:

1. Na Niara, filtre as reservas perdidas do periodo desejado.
2. Exporte o arquivo `.xlsx`.
3. No Google Sheets, abra a aba `Importar_Niara`.
4. Importe ou cole nessa aba os dados exportados da Niara, mantendo os cabecalhos na primeira linha.
5. No menu da planilha, clique em `SUEDS Dashboard` > `Importar carrinhos da aba Importar_Niara`.

O script da planilha usa o campo `ID` como chave, atualiza somente as colunas `A:Q` da aba `Recuperação de carrinhos` e preserva as colunas `R:U`, preenchidas pelo time durante a recuperacao.

Para instalar o menu na planilha:

1. Abra `Extensoes` > `Apps Script`.
2. Cole o conteudo de `google-apps-script/importar_carrinhos_niara.gs`.
3. Salve e recarregue a planilha.

Fluxo alternativo local:

1. Na Niara, filtre as reservas perdidas do periodo desejado.
2. Exporte o arquivo `.xlsx`.
3. Rode primeiro em modo simulacao:

```powershell
npm run import:niara:carrinhos -- "C:\Users\roger\Downloads\reservas-perdidas.xlsx"
```

4. Se o resumo estiver correto, aplique:

```powershell
npm run import:niara:carrinhos -- "C:\Users\roger\Downloads\reservas-perdidas.xlsx" --apply
```

O importador usa o campo `ID` como chave, atualiza somente as colunas `A:Q` da aba `Recuperação de carrinhos` e preserva as colunas `R:U`, preenchidas pelo time durante a recuperacao.

Opcao mais simples no Windows:

1. Baixe o arquivo da Niara na pasta `Downloads`.
2. Deixe o nome comecando por `reservas-perdidas`.
3. Abra com duplo clique o arquivo `Importar carrinhos Niara.bat`.
4. Confira a simulacao e confirme com `S` para aplicar.

## Importar resumo de atendimentos do Asksuite

Fluxo recomendado via Google Sheets:

1. No Asksuite, exporte o relatorio por atendente em `.xlsx`.
2. No Google Sheets, abra a aba `Importar_Asksuite`.
3. Importe ou cole nessa aba os dados exportados do Asksuite, mantendo os cabecalhos na primeira linha.
4. No menu da planilha, clique em `SUEDS Dashboard` > `Importar Asksuite da aba Importar_Asksuite`.
5. Informe a data do relatorio no formato `AAAA-MM-DD`.

O script da planilha cria/atualiza a aba `Asksuite_Atendimentos`, usa `Data + Atendente` como chave e ignora atendentes que nao fazem parte dos quatro vendedores do painel.

Para instalar ou atualizar o menu na planilha:

1. Abra `Extensoes` > `Apps Script`.
2. Cole o conteudo de `google-apps-script/importar_carrinhos_niara.gs`.
3. Salve e recarregue a planilha.

Fluxo alternativo local:

1. No Asksuite, exporte o relatorio por atendente em `.xlsx`.
2. Deixe o nome original com a data, por exemplo `por_atendente_23_06_2026_2135.xlsx`.
3. Rode primeiro em modo simulacao:

```powershell
npm run import:asksuite -- "C:\Users\roger\Downloads\por_atendente_23_06_2026_2135.xlsx"
```

4. Se o resumo estiver correto, aplique:

```powershell
npm run import:asksuite -- "C:\Users\roger\Downloads\por_atendente_23_06_2026_2135.xlsx" --apply
```

O importador cria/atualiza a aba `Asksuite_Atendimentos`, usa `Data + Atendente` como chave e ignora atendentes que nao fazem parte dos quatro vendedores do painel.
