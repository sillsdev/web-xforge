import { execFileSync } from 'node:child_process';
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

const tlsCertPath = path.join(DATA_DIR, 'mock-tls-cert.pem');
const tlsKeyPath = path.join(DATA_DIR, 'mock-tls-key.pem');

/**
 * Self-signed localhost certificate for the HTTPS listener (generated with openssl on first
 * run). Clients that must trust it (e.g. a local Serval) point SSL_CERT_FILE at the cert file.
 */
export function loadOrCreateTlsCert(): { cert: string; key: string; certPath: string } {
  if (!fs.existsSync(tlsCertPath) || !fs.existsSync(tlsKeyPath)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    execFileSync('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-keyout',
      tlsKeyPath,
      '-out',
      tlsCertPath,
      '-days',
      '3650',
      '-nodes',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost,IP:127.0.0.1'
    ]);
    fs.chmodSync(tlsKeyPath, 0o600);
  }
  return {
    cert: fs.readFileSync(tlsCertPath, 'utf8'),
    key: fs.readFileSync(tlsKeyPath, 'utf8'),
    certPath: tlsCertPath
  };
}
