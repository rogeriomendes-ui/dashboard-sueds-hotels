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
- Inteligência de Mercado: `http://localhost:3000/dashboard-inteligencia-mercado.html`
- TV operacional: `http://localhost:3000/dashboard-operacional-tv.html`
- API TV: `http://localhost:3000/api/dashboard/tv`
- API gestores: `http://localhost:3000/api/dashboard/gestores`
- API inteligência de mercado: `http://localhost:3000/api/inteligencia/mercado`
- API TV operacional: `http://localhost:3000/api/operacional/tv`

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

## Conectar ao Google Analytics 4

1. Ative a `Google Analytics Data API` no mesmo projeto Google Cloud da service account.
2. No GA4, abra `Administrador` > `Gerenciamento de acesso à propriedade`.
3. Adicione a service account como `Leitor`:

```text
dashboard-sueds@dashboard-sueds.iam.gserviceaccount.com
```

4. Configure as variáveis:

```text
GOOGLE_ANALYTICS_PROPERTY_ID=291327493
GOOGLE_ANALYTICS_SITE_PROPERTY_ID=291327493
GOOGLE_ANALYTICS_OMNIBEES_PROPERTY_ID=390878878
```

Na TV, o painel exibe separadamente o site institucional e o motor Omnibees, com usuários ativos em tempo real, página principal e origem principal, sem valores financeiros. Na visão gestores, exibe também usuários, sessões, visualizações e listas de páginas/origens do mês para as duas propriedades.

## Conectar ao Google Ads

1. Crie ou use uma conta de administrador Google Ads.
2. Vincule a conta anunciante `730-040-1572 GRUPO SUEDS` nessa conta de administrador.
3. Na conta administradora, abra a `Central de API` e copie o `Developer Token`.
4. No Google Cloud, ative a `Google Ads API`.
5. Em `APIs e servicos` > `Credenciais`, crie um `ID do cliente OAuth` do tipo `App para computador`.
6. Configure no `.env`:

```text
GOOGLE_ADS_CUSTOMER_ID=7300401572
GOOGLE_ADS_LOGIN_CUSTOMER_ID=4545711374
GOOGLE_ADS_DEVELOPER_TOKEN=COLE_O_DEVELOPER_TOKEN_AQUI
GOOGLE_ADS_CLIENT_ID=COLE_O_CLIENT_ID_OAUTH_AQUI
GOOGLE_ADS_CLIENT_SECRET=COLE_O_CLIENT_SECRET_OAUTH_AQUI
```

7. Gere o refresh token:

```powershell
npm run googleads:token
```

Abra o link exibido no terminal, autorize com o usuario que acessa o Google Ads e copie o valor `GOOGLE_ADS_REFRESH_TOKEN` retornado para o `.env` local e para as variaveis de ambiente da Vercel.

No Windows, se o `npm` nao estiver disponivel, use duplo clique no arquivo `Gerar token Google Ads.bat`.

Se o navegador mostrar `127.0.0.1 refused to connect` depois da autorizacao, copie a URL inteira da barra do navegador e rode:

```powershell
& "C:\Users\roger\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" tools\google_ads_oauth_token.js --url "COLE_A_URL_INTEIRA_AQUI"
```

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

## Dashboard operacional: opiniarios

O dashboard operacional começa pelo fluxo de opiniarios em papel:

1. Cada hotel fotografa o opiniario recebido na recepcao.
2. A foto entra em uma pasta do Google Drive.
3. Um Apps Script cria registros nas abas `Opinarios` e `Revisao_Opinarios`.
4. A etapa de IA de visao preenche os campos estruturados e envia excecoes para revisao.
5. O dashboard operacional usa a planilha como fonte para as visoes de gestores e TV.

Arquivos de referencia:

- `OPERACIONAL_OPINARIOS.md`: desenho do fluxo, abas e indicadores.
- `google-apps-script/operacional_opinarios_drive.gs`: primeiro script para preparar abas e processar fotos novas do Drive.

Para instalar:

1. Crie a planilha `Dashboard Operacional SUEDS`.
2. Abra `Extensoes` > `Apps Script`.
3. Cole o conteudo de `google-apps-script/operacional_opinarios_drive.gs`.
4. Salve e recarregue a planilha.
5. No menu `SUEDS Operacional`, clique em `Preparar abas de opiniarios`.
6. Confira a aba `Hoteis_Operacional`, que ja nasce com os 5 hoteis atuais e `Casas Sueds Arraial`.
7. Na aba `Config_Operacional`, preencha `OPINARIOS_SOURCE_FOLDER_ID` com o ID da pasta do Drive onde entram as fotos.
8. No menu `SUEDS Operacional`, clique em `Configurar OpenAI API Key` e cole a chave da OpenAI.
9. Rode `Processar novas fotos do Drive` para testar.

O script usa a OpenAI Responses API com entrada de imagem (`input_image`) em Base64 e resposta em JSON. A chave fica nas Propriedades do Script, nao na planilha.

Para o dashboard operacional ler a planilha, configure:

```text
GOOGLE_OPERATIONAL_SHEET_ID=ID_DA_PLANILHA_DASHBOARD_OPERACIONAL_SUEDS
GOOGLE_OPINIONS_RANGE=Opinarios!A:AG
```

A primeira TV operacional fica em `dashboard-operacional-tv.html` e mostra um card por hotel, quantidade de opiniarios, nota media final e medias por bloco: Geral, Alimentos, Atendimento, Apartamento e Servicos.
