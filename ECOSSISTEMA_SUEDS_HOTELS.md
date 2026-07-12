# Ecossistema Sueds Hotels

## Visão

O Ecossistema Sueds Hotels é a plataforma própria da rede para integrar conhecimento, operação, comercial, marketing, revenue management, atendimento, treinamento e inteligência artificial.

Os dashboards existentes passam a ser módulos de visualização do Ecossistema. Eles não são mais o produto completo e não devem se tornar fontes paralelas de informação.

## Missão

Centralizar dados e conhecimento da Sueds Hotels para oferecer uma fonte oficial, confiável, versionada e reutilizável por pessoas, sistemas e agentes de IA.

## Princípio central

### Single Source of Truth

Cada informação possui:

- um cadastro canônico;
- um responsável definido;
- um histórico de versões;
- uma regra de vigência;
- diversos consumidores.

Uma alteração de horário, política, produto, preço, procedimento ou campanha deve ser feita uma única vez. Os portais, dashboards, FAQs, treinamentos, materiais e agentes de IA devem consultar essa mesma origem.

## Regras obrigatórias

1. Nenhum conteúdo de negócio novo deve ficar hardcoded na interface.
2. Nenhum módulo pode manter uma cópia própria de um conteúdo canônico.
3. Toda informação precisa indicar origem, proprietário, vigência e última revisão.
4. Conteúdo publicado nunca é sobrescrito sem histórico.
5. Dados sensíveis devem respeitar perfis de acesso e trilha de auditoria.
6. Integrações externas alimentam a camada de dados; interfaces consomem APIs do Ecossistema.
7. Todo desenho deve funcionar para dezenas de hotéis e múltiplas marcas.
8. Antes de criar um módulo, deve-se comprovar que ele será reutilizável em uma rede de 50 hotéis.

## Domínios da plataforma

- Dashboard Executivo
- Comercial
- Marketing
- AI Sales Engine
- Central de Conhecimento
- Operação
- RH
- Financeiro
- TI e Integrações
- Academia Sueds
- Portal do Agente
- Portal do Colaborador

## Central de Conhecimento

A Central de Conhecimento é a origem oficial de conteúdo do Ecossistema. Ela reúne:

- playbooks comerciais;
- hotéis, apartamentos, serviços, horários e políticas;
- produtos e experiências;
- procedimentos operacionais;
- FAQs internas e externas;
- campanhas, materiais e guias de marketing;
- prompts, fluxos, respostas e treinamentos de IA;
- integração, treinamentos e avaliações de RH;
- procedimentos financeiros;
- documentação técnica e contratos de integração.

## Consumidores

Os consumidores não armazenam cópias independentes. Eles consultam conteúdo publicado conforme perfil, hotel, idioma, canal e vigência:

- Sueli e outros agentes de IA;
- Portal do Agente;
- Portal do Colaborador;
- dashboards e TVs;
- materiais comerciais;
- FAQs públicas e internas;
- treinamentos da Academia Sueds;
- integrações com Asksuite, Omnibees e demais sistemas.

## Documentos de arquitetura

- [Arquitetura alvo](docs/ecossistema/ARQUITETURA.md)
- [Catálogo de módulos](docs/ecossistema/MODULOS.md)
- [Central de Conhecimento](docs/ecossistema/CENTRAL_DE_CONHECIMENTO.md)
- [Roadmap](docs/ecossistema/ROADMAP.md)
- [ADR 001: fonte única](docs/ecossistema/decisoes/ADR-001-FONTE-UNICA.md)
