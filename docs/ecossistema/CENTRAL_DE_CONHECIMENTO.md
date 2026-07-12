# Central de Conhecimento

## Papel

A Central de Conhecimento é a fonte oficial de conteúdo do Ecossistema Sueds Hotels. Markdown é o formato editorial canônico e o banco mantém metadados, versões, relações, publicação e auditoria.

## Estrutura de módulos

- `comercial`
- `hoteis`
- `produtos-experiencias`
- `procedimentos`
- `faq`
- `marketing`
- `ia`
- `operacao`
- `rh`
- `financeiro`
- `ti`
- `academia`

## Metadados obrigatórios

Cada documento Markdown deve começar com front matter:

```yaml
---
id: UUID_ESTAVEL
slug: horario-cafe-da-manha
title: Horário do café da manhã
module: hoteis
type: horario
scope: property
scope_id: UUID_DO_HOTEL
visibility: internal
status: draft
owner: alimentos-e-bebidas
valid_from: 2026-07-01
valid_until:
review_at: 2026-10-01
tags:
  - cafe-da-manha
  - horario
consumers:
  - sueli
  - portal-agente
  - portal-colaborador
  - faq
---
```

## Status editorial

- `draft`: em elaboração;
- `review`: aguardando validação;
- `published`: versão oficial vigente;
- `archived`: mantido apenas no histórico.

Somente conteúdo publicado e vigente pode ser consumido por canais de produção.

## Visibilidade

- `public`: pode alimentar canais públicos;
- `partner`: agentes e parceiros autenticados;
- `internal`: colaboradores;
- `restricted`: grupos autorizados;
- `confidential`: acesso nominal e auditado.

## Fluxo de atualização

1. O proprietário edita um rascunho.
2. Um revisor valida conteúdo, escopo e vigência.
3. A publicação cria uma nova versão imutável.
4. Busca, portais e IA passam a consumir a nova versão.
5. A versão anterior permanece no histórico.

## Reutilização

Um documento pode ser relacionado a vários consumidores. O conteúdo não deve ser copiado para cada canal. Adaptações de apresentação são geradas em tempo de consumo ou armazenadas como artefatos derivados ligados à versão canônica.

## Tags

Tags devem usar vocabulário controlado. Categorias iniciais:

- hotel;
- departamento;
- produto;
- experiência;
- audiência;
- canal;
- jornada do hóspede;
- sazonalidade;
- sistema de origem.

## Qualidade

Antes de publicar, validar:

- informação correta e completa;
- responsável definido;
- escopo correto;
- ausência de duplicidade;
- datas de vigência;
- links e relações;
- linguagem adequada ao público;
- revisão futura programada.

