import crypto from 'node:crypto';
import express, { Router } from 'express';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUDIENCE,
  AUTH0_ISSUER,
  BACKEND_CLIENT_ID,
  BACKEND_CLIENT_SECRET,
  MANAGEMENT_AUDIENCE,
  REFRESH_ROTATION_GRACE_SECONDS,
  USER_SCOPE
} from '../config.js';
import { bearerToken, signJwt, verifyJwt } from '../jwt.js';
import { jwks } from '../keys.js';
import { mintPtAccessToken, mintPtRefreshToken } from '../pt-tokens.js';
import { state } from '../state.js';
import { createUser } from '../control/ops-users.js';
import type { MockUser } from '../types.js';

/**
 * Fake Auth0 (spec §5.1). Serves exactly the surface SF exercises:
 * auth0-spa-js v2 (authorize + oauth/token + v2/logout; no discovery, no signature checks),
 * ASP.NET JwtBearer (discovery + JWKS), and the Auth0 Management API used by the backend.
 * Endpoint shapes: Auth0 public docs + SF code inspection; see README for known deviations.
 */
export const auth0Router = Router();

auth0Router.use(express.json());
auth0Router.use(express.urlencoded({ extended: true }));

const CUSTOM_CLAIM_USER_ID = 'http://xforge.org/userid';
const CUSTOM_CLAIM_ROLE = 'http://xforge.org/role';

auth0Router.get('/.well-known/openid-configuration', (_req, res) => {
  res.json({
    issuer: AUTH0_ISSUER,
    authorization_endpoint: `${AUTH0_ISSUER}authorize`,
    token_endpoint: `${AUTH0_ISSUER}oauth/token`,
    userinfo_endpoint: `${AUTH0_ISSUER}userinfo`,
    jwks_uri: `${AUTH0_ISSUER}.well-known/jwks.json`,
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    scopes_supported: USER_SCOPE.split(' '),
    grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials', 'password']
  });
});

auth0Router.get('/.well-known/jwks.json', (_req, res) => {
  res.json(jwks());
});

function xfUserId(user: MockUser): string | undefined {
  return user.xfUserId ?? (user.userMetadata['xf_user_id'] as string | undefined);
}

function mintUserTokens(
  user: MockUser,
  options: { clientId: string; scope: string; audience: string; nonce?: string }
): Record<string, unknown> {
  const accessClaims: Record<string, unknown> = {
    azp: options.clientId,
    scope: options.scope
  };
  if (xfUserId(user) !== undefined) accessClaims[CUSTOM_CLAIM_USER_ID] = xfUserId(user);
  if (user.sfRole !== undefined) accessClaims[CUSTOM_CLAIM_ROLE] = user.sfRole;
  const accessToken = signJwt(accessClaims, {
    issuer: AUTH0_ISSUER,
    audience: [options.audience, `${AUTH0_ISSUER}userinfo`],
    subject: user.authId,
    expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS
  });

  const idClaims: Record<string, unknown> = {
    email: user.email,
    email_verified: true,
    name: user.name,
    nickname: user.name,
    picture: user.picture,
    updated_at: new Date().toISOString()
  };
  if (options.nonce !== undefined) idClaims.nonce = options.nonce;
  if (xfUserId(user) !== undefined) idClaims[CUSTOM_CLAIM_USER_ID] = xfUserId(user);
  if (user.sfRole !== undefined) idClaims[CUSTOM_CLAIM_ROLE] = user.sfRole;
  const idToken = signJwt(idClaims, {
    issuer: AUTH0_ISSUER,
    audience: options.clientId,
    subject: user.authId,
    expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS
  });

  const response: Record<string, unknown> = {
    access_token: accessToken,
    id_token: idToken,
    scope: options.scope,
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    token_type: 'Bearer'
  };
  if (options.scope.includes('offline_access')) {
    const refreshToken = `atr_${crypto.randomBytes(24).toString('base64url')}`;
    state.refreshTokens.set(refreshToken, {
      token: refreshToken,
      kind: 'auth0',
      authId: user.authId,
      clientId: options.clientId,
      revoked: false,
      createdAtMs: Date.now()
    });
    state.save();
    response.refresh_token = refreshToken;
  }
  return response;
}

// ---------------------------------------------------------------------------
// Authorization code + PKCE

auth0Router.get('/authorize', (req, res) => {
  const query = req.query as Record<string, string | undefined>;
  const redirectUri = query.redirect_uri;
  if (query.response_type !== 'code' || redirectUri === undefined || query.client_id === undefined) {
    res.status(400).send('mock auth0: /authorize requires response_type=code, client_id, redirect_uri');
    return;
  }

  // login_hint selects a seeded user (email or authId) for headless logins. SF also sends
  // login_hint carrying the UI locale (e.g. "en"), so an unmatched hint falls through to the
  // next-login designation or the interactive picker rather than erroring.
  let user: MockUser | undefined;
  const loginHint = query.login_hint;
  if (loginHint !== undefined) {
    user = state.findUserByEmail(loginHint) ?? state.users.get(loginHint);
  }
  if (user === undefined && state.nextLoginAuthId !== undefined) {
    user = state.users.get(state.nextLoginAuthId);
    state.nextLoginAuthId = undefined;
  }

  if (user === undefined) {
    res.type('html').send(interactiveLoginPage(req));
    return;
  }

  const code = `code_${crypto.randomBytes(16).toString('base64url')}`;
  state.authCodes.set(code, {
    code,
    authId: user.authId,
    clientId: query.client_id,
    redirectUri,
    scope: query.scope ?? USER_SCOPE,
    audience: query.audience,
    nonce: query.nonce,
    codeChallenge: query.code_challenge,
    expiresAtMs: Date.now() + 60_000
  });

  const location = new URL(redirectUri);
  location.searchParams.set('code', code);
  if (query.state !== undefined) location.searchParams.set('state', query.state);
  res.redirect(302, location.toString());
});

/** Minimal HTML user picker for manual development; no passwords in the mock world. */
function interactiveLoginPage(req: express.Request): string {
  const signUp = (req.query as Record<string, string>).screen_hint === 'signup';
  const rows = [...state.users.values()]
    .map(user => {
      const url = new URL(`${AUTH0_ISSUER}authorize`);
      for (const [key, value] of Object.entries(req.query)) url.searchParams.set(key, String(value));
      url.searchParams.set('login_hint', user.email);
      return `<li><a href="${url.pathname}?${url.searchParams.toString()}">${user.name}</a> <code>${user.email}</code>${user.paratext ? ' — Paratext: ' + user.paratext.ptUsername : ''}</li>`;
    })
    .join('\n');
  return `<!doctype html><html><head><title>Mock Auth0</title></head><body>
<h1>Mock Auth0 — ${signUp ? 'sign up' : 'log in'} as…</h1>
<ul>${rows}</ul>
<p>Users are defined by the mock seed / control API (<code>/_control/users</code>).</p>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Token endpoint

auth0Router.post('/oauth/token', (req, res) => {
  const body = req.body as Record<string, string | undefined>;
  const fail = (status: number, error: string, description: string): void => {
    res.status(status).json({ error, error_description: description });
  };

  switch (body.grant_type) {
    case 'authorization_code': {
      const record = body.code === undefined ? undefined : state.authCodes.get(body.code);
      if (record === undefined || record.expiresAtMs < Date.now()) {
        return fail(403, 'invalid_grant', 'Invalid or expired authorization code');
      }
      state.authCodes.delete(record.code);
      if (record.codeChallenge !== undefined) {
        const verifier = body.code_verifier ?? '';
        const computed = crypto.createHash('sha256').update(verifier).digest('base64url');
        if (computed !== record.codeChallenge) {
          return fail(403, 'invalid_grant', 'Failed PKCE verification');
        }
      }
      const user = state.users.get(record.authId);
      if (user === undefined) return fail(403, 'invalid_grant', 'User no longer exists');
      return void res.json(
        mintUserTokens(user, {
          clientId: record.clientId,
          scope: record.scope,
          audience: record.audience ?? AUDIENCE,
          nonce: record.nonce
        })
      );
    }

    case 'refresh_token': {
      const record = body.refresh_token === undefined ? undefined : state.refreshTokens.get(body.refresh_token);
      if (record === undefined || record.kind !== 'auth0' || record.revoked) {
        return fail(403, 'invalid_grant', 'Unknown or revoked refresh token');
      }
      if (
        record.supersededAtMs !== undefined &&
        Date.now() - record.supersededAtMs > REFRESH_ROTATION_GRACE_SECONDS * 1000
      ) {
        return fail(403, 'invalid_grant', 'Refresh token has been rotated');
      }
      const user = state.users.get(record.authId);
      if (user === undefined) return fail(403, 'invalid_grant', 'User no longer exists');
      record.supersededAtMs ??= Date.now();
      state.save();
      return void res.json(
        mintUserTokens(user, {
          clientId: record.clientId ?? String(body.client_id),
          scope: USER_SCOPE,
          audience: AUDIENCE
        })
      );
    }

    case 'client_credentials': {
      if (body.client_id !== BACKEND_CLIENT_ID || body.client_secret !== BACKEND_CLIENT_SECRET) {
        return fail(401, 'access_denied', 'Unknown client or bad secret');
      }
      if (body.audience !== MANAGEMENT_AUDIENCE) {
        return fail(403, 'access_denied', `Unexpected audience ${body.audience}`);
      }
      const accessToken = signJwt(
        { azp: body.client_id, scope: 'read:users update:users create:users', gty: 'client-credentials' },
        {
          issuer: AUTH0_ISSUER,
          audience: MANAGEMENT_AUDIENCE,
          subject: `${body.client_id}@clients`,
          expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS
        }
      );
      return void res.json({ access_token: accessToken, expires_in: ACCESS_TOKEN_TTL_SECONDS, token_type: 'Bearer' });
    }

    case 'http://auth0.com/oauth/grant-type/password-realm': {
      if (body.realm !== 'Transparent-Authentication') {
        return fail(403, 'invalid_grant', `Unsupported realm ${body.realm}`);
      }
      let user = [...state.users.values()].find(u => u.username === body.username);
      if (user === undefined) {
        // Auto-provision like the real connection: normally the backend creates the user via the
        // management API first, but tolerate direct logins too.
        user = createUser({
          name: String(body.username),
          email: `${body.username}@users.noreply.scriptureforge.org`,
          username: body.username,
          password: body.password,
          connection: 'Transparent-Authentication'
        });
      } else if (user.password !== body.password) {
        return fail(403, 'invalid_grant', 'Wrong username or password');
      }
      return void res.json(
        mintUserTokens(user, {
          clientId: String(body.client_id),
          scope: body.scope ?? USER_SCOPE,
          audience: body.audience ?? AUDIENCE
        })
      );
    }

    default:
      return fail(400, 'unsupported_grant_type', `Unsupported grant_type ${body.grant_type}`);
  }
});

auth0Router.get('/v2/logout', (req, res) => {
  const returnTo = (req.query as Record<string, string | undefined>).returnTo;
  res.redirect(302, returnTo ?? '/');
});

// ---------------------------------------------------------------------------
// Management API v2

function requireManagementToken(req: express.Request, res: express.Response): boolean {
  const payload = verifyJwt(bearerToken(req.headers.authorization) ?? '');
  const audience = payload?.aud;
  const ok =
    payload !== undefined &&
    (Array.isArray(audience) ? audience.includes(MANAGEMENT_AUDIENCE) : audience === MANAGEMENT_AUDIENCE);
  if (!ok) res.status(401).json({ statusCode: 401, error: 'Unauthorized', message: 'Invalid token' });
  return ok;
}

/**
 * Management API user profile. The identities[] entry for a linked Paratext account carries
 * live PT access/refresh tokens — this is how the SF backend obtains PT tokens today.
 * TODO(fidelity): mirror a captured real Management API response field-for-field (spec §7).
 */
function managementProfile(user: MockUser): Record<string, unknown> {
  const [provider, ...rest] = user.authId.split('|');
  const identities: Record<string, unknown>[] = [
    {
      connection: user.connection,
      provider,
      user_id: rest.join('|'),
      isSocial: user.connection === 'paratext'
    }
  ];
  if (user.paratext !== undefined) {
    const ptIdentity = identities.find(i => i.connection === 'paratext') ?? {};
    Object.assign(ptIdentity, {
      connection: 'paratext',
      provider: 'oauth2',
      // Real Auth0 prefixes oauth2 identity user_ids with the connection name; SF's
      // UserService.GetIdpIdFromAuthId splits on '|' to recover the PT user id.
      user_id: `paratext|${user.paratext.ptUserId}`,
      isSocial: true,
      access_token: mintPtAccessToken(user.paratext),
      refresh_token: mintPtRefreshToken(user)
    });
    if (!identities.includes(ptIdentity)) identities.push(ptIdentity);
  }
  return {
    user_id: user.authId,
    email: user.email,
    email_verified: true,
    name: user.name,
    nickname: user.name,
    picture: user.picture,
    identities,
    user_metadata: user.userMetadata,
    app_metadata: {
      ...(xfUserId(user) !== undefined ? { xf_user_id: xfUserId(user) } : {}),
      ...(user.sfRole !== undefined ? { xf_role: user.sfRole } : {})
    },
    created_at: new Date(0).toISOString(),
    updated_at: new Date().toISOString()
  };
}

auth0Router.get('/api/v2/users/:authId', (req, res) => {
  if (!requireManagementToken(req, res)) return;
  const user = state.users.get(req.params.authId);
  if (user === undefined) {
    res.status(404).json({ statusCode: 404, error: 'Not Found', message: 'The user does not exist.' });
    return;
  }
  res.json(managementProfile(user));
});

auth0Router.patch('/api/v2/users/:authId', (req, res) => {
  if (!requireManagementToken(req, res)) return;
  const user = state.users.get(req.params.authId);
  if (user === undefined) {
    res.status(404).json({ statusCode: 404, error: 'Not Found', message: 'The user does not exist.' });
    return;
  }
  const body = req.body as Record<string, unknown>;
  if (typeof body.user_metadata === 'object' && body.user_metadata !== null) {
    Object.assign(user.userMetadata, body.user_metadata);
    const metaUserId = (body.user_metadata as Record<string, unknown>)['xf_user_id'];
    if (typeof metaUserId === 'string') user.xfUserId = metaUserId;
  }
  if (typeof body.app_metadata === 'object' && body.app_metadata !== null) {
    const metaUserId = (body.app_metadata as Record<string, unknown>)['xf_user_id'];
    if (typeof metaUserId === 'string') user.xfUserId = metaUserId;
  }
  state.save();
  res.json(managementProfile(user));
});

auth0Router.post('/api/v2/users', (req, res) => {
  if (!requireManagementToken(req, res)) return;
  const body = req.body as Record<string, unknown>;
  try {
    const user = createUser({
      name: String(body.name ?? body.username ?? 'Anonymous'),
      email: String(body.email ?? `${body.username}@users.noreply.scriptureforge.org`),
      username: body.username === undefined ? undefined : String(body.username),
      password: body.password === undefined ? undefined : String(body.password),
      connection: 'Transparent-Authentication'
    });
    if (typeof body.user_metadata === 'object' && body.user_metadata !== null) {
      Object.assign(user.userMetadata, body.user_metadata);
      state.save();
    }
    res.status(201).json(managementProfile(user));
  } catch (error) {
    res.status(409).json({ statusCode: 409, error: 'Conflict', message: String(error) });
  }
});
