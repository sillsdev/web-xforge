import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const PORT = Number(process.env.MOCK_PORT ?? 5100);
/** Public base URL of this process. Every issued token's iss must be derived from this. */
export const BASE_URL = process.env.MOCK_BASE_URL ?? `http://localhost:${PORT}`;

/** Must byte-match the Auth:Domain-derived authority in appsettings.Mock.json (trailing slash). */
export const AUTH0_ISSUER = `${BASE_URL}/auth0/`;
export const REGISTRY_ISSUER = `${BASE_URL}/registry/`;

/**
 * HTTPS listener. Serval's ApiServer builds its Auth0 authority as "https://{Auth:Domain}/"
 * (scheme hardcoded), so the fake Auth0 must also be reachable over TLS for local Serval to
 * validate SF's tokens. The self-signed certificate lives in the data dir; point Serval's
 * process at it with SSL_CERT_FILE.
 */
export const TLS_PORT = Number(process.env.MOCK_TLS_PORT ?? 5101);
export const TLS_BASE_URL = process.env.MOCK_TLS_BASE_URL ?? `https://localhost:${TLS_PORT}`;
/** Issuer of tokens minted for Serval; must byte-match Serval's Auth:Domain-derived authority. */
export const AUTH0_TLS_ISSUER = `${TLS_BASE_URL}/auth0/`;

/** Serval client-credentials client (SF's Serval:ClientId/Secret in appsettings.Mock.json). */
export const SERVAL_AUDIENCE = 'https://serval-api.org/';
export const SERVAL_CLIENT_ID = 'sf-mock-serval-client';
export const SERVAL_CLIENT_SECRET = 'sf-mock-serval-secret';
/** All scopes Serval's API policies check (Serval Scopes.All). */
export const SERVAL_SCOPE = [
  'create:translation_engines',
  'read:translation_engines',
  'update:translation_engines',
  'delete:translation_engines',
  'create:word_alignment_engines',
  'read:word_alignment_engines',
  'update:word_alignment_engines',
  'delete:word_alignment_engines',
  'create:hooks',
  'read:hooks',
  'delete:hooks',
  'create:files',
  'read:files',
  'update:files',
  'delete:files',
  'read:status'
].join(' ');

export const AUDIENCE = 'https://scriptureforge.org/';
export const MANAGEMENT_AUDIENCE = `${BASE_URL}/auth0/api/v2/`;
export const FRONTEND_CLIENT_ID = 'sf-mock-frontend-client';
export const BACKEND_CLIENT_ID = 'sf-mock-backend-client';
export const BACKEND_CLIENT_SECRET = 'sf-mock-backend-secret';
/** Scope granted on user logins; sf_data is required by the SF backend and realtime server. */
export const USER_SCOPE = 'openid profile email sf_data offline_access';

/** Short-lived so that refresh paths actually get exercised during development. */
export const ACCESS_TOKEN_TTL_SECONDS = Number(process.env.MOCK_TOKEN_TTL ?? 600);
/** Grace period during which a rotated (superseded) refresh token is still accepted. */
export const REFRESH_ROTATION_GRACE_SECONDS = 60;

export const DATA_DIR = process.env.MOCK_DATA_DIR ?? path.join(packageRoot, '.data');
export const REPOS_DIR = path.join(DATA_DIR, 'repos');
export const RESOURCES_DIR = path.join(DATA_DIR, 'resources');

export const HG_EXE = process.env.MOCK_HG_EXE ?? 'hg';
