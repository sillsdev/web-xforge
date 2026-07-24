import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';

export const KEY_ID = 'sf-mock-services-key-1';

const keyPath = path.join(DATA_DIR, 'mock-rsa-private-key.pem');

function loadOrCreatePrivateKey(): string {
  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, 'utf8');
  }
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(keyPath, pem, { mode: 0o600 });
  return pem;
}

/** One RS256 keypair signs everything: Auth0 tokens, PT registry tokens, management tokens. */
export const privateKeyPem: string = loadOrCreatePrivateKey();
export const publicKeyPem: string = crypto
  .createPublicKey(privateKeyPem)
  .export({ type: 'spki', format: 'pem' })
  .toString();

export function jwks(): { keys: object[] } {
  const jwk = crypto.createPublicKey(privateKeyPem).export({ format: 'jwk' }) as Record<string, string>;
  return { keys: [{ ...jwk, kid: KEY_ID, alg: 'RS256', use: 'sig' }] };
}
