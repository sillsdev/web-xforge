import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const PORT = Number(process.env.MOCK_PORT ?? 5100);
/** Public base URL of this process. Every issued token's iss must be derived from this. */
export const BASE_URL = process.env.MOCK_BASE_URL ?? `http://localhost:${PORT}`;

/** Must byte-match the Auth:Domain-derived authority in appsettings.Mock.json (trailing slash). */
export const AUTH0_ISSUER = `${BASE_URL}/auth0/`;
export const REGISTRY_ISSUER = `${BASE_URL}/registry/`;

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
