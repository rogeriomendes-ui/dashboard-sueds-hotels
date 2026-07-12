# Arquitetura do Ecossistema Sueds Hotels

## Objetivos

- suportar dezenas de hotéis sem duplicar conteúdo;
- separar dados operacionais, conhecimento e apresentação;
- permitir que interfaces e agentes de IA consumam a mesma fonte;
- manter histórico, auditoria, vigência e controle de acesso;
- integrar novas fontes sem refatorar todos os módulos.

## Camadas

### 1. Fontes

Sistemas que originam dados ou conteúdo:

- Google Sheets;
- KPIFull;
- Asksuite;
- Omnibees;
- GA4;
- Google Ads;
- Meta Ads;
- Vetor Trade;
- Niara;
- Google Drive;
- cadastro editorial da Central de Conhecimento.

### 2. Ingestão e normalização

Cada conector converte dados externos em contratos canônicos. Nesta camada ficam:

- autenticação;
- paginação e limites de API;
- de-para de hotéis, canais e pessoas;
- deduplicação;
- validação;
- data de captura;
- rastreabilidade da origem;
- filas de erro e reprocessamento.

### 3. Núcleo canônico

O núcleo mantém entidades reutilizáveis:

- organizações e marcas;
- propriedades/hotéis;
- pessoas, equipes e perfis;
- produtos e experiências;
- documentos de conhecimento;
- versões, tags e relações;
- métricas e snapshots;
- ativos de mídia;
- permissões e auditoria.

O identificador interno deve ser estável. Nomes visíveis podem mudar sem quebrar relações.

### 4. Serviços

Serviços expõem contratos para consumidores:

- API de conhecimento;
- busca global;
- API de métricas;
- serviço de publicação por canal;
- serviço de permissões;
- serviço de auditoria;
- serviço de IA e recuperação semântica;
- notificações e automações.

### 5. Experiências

- Dashboard Executivo;
- Comercial e Central de Reservas;
- Inteligência Comercial;
- Marketing e Redes Sociais;
- Operacional;
- Revenue Management;
- Academia Sueds;
- Portal do Agente;
- Portal do Colaborador;
- Sueli e demais agentes de IA.

## Multi-hotel

Toda entidade deve possuir escopo explícito:

- `global`: válido para toda a rede;
- `brand`: válido para uma marca;
- `property`: válido para um hotel;
- `department`: válido para uma área;
- `audience`: válido para um público.

Conteúdo global pode ser complementado por uma propriedade, mas não copiado. A resolução combina o conteúdo global com a exceção local vigente.

## Contrato de conteúdo

Todo conteúdo publicado possui:

- ID estável;
- slug único no escopo;
- módulo e tipo;
- título e resumo;
- corpo em Markdown;
- escopo;
- visibilidade;
- proprietário;
- status editorial;
- início e fim de vigência;
- versão;
- tags;
- relações com hotéis, produtos e outros conteúdos;
- origem e data da última revisão.

## Busca e IA

A busca global deve indexar título, resumo, corpo, tags e entidades relacionadas. A futura busca semântica deve usar fragmentos derivados da versão publicada, sempre preservando referência ao documento e à versão de origem.

Respostas de IA devem retornar evidências e nunca usar versões em rascunho ou expiradas, salvo em ambiente administrativo autorizado.

## Permissões

Perfis iniciais:

- administrador do Ecossistema;
- gestor corporativo;
- gestor de hotel;
- editor de conteúdo;
- revisor/aprovador;
- colaborador;
- agente/parceiro;
- TV;
- conta de serviço.

O acesso deve considerar papel, hotel, departamento, audiência e classificação do conteúdo.

## Migração dos módulos atuais

Os endpoints atuais permanecem ativos. A migração será incremental:

1. catalogar fontes e proprietários;
2. normalizar IDs e de-para;
3. criar conteúdo canônico;
4. trocar hardcodes por consultas ao núcleo;
5. validar consumidores;
6. remover a fonte antiga somente após reconciliação.

