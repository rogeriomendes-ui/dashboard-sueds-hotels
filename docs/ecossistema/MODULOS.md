# Catálogo de módulos

Este catálogo orienta a evolução do Ecossistema. Cada módulo é consumidor e, quando autorizado, editor de entidades canônicas. Nenhum módulo deve criar uma base paralela.

## Dashboard Executivo

Consolida KPIs corporativos, receitas, ocupação, revenue e marketing. Consome métricas normalizadas e não altera transações de origem.

## Comercial

Abrange Central de Reservas, grupos, operadoras, CRM e vendas. Consome hotéis, produtos, políticas, scripts e metas canônicas.

## Marketing

Abrange Google Ads, Meta Ads, GA4, UTMs, campanhas, landing pages, redes sociais e materiais. Campanhas e criativos devem se relacionar a produtos, hotéis e períodos canônicos.

## AI Sales Engine

Abrange Sueli, prompt mestre, playbooks, objeções, scripts, fluxos, JSONs, Asksuite e avaliações da IA. Respostas devem citar versões publicadas da Central de Conhecimento.

## Central de Conhecimento

Mantém o cadastro oficial de conteúdos, versões, tags, vigência, relações e consumidores.

## Hotéis

Cada propriedade é uma entidade, não um módulo duplicado. Pode relacionar descrições, fotos, apartamentos, políticas, horários, restaurantes, piscinas, FAQs e materiais.

## Produtos e Experiências

Mantém Luau, Beach Club, jantares temáticos, Lê Bistrô, passeios, meia pensão, pensão completa e futuros produtos. Produtos podem ser globais ou vinculados a propriedades.

## Operação

Abrange recepção, governança, manutenção, alimentos e bebidas e Beach Club. Procedimentos são conteúdos canônicos relacionados a departamentos e hotéis.

## RH

Abrange integração, treinamentos, procedimentos e avaliações. Consome conteúdos da Academia e registra progresso separadamente.

## Financeiro

Abrange procedimentos, pagamentos e contratos com classificação de acesso apropriada.

## TI e Integrações

Mantém infraestrutura, APIs, conectores, contratos e observabilidade de Asksuite, Omnibees, KPIFull, GA4, Meta, Google Ads e demais sistemas.

## Academia Sueds

Organiza trilhas, vídeos, procedimentos, integração e avaliações. Uma aula referencia o conteúdo canônico usado como fonte.

## Portal do Agente

Consulta conteúdo com visibilidade `partner`. Não mantém cópias de políticas, hotéis ou produtos.

## Portal do Colaborador

Consulta conteúdo interno conforme hotel, departamento e perfil. Não mantém cópias de procedimentos ou treinamentos.

## Requisitos para um novo módulo

Antes da implementação, registrar:

- problema e público;
- domínio responsável;
- entidades canônicas utilizadas;
- fontes externas;
- dados que o módulo pode editar;
- permissões;
- consumidores;
- comportamento para múltiplos hotéis;
- métricas e observabilidade;
- plano de migração e desativação de duplicidades.

