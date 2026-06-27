const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ADS_SCOPE = 'https://www.googleapis.com/auth/adwords';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    return {};
  }

  const raw = fs.readFileSync(envPath, 'utf8');
  const env = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value.replace(/\\n/g, '\n');
  }

  return env;
}

function required(env, key) {
  const value = process.env[key] || env[key];
  if (!value) {
    throw new Error(`Configure ${key} no arquivo .env antes de rodar este script.`);
  }
  return value;
}

async function exchangeCode({ clientId, clientSecret, redirectUri, code }) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(JSON.stringify(payload, null, 2));
  }

  return payload;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;

    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function printTokenResult(result) {
  if (!result.refresh_token) {
    console.log('\nAutorizacao feita, mas o Google nao retornou refresh_token.');
    console.log('Rode novamente e confirme que o parametro prompt=consent esta no link.');
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('\nRefresh token gerado com sucesso:\n');
  console.log(`GOOGLE_ADS_REFRESH_TOKEN=${result.refresh_token}`);
  console.log('\nInclua tambem estas variaveis no .env local e na Vercel:\n');
  console.log('GOOGLE_ADS_DEVELOPER_TOKEN=cole_o_token_da_central_da_api');
  console.log('GOOGLE_ADS_LOGIN_CUSTOMER_ID=4545711374');
  console.log('GOOGLE_ADS_CUSTOMER_ID=7300401572');
}

async function main() {
  const env = loadEnv();
  const clientId = required(env, 'GOOGLE_ADS_CLIENT_ID');
  const clientSecret = required(env, 'GOOGLE_ADS_CLIENT_SECRET');
  const args = parseArgs(process.argv);

  if (args.url) {
    const callbackUrl = new URL(args.url);
    const code = callbackUrl.searchParams.get('code');
    if (!code) {
      throw new Error('A URL informada nao contem o parametro code.');
    }

    const redirectUri = `${callbackUrl.origin}${callbackUrl.pathname}`;
    const tokenPayload = await exchangeCode({ clientId, clientSecret, redirectUri, code });
    printTokenResult(tokenPayload);
    return;
  }

  const state = crypto.randomBytes(16).toString('hex');

  const server = http.createServer();
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('Tempo esgotado aguardando autorizacao do Google.'));
    }, 10 * 60 * 1000);

    server.on('request', async (req, res) => {
      try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        if (url.pathname !== '/oauth2callback') {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const returnedState = url.searchParams.get('state');
        const error = url.searchParams.get('error');
        const code = url.searchParams.get('code');

        if (error) {
          throw new Error(`OAuth recusado: ${error}`);
        }
        if (returnedState !== state) {
          throw new Error('State OAuth invalido.');
        }
        if (!code) {
          throw new Error('Codigo OAuth nao recebido.');
        }

        const redirectUri = `http://127.0.0.1:${server.address().port}/oauth2callback`;
        const tokenPayload = await exchangeCode({ clientId, clientSecret, redirectUri, code });

        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end('<h1>Autorizacao concluida</h1><p>Pode voltar ao terminal do Codex/PowerShell.</p>');

        clearTimeout(timeout);
        server.close();
        resolve(tokenPayload);
      } catch (err) {
        clearTimeout(timeout);
        server.close();
        reject(err);
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
      const auth = new URL(AUTH_URL);
      auth.searchParams.set('client_id', clientId);
      auth.searchParams.set('redirect_uri', redirectUri);
      auth.searchParams.set('response_type', 'code');
      auth.searchParams.set('scope', ADS_SCOPE);
      auth.searchParams.set('access_type', 'offline');
      auth.searchParams.set('prompt', 'consent');
      auth.searchParams.set('state', state);

      console.log('\nAbra este link no navegador e autorize com o usuario que acessa o Google Ads:\n');
      console.log(auth.toString());
      console.log('\nAguardando retorno do Google...\n');
    });
  });

  printTokenResult(result);
}

main().catch((err) => {
  console.error('\nFalha ao gerar refresh token do Google Ads:');
  console.error(err.message);
  process.exitCode = 1;
});
