# Observatório de Turismo no Portal Sueds

Módulo Comercial → Observatório de Turismo, integrado ao Portal existente. A primeira versão reúne movimentação aeroportuária, importação de dados públicos, calendário administrável e exportações. Usa o projeto Supabase **SUEDS** (`pjcmjytiovuukbkewxjj`), sem criar projeto, plano, bucket ou agendamento.

## Estado desta entrega

- Implementação em `codex/observatorio-turismo`, baseada em `origin/main` (`f6e1086`).
- Publicação, commit/push e aplicação das tabelas autorizados pelo usuário em 27/10/2026. Destino: projeto Vercel `dashboard-sueds-hotels`, domínio `portal.suedshotels.com.br`.
- Carga real: janeiro a julho de 2025, conforme [estatísticas do aeroporto](https://www.portoseguro-aero.com.br/estatisticas/), consultadas em 27/10/2026. Conferência: 1.489.813 movimentos de passageiros e 10.362 pousos/decolagens. Os demais meses da tabela estão vazios.
- ANAC: conversor local de etapas básicas pronto; carga oficial ainda não importada.
- SETUR, turismo internacional e Cadastur: contratos validados e telas disponíveis; cargas ainda pendentes de preparação e revisão das fontes. As telas vazias indicam a ausência, sem valores simulados.
- Calendário: inclusão e edição por administrador; não contém feriados ou eventos presumidos. Cadastro factual depende de fontes oficiais/organizadores.
- Sem integração ou alteração no Vetor Trade. Tarifas, KPIFull/PMS, mapas geográficos e alertas comerciais permanecem fora desta primeira versão.
- Migração `20261028021929_add_observatory_phase1` aplicada no Supabase SUEDS. Gravação, atualização, auditoria e idempotência validadas em transação revertida. As três tabelas têm RLS ativa, sem leitura direta por `anon`/`authenticated`; todos os registros de teste foram revertidos.

## Arquivos e navegação

| Arquivo | Função |
| --- | --- |
| `public/dashboard-gestores.html` | Item do menu Comercial |
| `public/portal-shell.js` | Registro do módulo e carregamento no iframe existente |
| `lib/portal-auth.js` | Ambiente `observatorio_turismo` e página inicial para usuários com esse acesso |
| `public/observatorio-turismo.html`, `.css`, `.js` | Interface responsiva |
| `api/portal/observatorio.js` | API autenticada, gravação administrativa e exportação |
| `lib/observatory.js` | Contratos, validação, filtros, comparativos e exportação |
| `lib/observatory-store.js` | Persistência limitada no Supabase existente |
| `lib/observatory-airport.js` | Consulta exclusiva à URL oficial do aeroporto, com timeout e limite de tamanho |
| `data/observatory-airport.json` | Carga oficial inicial, com origem e data de consulta |
| `tools/prepare_observatory_anac.cjs` | Conversão local de CSV ANAC para agregados SBPS |
| `supabase/20261028021929_add_observatory_phase1.sql` | Migração aplicada: tabelas, auditoria e registro do ambiente |
| `tools/test_observatory.cjs` | Testes de domínio, conector, acesso e exportação |

Rotas: `/gestores?modulo=observatorio_turismo`, `/observatorio-turismo.html` e `/api/portal/observatorio`.

## Acesso e armazenamento

A autenticação permanece em `getPortalProfile`. Leitura requer `observatorio_turismo`; administradores gerais seguem o comportamento existente do Portal. Escrita requer `admin_geral`, origem da requisição igual ao host e JSON. O SQL não concede acesso a usuários automaticamente: a administração atual de Usuários e Acessos permite atribuir o ambiente após a publicação.

As três tabelas novas têm RLS ativa e não concedem acesso a `anon` ou `authenticated`. A API de servidor usa a credencial já existente (`SUPABASE_SECRET_KEY` ou `SUPABASE_SERVICE_ROLE_KEY`) e a URL de `supabaseConfig()`. Nenhuma credencial vai ao navegador. Não há exclusão de eventos: atualizar para cancelado preserva o histórico.

- `observatory_datasets`: até cinco fontes, cada uma com a versão atual completa, limitada a 5.000 linhas/2 MB. A substituição exige confirmação explícita no formulário. O hash evita regravar cargas idênticas.
- `observatory_events`: calendário; validação de datas, situação, localidade e URL. Consulta limitada a 1.000 eventos; acima disso a API sinaliza indisponibilidade em vez de apresentar um calendário truncado como completo.
- `observatory_audit`: alterações de eventos, hash anterior/novo das fontes, contagens, autor e falhas. Auditoria e gravação acontecem na mesma transação por triggers. Não replica todas as versões dos datasets.

Sem base disponível, a API identifica a falha, desabilita edição e mostra somente a carga oficial incluída no módulo. Não representa a fonte inicial como atualizada automaticamente. Sem novas assinaturas ou serviços; o uso continua sujeito às franquias dos planos existentes. A sincronização é manual e não cria cobrança de serviço externo. Antes de publicar, conferir a margem de armazenamento e tráfego existente.

## Regras dos indicadores

- Fontes aeroportuária e ANAC nunca são somadas entre si.
- Aeroporto: passageiros = embarques com conexões/isentos + desembarques; movimentos = pousos + decolagens. Não são turistas únicos.
- ANAC: etapas básicas regulares/não regulares envolvendo SBPS, passageiros pagos + grátis. Não misturar etapas combinadas. Rotas de origem consideram somente etapas cujo destino é SBPS.
- Comparação anual usa o mesmo mês e a mesma fonte. Denominador zero ou qualquer mês ausente gera “Não comparável”. Meses vazios não viram zero.
- Turismo: cada linha mantém território, unidade, método, mercado e conceito do mercado; pesquisas distintas não são agregadas automaticamente.
- Cadastur: posição do cadastro, independente do filtro mensal. Não implica ocupação ou preço.
- Eventos nacionais também aparecem nos recortes locais; eventos estaduais aparecem nos municípios da Bahia. Eventos que cruzam meses são incluídos por sobreposição de datas.
- Exportações respeitam os filtros e incluem fonte, data de consulta e metodologia. CSV neutraliza prefixos de fórmulas; Excel usa células de texto para valores textuais.

## Atualização de fontes

Aeroporto: botão administrativo consulta exclusivamente `https://www.portoseguro-aero.com.br/estatisticas/`, sem URL arbitrária. Timeout de 15 segundos e HTML de até 2 MB. Alteração de formato ou valores inconsistentes impede a gravação. A atualização mantém meses anteriores não presentes na página nova; correções de meses presentes substituem os valores anteriores. Isso não detecta uma retirada editorial de mês antigo: nesses casos revisar e importar a série completa. Última atualização bem-sucedida limita novas consultas a uma por hora.

Demais fontes: importar arquivo JSON revisado em Fontes e atualizações. O arquivo deve conter `sourceId`, `sourceUrl` HTTPS, `retrievedAt` (AAAA-MM-DD), `notes` e `rows`. A carga substitui integralmente aquela fonte; inclua todo o histórico que deve permanecer disponível. Não preencher campos ausentes com zero. Cada linha admite `observedAt` (AAAA-MM-DD), preservado nas atualizações incrementais do aeroporto e na exportação; quando ausente, recebe `retrievedAt` da carga.

| Fonte | Campos por linha |
| --- | --- |
| `airport` | `period` AAAA-MM, `arrivals`, `departures`, `boardings`, `landings`, `passengers` |
| `anac` | `period`, `origin`, `destination` (ICAO), `originName`, `destinationName`, `airline`, `nature` (Doméstica/Internacional), `passengers`, `seats` (número ou null), `flights` |
| `setur`, `international` | `period`, `region`, `indicator`, `value`, `unit` (pessoas/%/R$/dias), `method` (medida/pesquisa pontual/estimativa), `methodology`, `market`, `marketType` (residência/origem da viagem/não informado) |
| `cadastur` | `externalId`, `name`, `region`, `locality`, `status`, `registeredAt` AAAA-MM-DD (data de referência do cadastro) |

Territórios aceitos: Porto Seguro, Santa Cruz Cabrália, Costa do Descobrimento, Bahia e Brasil. O cadastro de hotéis aceita os três primeiros. País de residência pertence ao campo `market`; nunca usar país como se fosse o território medido.

Para preparar ANAC sem consumir memória com o arquivo nacional inteiro:

```powershell
node tools/prepare_observatory_anac.cjs --input etapas-basicas.csv --output anac-sbps.json --from 2024-01 --to 2025-12 --source-url "URL_HTTPS_DO_ARQUIVO_OFICIAL" --retrieved-at 2026-10-27 --encoding latin1
```

O conversor lê sequencialmente, mantém apenas SBPS, agrupa mês/rota/companhia/natureza, não sobrescreve arquivo de saída existente e não grava no banco. Usar a codificação do arquivo oficial (`utf8` ou `latin1`). Validar contagens e cobertura antes de importar. [Dicionário oficial ANAC](https://www.anac.gov.br/acesso-a-informacao/dados-abertos/areas-de-atuacao/voos-e-operacoes-aereas/dados-estatisticos-do-transporte-aereo/48-dados-estatisticos-do-transporte-aereo).

## Validação e publicação

Executar `node --test tools/test_observatory.cjs` com as dependências existentes do Portal. Nesta entrega, os 17 testes passaram; o conector foi validado com o HTML real do aeroporto, a exportação Excel foi aberta pelo ExcelJS e a interface foi verificada no Chrome, no menu real e em viewport de 390 px. O cadastro de evento no navegador foi testado somente em memória, fora do banco de produção.

Antes de publicar, após autorização específica para produção:

1. Conferir o diff isolado contra a referência atual de `origin/main`, preservando trabalhos de outras tarefas.
2. Confirmar no histórico do projeto SUEDS a migração `20261028021929_add_observatory_phase1`, já aplicada. Não executar novamente o arquivo SQL; ele registra a alteração realizada.
3. Validar em SQL as três tabelas, RLS e grants; conferir que anon/authenticated não leem nem escrevem diretamente e que as duas triggers de auditoria gravam atomicamente. Validar alteração de evento e importação idêntica com usuário autorizado.
4. Publicar somente o módulo e suas integrações de menu/API no projeto já existente, sem modificar o Vetor Trade ou os planos contratados.
5. Testar login, menu Comercial, acesso negado por API, leitura, calendário, atualização e exportação no endereço publicado. O novo ambiente não altera permissões de módulos antigos.

Se houver falha no módulo, restaurar os arquivos da publicação anterior pelo fluxo de deploy existente. Não apagar tabelas ou registros para reverter a interface. As tabelas novas são independentes dos dados de vendas e reservas.
