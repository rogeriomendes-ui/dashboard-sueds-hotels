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

## Pastas sugeridas no Drive

```text
SUEDS Operacional
  Opinarios - Entrada
    SUEDS Cabrália
    SUEDS Segundo Sol
    SUEDS Plaza
    SUEDS Premium
    SUEDS Trancoso
    Casas Sueds Arraial
  Opinarios - Processados
  Opinarios - Erro
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
OPINARIOS_PROCESSED_FOLDER_ID
OPINARIOS_ERROR_FOLDER_ID
OPINARIOS_MIN_CONFIDENCE
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
