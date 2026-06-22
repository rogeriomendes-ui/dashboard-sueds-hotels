# Fluxo recomendado para Google Sheets

Arquivo base: `Vendas Sueds Hotels - V3 Google Sheets.xlsx`

## Como usar

1. Subir o arquivo para o Google Drive.
2. Abrir com Google Sheets.
3. Compartilhar com a equipe de vendas.
4. Deixar editavel somente a aba `Lancamento_Vendas`.
5. Proteger as abas:
   - `00_Instrucoes`
   - `Dashboard_Base`
   - `Base_Dashboard`
   - `Cadastros`
   - `Metas`
   - `De_Para`
   - `Funil_Asksuite`

## Aba que os vendedores devem preencher

`Lancamento_Vendas`

Cada linha deve representar uma reserva.

Na planilha modelo, apenas as colunas de preenchimento ficam desbloqueadas. As colunas com formulas ou controle ficam travadas.

Campos obrigatorios:

- Data Venda
- Hotel
- Canal
- Vendedor
- Cliente
- Checkin
- Checkout
- Valor Total
- Recebido
- Forma Pagto
- Status

Campos calculados:

- Diarias
- A Receber

Campos travados:

- Diarias
- A Receber
- Fonte

Campos livres para o time preencher:

- Data Venda
- Codigo Reserva
- Hotel
- Canal
- Vendedor
- Cliente
- Checkin
- Checkout
- UHs
- Adultos
- Criancas
- Valor Total
- Recebido
- Forma Pagto
- Parcelas
- Status
- Observacoes

## Regra importante

Nao misturar vendedor com canal.

Exemplo correto:

| Campo | Valor |
| --- | --- |
| Canal | PARTICULAR, CENTRAL DE RESERVAS, Asksuite, Telefone ou outra origem real |
| Vendedor | Aline Nunes |

Exemplo para venda do site:

| Campo | Valor |
| --- | --- |
| Canal | BOOKING ENGINE ou BE MOBILE |
| Vendedor | Site |

Para o historico importado da planilha original, a coluna `Canal` preserva o valor da coluna `CANAL` antiga, por exemplo:

- `BOOKING ENGINE`
- `BE MOBILE`
- `CENTRAL DE RESERVAS`
- `PARTICULAR`

## Como o dashboard deve ler

O dashboard deve usar a aba `Base_Dashboard`.

Ela padroniza os dados vindos de `Lancamento_Vendas` e evita que o dashboard dependa diretamente da aba usada pelos vendedores.

## Aba Dashboard_Base

A aba `Dashboard_Base` usa o campo `Mês selecionado` em `B2`.

Exemplos:

- `2026-05`
- `2026-06`
- `2026-07`

Ao trocar esse valor, os indicadores, canais e vendedores da aba passam a filtrar somente o mês escolhido.

## Proximos ajustes antes de publicar para a equipe

- Confirmar lista oficial de vendedores.
- Confirmar lista oficial de canais.
- Confirmar se `PARTICULAR` deve ser tratado como `WhatsApp`.
- Definir metas de junho por vendedor/canal.
- Proteger abas no Google Sheets.
