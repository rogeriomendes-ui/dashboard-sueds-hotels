# Dashboard Operacional SUEDS - Opiniarios

## Objetivo

Automatizar a captura dos opiniarios em papel recebidos nas recepcoes dos hoteis, reduzindo digitacao manual e criando uma base unica para dashboards operacionais de gestores e TVs.

## Fluxo MVP

1. A recepcao fotografa um opiniario por vez.
2. A foto e enviada para uma pasta do Google Drive, separada por hotel ou com o hotel identificado no nome da pasta.
3. Um Apps Script roda manualmente ou por gatilho de tempo.
4. O script cria um registro na aba `Opinarios`, com link da foto, hotel, status e campos estruturados.
5. A leitura por OpenAI Vision preenche os campos automaticamente quando a `OPENAI_API_KEY` estiver configurada.
6. Registros com baixa confianca ficam em `Revisao_Opinarios`.
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
OPINARIOS_MIN_CONFIDENCE = 80
OPINARIOS_MIN_FILLED_RATINGS = 1
```

Para o primeiro teste, subir 3 fotos reais preenchidas na pasta `SUEDS PLAZA OPINARIOS` e rodar manualmente o menu `SUEDS Operacional > Processar novas fotos do Drive`.

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
Nome Hospede
Apartamento
Impressao Geral
Nivel Apartamentos
Alimentos Cafe da Manha
Alimentos Bar da Piscina
Alimentos Jantar
Atendimento Cafe da Manha
Atendimento Bar da Piscina
Atendimento Jantar
Apartamento Limpeza Diaria
Apartamento Conforto Geral
Apartamento Equipamentos
Servicos Recepcao
Servicos Atendimento
Servicos Area Externa
Servicos Piscina
Obs Alimentos
Obs Atendimento
Obs Apartamento
Destaques
Problemas Identificados
Nota Calculada %
Confianca %
Status
Responsavel Revisao
Observacao Revisao
Data Revisao
Origem
Hotel Slug
Form Version
Idioma
Reserva
Qualidade do Wi-fi
Area de lazer / piscina
Atendimento da equipe do Beach Club
Alimentos Almoco
Consentimento Contato
Data Entrada
Data Saida
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
OPINARIOS_PROCESSED_FOLDER_ID
OPINARIOS_ERROR_FOLDER_ID
OPINARIOS_MIN_CONFIDENCE
OPINARIOS_MIN_FILLED_RATINGS
OPENAI_MODEL
OPINARIOS_MAX_IMAGE_MB
```

A chave da OpenAI nao fica na planilha. Ela deve ser salva em `SUEDS Operacional` > `Configurar OpenAI API Key`, que grava o valor nas Propriedades do Script.

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
