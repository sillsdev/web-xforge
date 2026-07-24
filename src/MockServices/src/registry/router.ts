/**
 * Mock Paratext Registry (spec §5.2).
 *
 * Endpoint shapes derived from:
 *   swagger  — registry-swagger.yaml (pinned at reference/registry-swagger.yaml)
 *   SF code  — ParatextService.cs (CallApiAsync call sites), JwtInternetSharedRepositorySource.cs
 *              (GetProjectsMetaData / GetLicensesForUserProjects / GetLicenseForUserProject /
 *               GetProjectMetadata), JwtTokenHelper.cs (RefreshAccessTokenAsync)
 *   ParatextData decompile — ProjectMetadata.cs (field names read via GetString / ProjectGuid),
 *                            ProjectLicense.cs (ValidateLicense fields)
 *
 * NOTE on license endpoints: ProjectLicense.ValidateLicense() verifies a cryptographic signature
 * using Paratext's private RSA key — the mock cannot produce a passing signature.  All license
 * responses are therefore structurally correct JSON that will be parsed but treated as IsInvalid
 * by ParatextData.  SF falls through to the archives listrepos path in that case, which is the
 * expected mock-mode behaviour.  The endpoints must still exist and return 200/404 correctly so
 * that SF does not throw on 404→null semantics.
 */

import express, { Router } from 'express';
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_ROTATION_GRACE_SECONDS } from '../config.js';
import { bearerToken } from '../jwt.js';
import { mintPtAccessToken, mintPtRefreshToken, verifyPtToken } from '../pt-tokens.js';
import { state } from '../state.js';
import type { MockProject, MockUser } from '../types.js';

export const registryRouter = Router();
registryRouter.use(express.json());

// ---------------------------------------------------------------------------
// Auth middleware — all /api8/* except POST /api8/token
// ---------------------------------------------------------------------------

function requirePtAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const token = bearerToken(req.headers.authorization);
  const user = verifyPtToken(token);
  if (user === undefined) {
    res.status(401).json({ error: 'unauthorized', error_description: 'Invalid or missing PT bearer token' });
    return;
  }
  // Attach for downstream handlers
  (req as express.Request & { ptUser: MockUser }).ptUser = user;
  next();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the ProjectMetadata JSON shape that ProjectMetadata.cs parses via GetString / ProjectGuid. */
function projectMetadata(project: MockProject): Record<string, unknown> {
  return {
    _id: project.ptId,
    identification_systemId: [
      {
        type: 'paratext',
        name: project.shortName,
        fullname: project.fullName,
        text: project.ptId
      }
    ],
    identification_shortName: project.shortName,
    identification_name: project.fullName,
    identification_abbreviation: project.shortName.slice(0, 8),
    language_iso: project.languageIso,
    language_ldml: project.languageLdml,
    visibility: 'Public',
    type_translationType: 'New',
    agencies_rightsHolders: [{ id: '545d2cb003f5772898d5891d' }],
    countries: ['US']
  };
}

/**
 * Build a ProjectRegistration (license) JSON object.  The signature field is intentionally
 * empty — see provenance note at top of file.  SF's ProjectLicense.ValidateLicense() will mark
 * this IsInvalid because the signature check fails.
 */
function projectRegistration(project: MockProject): Record<string, unknown> | null {
  if (project.licenseExpired) {
    return {
      type: 'translator',
      licensedToParatextId: project.ptId,
      licensedToOrgs: ['545d2cb003f5772898d5891d'],
      issuedAt: new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString(),
      expiresAt: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
      revoked: false,
      signature: ''
    };
  }
  return {
    type: 'translator',
    licensedToParatextId: project.ptId,
    licensedToOrgs: ['545d2cb003f5772898d5891d'],
    issuedAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
    expiresAt: null,
    revoked: false,
    signature: ''
  };
}

/** Returns true if `user` has any member entry on `project`. */
function isMember(user: MockUser, project: MockProject): boolean {
  const ptId = user.paratext?.ptUserId;
  if (ptId === undefined) return false;
  return project.members.some(m => m.ptUserId === ptId);
}

type AuthedRequest = express.Request & { ptUser: MockUser };

function ptUser(req: express.Request): MockUser {
  return (req as unknown as AuthedRequest).ptUser;
}

// ---------------------------------------------------------------------------
// POST /api8/token — PT refresh_token rotation
// (no Bearer auth required — the refresh token IS the credential)
// Shapes: JwtTokenHelper.RefreshAccessTokenAsync (request + response field names)
// ---------------------------------------------------------------------------

registryRouter.post('/api8/token', (req, res) => {
  const body = req.body as Record<string, string>;
  if (body.grant_type !== 'refresh_token') {
    res.status(400).json({ error: 'unsupported_grant_type' });
    return;
  }

  const presentedToken = body.refresh_token;
  if (!presentedToken) {
    res.status(400).json({ error: 'invalid_request', error_description: 'refresh_token required' });
    return;
  }

  const record = state.refreshTokens.get(presentedToken);
  if (!record || record.kind !== 'paratext') {
    res.status(400).json({ error: 'invalid_grant', error_description: 'unknown refresh token' });
    return;
  }

  // Hard-revoked tokens are always rejected
  if (record.revoked && record.supersededAtMs === undefined) {
    res.status(400).json({ error: 'invalid_grant', error_description: 'refresh token revoked' });
    return;
  }

  // Grace window for superseded (rotated) tokens
  if (
    record.supersededAtMs !== undefined &&
    Date.now() - record.supersededAtMs > REFRESH_ROTATION_GRACE_SECONDS * 1000
  ) {
    res.status(400).json({ error: 'invalid_grant', error_description: 'refresh token expired' });
    return;
  }

  const user = state.users.get(record.authId);
  if (!user?.paratext) {
    res.status(401).json({ error: 'invalid_grant', error_description: 'user not found or has no PT identity' });
    return;
  }

  // Rotate: mark the old token superseded
  record.supersededAtMs = Date.now();
  record.revoked = true;

  // Mint new tokens
  const newAccessToken = mintPtAccessToken(user.paratext);
  const newRefreshToken = mintPtRefreshToken(user);

  // JwtTokenHelper reads: access_token, refresh_token (+ IssuedAt inferred from JWT iat)
  res.json({
    access_token: newAccessToken,
    refresh_token: newRefreshToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SECONDS
  });
});

// ---------------------------------------------------------------------------
// All remaining /api8/* routes require Bearer PT auth
// ---------------------------------------------------------------------------

registryRouter.use('/api8', requirePtAuth);

// ---------------------------------------------------------------------------
// GET /api8/userinfo
// Shape: swagger UserInfo definition; SF uses it only as an auth probe (CallApiAsync line 421)
// ---------------------------------------------------------------------------

registryRouter.get('/api8/userinfo', (req, res) => {
  const user = ptUser(req);
  res.json({
    sub: user.paratext!.ptUserId,
    username: user.paratext!.ptUsername,
    primary_org_id: '545d2cb003f5772898d5891d',
    pt_approved: true,
    picture: user.picture ?? null
  });
});

// ---------------------------------------------------------------------------
// GET /api8/my/projects
// Consumed by JwtInternetSharedRepositorySource.GetProjectsMetaData() → new ProjectMetadata(JObject)
// ProjectMetadata reads: identification_systemId[type=paratext].text (→ ProjectGuid),
//   identification_shortName (→ ShortName), identification_name (→ FullName),
//   language_ldml / language_iso (→ LanguageId)
// ---------------------------------------------------------------------------

registryRouter.get('/api8/my/projects', (req, res) => {
  const user = ptUser(req);
  const projects = [...state.projects.values()].filter(p => p.registered && isMember(user, p));
  res.json(projects.map(projectMetadata));
});

// ---------------------------------------------------------------------------
// GET /api8/projects/:ptId  — single project metadata
// Consumed by JwtInternetSharedRepositorySource.GetProjectMetadata()
// 404 → GetProjectMetadata returns null (SF treats gracefully)
// ---------------------------------------------------------------------------

registryRouter.get('/api8/projects/:ptId', (req, res) => {
  const user = ptUser(req);
  const project = state.projects.get(req.params.ptId);
  if (!project || !project.registered || !isMember(user, project)) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json(projectMetadata(project));
});

// ---------------------------------------------------------------------------
// GET /api8/projects/:ptId/identification_systemId/paratext/text
// SF (ParatextService.IsRegisteredAsync) checks that the trimmed/unquoted value equals ptId.
// Returns the ptId as a JSON quoted string; 404 for unregistered or non-member.
// ---------------------------------------------------------------------------

registryRouter.get('/api8/projects/:ptId/identification_systemId/:systemType/text', (req, res) => {
  const user = ptUser(req);
  if (req.params.systemType !== 'paratext') {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const project = state.projects.get(req.params.ptId);
  if (!project || !project.registered || !isMember(user, project)) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  // SF does: registeredParatextId.Trim('"') == paratextId — must return a JSON string
  res.json(project.ptId);
});

// ---------------------------------------------------------------------------
// GET /api8/my/licenses
// Consumed by JwtInternetSharedRepositorySource.GetLicensesForUserProjects() (private method)
// Returns array of ProjectRegistration objects; items with invalid/expired licenses are still
// included — ProjectLicense(JObject) will judge validity client-side.
// ---------------------------------------------------------------------------

registryRouter.get('/api8/my/licenses', (req, res) => {
  const user = ptUser(req);
  const registrations = [...state.projects.values()]
    .filter(p => p.registered && isMember(user, p))
    .map(p => {
      const reg = projectRegistration(p);
      if (reg === null) return null;
      // Include role so ParatextData's GetLicensesForUserProjects can filter by role
      const memberEntry = p.members.find(m => m.ptUserId === user.paratext!.ptUserId);
      return { ...reg, role: memberEntry?.role ?? 'pt_observer' };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  res.json(registrations);
});

// ---------------------------------------------------------------------------
// GET /api8/projects/:ptId/license
// Consumed by JwtInternetSharedRepositorySource.GetLicenseForUserProject()
// 404 → returns null (handled gracefully by SF)
// ---------------------------------------------------------------------------

registryRouter.get('/api8/projects/:ptId/license', (req, res) => {
  const user = ptUser(req);
  const project = state.projects.get(req.params.ptId);
  if (!project || !project.registered || !isMember(user, project)) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const reg = projectRegistration(project);
  if (reg === null) {
    res.json(null);
    return;
  }
  res.json(reg);
});

// ---------------------------------------------------------------------------
// GET /api8/projects/:ptId/members
// SF (GetParatextUsersAsync) reads: userId, username, role from each item.
// It filters out items where userId or username is null/empty.
// ---------------------------------------------------------------------------

registryRouter.get('/api8/projects/:ptId/members', (req, res) => {
  const user = ptUser(req);
  const project = state.projects.get(req.params.ptId);
  if (!project || !project.registered || !isMember(user, project)) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const members = project.members
    .map(m => {
      const memberUser = state.findUserByPtUserId(m.ptUserId);
      if (!memberUser?.paratext) return null;
      return {
        userId: memberUser.paratext.ptUserId,
        username: memberUser.paratext.ptUsername,
        role: m.role
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  res.json(members);
});

// ---------------------------------------------------------------------------
// GET /api8/projects/:ptId/members/:sub
// SF (TryGetProjectRoleAsync) reads: role from the returned object.
// :sub is the JWT sub claim (== ptUserId in mock tokens)
// ---------------------------------------------------------------------------

registryRouter.get('/api8/projects/:ptId/members/:sub', (req, res) => {
  const caller = ptUser(req);
  const project = state.projects.get(req.params.ptId);
  if (!project || !project.registered || !isMember(caller, project)) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const targetPtUserId = req.params.sub;
  const entry = project.members.find(m => m.ptUserId === targetPtUserId);
  if (!entry) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const memberUser = state.findUserByPtUserId(targetPtUserId);
  res.json({
    userId: targetPtUserId,
    username: memberUser?.paratext?.ptUsername ?? targetPtUserId,
    role: entry.role
  });
});
