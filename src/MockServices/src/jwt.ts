import jwt from 'jsonwebtoken';
import { KEY_ID, privateKeyPem, publicKeyPem } from './keys.js';

export interface SignOptions {
  issuer: string;
  audience: string | string[];
  subject: string;
  expiresInSeconds: number;
}

export function signJwt(claims: Record<string, unknown>, options: SignOptions): string {
  return jwt.sign(claims, privateKeyPem, {
    algorithm: 'RS256',
    keyid: KEY_ID,
    issuer: options.issuer,
    audience: options.audience,
    subject: options.subject,
    expiresIn: options.expiresInSeconds
  });
}

/** Returns the verified payload, or undefined if the token is invalid or expired. */
export function verifyJwt(token: string): jwt.JwtPayload | undefined {
  try {
    return jwt.verify(token, publicKeyPem, { algorithms: ['RS256'] }) as jwt.JwtPayload;
  } catch {
    return undefined;
  }
}

/** Extracts the Bearer token from an Authorization header value. */
export function bearerToken(authorizationHeader: string | undefined): string | undefined {
  if (authorizationHeader?.startsWith('Bearer ')) return authorizationHeader.slice('Bearer '.length);
  return undefined;
}
