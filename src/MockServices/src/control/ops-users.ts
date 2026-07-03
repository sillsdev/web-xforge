import crypto from 'node:crypto';
import { state } from '../state.js';
import type { MockUser, PtIdentity } from '../types.js';

export interface CreateUserSpec {
  email: string;
  name: string;
  authId?: string;
  connection?: MockUser['connection'];
  username?: string;
  password?: string;
  sfRole?: string;
  xfUserId?: string;
  picture?: string;
  /** Linking a Paratext identity makes the user able to connect/sync PT projects. */
  paratext?: Partial<PtIdentity> & { ptUsername: string };
}

let userCounter = 0;

export function createUser(spec: CreateUserSpec): MockUser {
  userCounter += 1;
  const connection = spec.connection ?? (spec.paratext ? 'paratext' : 'Username-Password-Authentication');
  const prefix = connection === 'paratext' ? 'oauth2|paratext' : 'auth0';
  const authId = spec.authId ?? `${prefix}|${crypto.randomBytes(12).toString('hex')}`;
  if (state.users.has(authId)) throw new Error(`user ${authId} already exists`);
  const user: MockUser = {
    authId,
    email: spec.email,
    name: spec.name,
    connection,
    username: spec.username,
    password: spec.password,
    sfRole: spec.sfRole,
    // The SF user id. In production an Auth0 Action assigns xf_user_id before the token reaches
    // SF; the backend reads it from the http://xforge.org/userid claim and uses it as the user's
    // realtime document id. Must always be present and non-empty — an empty id makes the ShareDB
    // fetch hang. Generate one (24-hex, ObjectId-like) when the caller doesn't supply it.
    xfUserId: spec.xfUserId ?? crypto.randomBytes(12).toString('hex'),
    picture: spec.picture ?? `https://cdn.auth0.com/avatars/${(spec.name[0] ?? 'u').toLowerCase()}.png`,
    userMetadata: {},
    paratext: spec.paratext
      ? {
          ptUserId: spec.paratext.ptUserId ?? crypto.randomBytes(8).toString('hex'),
          ptUsername: spec.paratext.ptUsername
        }
      : undefined
  };
  state.users.set(authId, user);
  state.save();
  return user;
}
