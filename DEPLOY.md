# Publicacao da primeira versao

## Arquitetura da V1

- Vercel hospeda as paginas `dashboard-tv.html` e `dashboard-gestores.html`.
- Vercel executa a API em `/api/dashboard/tv` e `/api/dashboard/gestores`.
- Google Sheets segue como fonte principal de vendas offline e metas.
- Supabase fica preparado para historico/cache e controle de acesso nas proximas etapas.

## Variaveis de ambiente na Vercel

Configure em `Project Settings > Environment Variables`:

```text
GOOGLE_SHEET_ID=1Tcy3kerwSt8yrYTmQorAsHM4mUBQUKFGKcl1BLi4LW0
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
GOOGLE_BASE_RANGE=Base_Dashboard!A:Y
GOOGLE_METAS_RANGE=Metas!A:H
CACHE_TTL_SECONDS=60
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=COLE_A_SERVICE_ROLE_KEY_AQUI
```

Use `GOOGLE_SERVICE_ACCOUNT_JSON` na Vercel em vez de `GOOGLE_APPLICATION_CREDENTIALS`,
porque a Vercel nao tera acesso ao arquivo JSON salvo em `Downloads`.

## Supabase

1. Crie um projeto no Supabase.
2. Abra `SQL Editor`.
3. Execute o arquivo `supabase/schema.sql`.
4. Copie a `Project URL` para `SUPABASE_URL`.
5. Copie a `service_role key` para `SUPABASE_SERVICE_ROLE_KEY`.

Guarde a `service_role key` apenas em variaveis de ambiente do servidor.
Nao coloque essa chave no frontend, no GitHub ou na planilha.

## Vercel

1. Suba este projeto para um repositorio Git.
2. Importe o repositorio na Vercel.
3. Configure as variaveis de ambiente acima.
4. Faca o primeiro deploy.
5. Teste:
   - `/dashboard-tv.html`
   - `/dashboard-gestores.html`
   - `/api/health`
   - `/api/dashboard/tv`
   - `/api/dashboard/gestores`

## Observacao sobre seguranca

Na primeira versao, a API de gestores ainda fica acessivel por URL.
Antes de divulgar amplamente, o proximo passo recomendado e adicionar uma camada simples de acesso:

- TV: link sem valores de venda.
- Gestores: login ou token protegido.
