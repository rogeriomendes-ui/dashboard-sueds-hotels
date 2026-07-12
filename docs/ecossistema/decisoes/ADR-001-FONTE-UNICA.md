# ADR 001: Central de Conhecimento como fonte única

## Status

Aceita em 12/07/2026.

## Contexto

Informações de hotéis, políticas, horários, produtos, campanhas e procedimentos podem ser usadas por dashboards, portais, materiais, treinamentos e agentes de IA. Manter cópias em cada consumidor gera divergência e retrabalho.

## Decisão

A Central de Conhecimento será a origem canônica de conteúdo. Consumidores consultarão versões publicadas por API, busca ou processo de publicação derivada. Nenhum consumidor poderá ser tratado como cadastro mestre.

Dados transacionais continuam em seus sistemas de origem, mas entram no Ecossistema por conectores normalizados e são relacionados a IDs canônicos.

## Consequências

### Positivas

- uma única atualização;
- histórico e auditoria;
- respostas de IA rastreáveis;
- portais consistentes;
- onboarding mais rápido de novos hotéis.

### Custos

- necessidade de governança editorial;
- migração gradual de hardcodes e planilhas;
- criação de APIs e perfis de acesso;
- disciplina para não criar atalhos duplicados.

