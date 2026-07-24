export type PtRole =
  | 'pt_administrator'
  | 'pt_consultant'
  | 'pt_translator'
  | 'pt_observer'
  | 'pt_read'
  | 'pt_write_note';

export interface PtIdentity {
  /** Paratext registry user id; the sub claim of PT tokens. */
  ptUserId: string;
  ptUsername: string;
}

export interface MockUser {
  /** Auth0-style user id, e.g. "auth0|000000000000000000000001". */
  authId: string;
  email: string;
  name: string;
  /** Auth0 connection of the primary identity. */
  connection: 'Username-Password-Authentication' | 'paratext' | 'Transparent-Authentication';
  picture?: string;
  /** Username/password for Transparent-Authentication (share-key) users. */
  username?: string;
  password?: string;
  /** Value for the http://xforge.org/role custom claim, e.g. "system_admin". */
  sfRole?: string;
  /** Value for the http://xforge.org/userid custom claim. In production an Auth0 Action reads
   * this from app_metadata.xf_user_id; here it is set directly or via mgmt-API PATCH. */
  xfUserId?: string;
  userMetadata: Record<string, unknown>;
  /** Linked Paratext identity; when present, mgmt-API user responses include a paratext entry
   * in identities[] carrying freshly minted PT access/refresh tokens. */
  paratext?: PtIdentity;
}

export interface MockProjectMember {
  ptUserId: string;
  role: PtRole;
}

export interface MockProject {
  /** 40-char lowercase hex id (Paratext project/repo id). */
  ptId: string;
  shortName: string;
  fullName: string;
  languageLdml: string;
  languageIso: string;
  languageName: string;
  projectType: string;
  baseProjectPtId?: string;
  members: MockProjectMember[];
  /** Registered in the (mock) Paratext registry. */
  registered: boolean;
  licenseExpired: boolean;
  /** PT username holding the archives-server repo lock, if any. */
  lockedBy?: string;
}

export interface MockResource {
  /** 16-char hex DBL id. */
  id: string;
  revision: number;
  name: string;
  fullname: string;
  languageCode: string;
  languageLDMLId: string;
  languageName: string;
  /** ptUserIds allowed to access the resource; undefined means allow_any_user. */
  permittedUsers?: string[];
  /** Absolute path of the built .p8z fixture. */
  p8zPath: string;
}

export interface RefreshTokenRecord {
  token: string;
  kind: 'auth0' | 'paratext';
  authId: string;
  clientId?: string;
  revoked: boolean;
  /** Set when rotated; the old token stays valid for a short grace period. */
  supersededAtMs?: number;
  createdAtMs: number;
}

export interface AuthCodeRecord {
  code: string;
  authId: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  audience?: string;
  nonce?: string;
  codeChallenge?: string;
  expiresAtMs: number;
}

export type ChaosMode = 'fail500' | 'fail429' | 'hang' | 'slow' | 'authExpired';

export interface ChaosRule {
  service: 'auth0' | 'registry' | 'archives' | 'dbl';
  /** Substring match against the request path; undefined matches every endpoint. */
  endpoint?: string;
  mode: ChaosMode;
  /** Number of requests still to affect; undefined means until cleared. */
  remaining?: number;
}
