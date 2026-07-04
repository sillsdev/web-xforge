import express from 'express';
import fs from 'node:fs';
import https from 'node:https';
import { BASE_URL, DATA_DIR, PORT, REPOS_DIR, RESOURCES_DIR, TLS_BASE_URL, TLS_PORT } from './config.js';
import { loadOrCreateTlsCert } from './keys.js';
import { chaosFor } from './chaos.js';
import { state } from './state.js';
import { applySeed } from './seeds/index.js';
import { auth0Router } from './auth0/router.js';
import { registryRouter } from './registry/router.js';
import { archivesRouter } from './archives/router.js';
import { dblRouter } from './dbl/router.js';
import { controlRouter } from './control/router.js';

for (const dir of [DATA_DIR, REPOS_DIR, RESOURCES_DIR]) fs.mkdirSync(dir, { recursive: true });

const app = express();
app.set('query parser', 'simple');

app.use((req, res, next) => {
  if (process.env.MOCK_QUIET !== 'true') {
    res.on('finish', () => console.log(`[mock] ${res.statusCode} ${req.method} ${req.originalUrl}`));
  }
  next();
});

// The browser calls the fake Auth0 (and control API in tests) cross-origin from the app's
// origin; real Auth0 serves CORS headers, so the mock must too. auth0-spa-js sends an
// Auth0-Client header, which forces a preflight.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', (req.headers['access-control-request-headers'] as string) ?? '*');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.status(204).end();
    return;
  }
  next();
});

app.use('/auth0', chaosFor('auth0'), auth0Router);
app.use('/registry', chaosFor('registry'), registryRouter);
app.use('/archives/send_receive_server/api94', chaosFor('archives'), archivesRouter);
app.use('/dbl', chaosFor('dbl'), dblRouter);
app.use('/_control', controlRouter);

app.get('/', (_req, res) => {
  res.json({
    name: 'sf-mock-services',
    services: {
      auth0: `${BASE_URL}/auth0`,
      registry: `${BASE_URL}/registry/api8`,
      archives: `${BASE_URL}/archives/send_receive_server/api94`,
      dbl: `${BASE_URL}/dbl`,
      control: `${BASE_URL}/_control`
    },
    seed: state.seedName ?? null
  });
});

if (!state.load()) {
  console.log('[mock] no snapshot found; applying default seed');
  await applySeed('default');
}

app.listen(PORT, () => {
  console.log(`[mock] sf-mock-services listening on ${BASE_URL} (seed: ${state.seedName})`);
});

// HTTPS listener for clients that require a TLS authority (a local Serval validates SF's tokens
// against https://…/auth0/). Self-signed: point such clients at the cert via SSL_CERT_FILE.
const tls = loadOrCreateTlsCert();
https.createServer({ cert: tls.cert, key: tls.key }, app).listen(TLS_PORT, () => {
  console.log(`[mock] TLS listener on ${TLS_BASE_URL} (cert: ${tls.certPath})`);
});
