# Dashboard Operacional SUEDS - Opiniarios

## Objetivo

Automatizar a captura dos opiniarios em papel recebidos nas recepcoes dos hoteis, reduzindo digitacao manual e criando uma base unica para dashboards operacionais de gestores e TVs.

## Fluxo MVP

1. A recepcao fotografa um opiniario por vez.
2. A foto e enviada para uma pasta do Google Drive, separada por hotel ou com o hotel identificado no nome da pasta.
3. Um Apps Script roda manualmente ou por gatilho de tempo.
4. O script cria um registro na aba `Opinarios`, com link da foto, hotel, status e campos estruturados.
5. A leitura por OpenAI Vision preenche textos livres, nome, quarto e datas quando a `OPENAI_API_KEY` estiver configurada.
6. As bolinhas de avaliacao sao lidas por OMR/pixels no endpoint `OPINARIOS_OMR_ENDPOINT`, sem interpretacao livre da IA.
7. Registros com baixa confianca ficam em `Revisao_Opinarios`.
7. O dashboard operacional le a planilha e exibe visoes para gestores e TV.

## Piloto SUEDS Plaza

Planilha operacional criada:

```text
SUEDS Operacional - Opinarios
ID: 18PXw4BpneBJUlL_EtPQv_aM1G__ZCIm71RPByZlI6uk
Link: https://docs.google.com/spreadsheets/d/18PXw4BpneBJUlL_EtPQv_aM1G__ZCIm71RPByZlI6uk/edit
```

Pastas criadas no Google Drive:

```text
OPINARIOS
ID: 1JqdCOSc8tdwJKao90qBIPP1ryk-aXnp8
Link: https://drive.google.com/drive/folders/1JqdCOSc8tdwJKao90qBIPP1ryk-aXnp8

SUEDS PLAZA OPINARIOS
ID: 16eaSsuRagT5ZYYVz34t5-Bzkvxf0UQZG
Link: https://drive.google.com/drive/folders/16eaSsuRagT5ZYYVz34t5-Bzkvxf0UQZG
```

Configuracao inicial do Apps Script para o piloto:

```text
OPINARIOS_ROOT_FOLDER_ID = 1JqdCOSc8tdwJKao90qBIPP1ryk-aXnp8
OPINARIOS_SOURCE_FOLDER_ID = 16eaSsuRagT5ZYYVz34t5-Bzkvxf0UQZG
OPINARIOS_ACTIVE_HOTEL = SUEDS PLAZA
OPINARIOS_FORM_VERSION = 20260719
OPINARIOS_ACCEPTED_FORM_VERSIONS = 20260719,20260720
OPINARIOS_MIN_CONFIDENCE = 90
OPINARIOS_MIN_FILLED_RATINGS = 0
OPINARIOS_OMR_ENDPOINT = https://dashboard-sueds-hotels.vercel.app/api/operacional/opinarios-omr
```

Para o primeiro teste, subir 3 fotos reais preenchidas na pasta `SUEDS PLAZA OPINARIOS` e rodar manualmente o menu `SUEDS Operacional > Processar novas fotos do Drive`.
No piloto, campos em branco ou itens com mais de uma bolinha marcada devem ser desconsiderados na pontuacao, mas nao bloqueiam o processamento do formulario.
Fotos com baixa confianca geral de leitura ainda devem ficar em revisao.

Depois de validar o processamento manual, criar o gatilho pelo menu `SUEDS Operacional > Criar gatilho a cada 15 minutos`.
O processamento automatico registra cada execucao na aba `Log_Opinarios`, porque gatilhos de tempo rodam sem janela de alerta do Google Sheets.
Use `SUEDS Operacional > Verificar gatilhos ativos` para confirmar se ha gatilho instalado.
Para testar apenas os quatro formularios mais recentes, use `SUEDS Operacional > Reprocessar ultimas 4 fotos com OMR`.

## QR Code por hotel

Cada formulario impresso deve ter um QR Code exclusivo por hotel e por versao do formulario. O QR deve apontar para uma URL com parametros, para que a pagina digital e a IA saibam qual unidade e qual conjunto de perguntas deve ser usado.

Padrao sugerido:

```text
https://dashboard-sueds-hotels.vercel.app/opinario.html?hotel=sueds-plaza&form_version=20260719&lang=pt-BR
```

Identificacao impressa no rodape:

```text
HOTEL=SUEDS_PLAZA | FORM_VERSION=20260719 | LANG=PT-BR
```

Para o modelo impresso melhorado do Plaza, a grade deve usar bolinhas/circulos grandes e linhas horizontais por pergunta.
Na foto de teste, capturar apenas uma ficha preenchida por imagem. A folha pode ter duas fichas para impressao, mas o processamento OCR/IA deve receber uma ficha individual por arquivo.
Quando o layout mudar para uso oficial, idealmente atualizar tambem o `FORM_VERSION` para uma nova data/versao, evitando misturar resultados de layouts diferentes.
Na leitura das bolinhas, considerar como marcacao valida: bolinha pintada, bolinha parcialmente pintada, X, traco horizontal, traco vertical, risco diagonal ou rabisco claro dentro da bolinha.
Se o hospede marcar duas ou mais bolinhas no mesmo item, deixar aquele item em branco para a pontuacao e seguir com os demais itens do formulario.
Essa leitura nao deve ser feita pela IA visual livre. A IA deve ler apenas campos de texto; as 12 respostas de avaliacao devem vir do OMR por coordenadas/pixels do formulario atual.

O QR Code do SUEDS Plaza desta versao fica em:

```text
assets/qrcodes/sueds-plaza-opinario-20260719.svg
assets/qrcodes/sueds-plaza-opinario-20260719.png
```

Para gerar novos QRs:

```text
python tools/generate_opinario_qr.py --hotel "sueds-trancoso" --version "20260719"
```

## Matriz de campos por hotel

A versao final do formulario deve manter a mesma estrutura visual, mas os campos ativos podem variar por hotel. Campos que nao existem em uma unidade nao devem entrar no calculo de nota, nem ir para revisao como "nao preenchidos".

No momento, apenas o SUEDS Plaza esta ativo como formulario oficial. Dados anteriores e modelos de teste devem ser desconsiderados; o painel operacional considera apenas registros com `Form Version` igual ou posterior a `20260719`.

```text
SUEDS PLAZA
- Impressao geral
- Reserva
- Recepcao / Check-in / Check-out
- Atendimento da equipe
- Conforto do quarto
- Limpeza do quarto
- Qualidade do Wi-fi
- Area de lazer / piscina
- Atendimento da equipe do Beach Club
- Cafe da manha
- Almoco
- Jantar

DEMAIS HOTEIS
- Aguardando configuracao individual do opinario final.
- Nao assumir campos ausentes ate validarmos o formulario de cada hotel.
```

## Pastas sugeridas no Drive

```text
OPINARIOS
  SUEDS PLAZA OPINARIOS
  SUEDS CABRALIA OPINARIOS
  SUEDS SEGUNDO SOL OPINARIOS
  SUEDS PREMIUM OPINARIOS
  SUEDS TRANCOSO OPINARIOS
  CASAS SUEDS ARRAIAL OPINARIOS
```

## Abas da planilha

### `Hoteis_Operacional`

Cadastro das unidades usadas nas visoes operacionais.

```text
Hotel
Status
Ordem TV
Observacao
```

### `Opinarios`

Uma linha por opiniario.

```text
ID Arquivo
Data Processamento
Hotel
Nome Arquivo
Link Foto
Origem
Hotel Slug
Form Version
Idioma
Nome Hospede
Apartamento
Data Entrada
Data Saida
Impressao Geral
Reserva
Recepcao / Check-in / Check-out
Atendimento da equipe
Conforto do quarto
Limpeza do quarto
Qualidade do Wi-fi
Area de lazer / piscina
Atendimento da equipe do Beach Club
Alimentos Cafe da Manha
Alimentos Almoco
Alimentos Jantar
Comentarios
Destaques
Problemas Identificados
Nota Calculada %
Confianca %
Status
Responsavel Revisao
Observacao Revisao
Data Revisao
```

### `Revisao_Opinarios`

Fila de excecoes para conferencias humanas.

```text
ID Arquivo
Data Processamento
Hotel
Link Foto
Motivo Revisao
Campos com Duvida
Status Revisao
Responsavel
Data Revisao
```

### `Config_Operacional`

Parametrizacoes do fluxo.

```text
Chave
Valor
Descricao
```

Chaves iniciais:

```text
OPINARIOS_SOURCE_FOLDER_ID
OPINARIOS_ACTIVE_HOTEL
OPINARIOS_FORM_VERSION
OPINARIOS_ACCEPTED_FORM_VERSIONS
OPINARIOS_OMR_ENDPOINT
OPINARIOS_OMR_TOKEN
OPINARIOS_PROCESSED_FOLDER_ID
OPINARIOS_ERROR_FOLDER_ID
OPINARIOS_MIN_CONFIDENCE
OPINARIOS_MIN_FILLED_RATINGS
OPENAI_MODEL
OPINARIOS_MAX_IMAGE_MB
```

A chave da OpenAI nao fica na planilha. Ela deve ser salva em `SUEDS Operacional` > `Configurar OpenAI API Key`, que grava o valor nas Propriedades do Script.
Para fotos de formularios impressos, use `OPENAI_MODEL = gpt-4o` durante o piloto se a leitura com `gpt-4o-mini` confundir marcas leves, riscos diagonais ou colunas proximas.

## Padrao de notas

As marcacoes dos formularios sao convertidas para escala percentual:

```text
Excelente = 100
Otimo = 100
Muito bom = 85
Bom = 70
Regular = 40
Nao preenchido = vazio
```

## Indicadores iniciais

### TV Operacional

- Nota geral do mes.
- Quantidade de opiniarios recebidos.
- Nota por hotel.
- Nota por setor.
- Destaques positivos do mes.
- Pontos de atencao.
- Colaborador/equipe destaque quando houver citacao.

### Gestores Operacional

- Lista de opiniarios com foto.
- Comentarios negativos.
- Problemas por hotel/setor.
- Evolucao diaria e mensal.
- Itens com maior volume de `Regular`.
- Pendencias de revisao/tratativa.

## Regras de privacidade

Na TV nao exibir:

- Nome do hospede.
- Apartamento.
- Link da foto.
- Comentarios sensiveis ou individualizados.

Esses dados ficam apenas na visao de gestores.
