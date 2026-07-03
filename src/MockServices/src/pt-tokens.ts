import crypto from 'node:crypto';
import { ACCESS_TOKEN_TTL_SECONDS, REGISTRY_ISSUER } from './config.js';
import { signJwt, verifyJwt } from './jwt.js';
import { state } from './state.js';
import type { MockUser, PtIdentity } from './types.js';

export const PT_AUDIENCE = 'pt-registry';

/**
 * Mints a Paratext registry access token (the kind embedded in Auth0 identities[] and returned
 * by the registry's POST /api8/token). SF's JwtTokenHelper.GetParatextUsername reads the
 * username claim from this token directly.
 */
export function mintPtAccessToken(identity: PtIdentity): string {
  return signJwt(
    { username: identity.ptUsername },
    {
      issuer: REGISTRY_ISSUER,
      audience: PT_AUDIENCE,
      subject: identity.ptUserId,
      expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS
    }
  );
}

export function mintPtRefreshToken(user: MockUser): string {
  const token = `ptr_${crypto.randomBytes(24).toString('base64url')}`;
  state.refreshTokens.set(token, {
    token,
    kind: 'paratext',
    authId: user.authId,
    revoked: false,
    createdAtMs: Date.now()
  });
  return token;
}

/** Verifies a PT registry/archives Bearer JWT; returns the owning user, or undefined. */
export function verifyPtToken(token: string | undefined): MockUser | undefined {
  if (token === undefined) return undefined;
  const payload = verifyJwt(token);
  if (payload === undefined || payload.aud !== PT_AUDIENCE) return undefined;
  return state.findUserByPtUserId(String(payload.sub));
}
