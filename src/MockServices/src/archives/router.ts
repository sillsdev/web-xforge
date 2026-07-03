// Mock Paratext send/receive archives server.
//
// Provenance of behaviors:
// - spec-local-mock-services.md §5.3 — endpoint list, XML/JSON shapes, chunk size, Content-Range
//   format (leading space literal), Content-Length=0 = up to date, 410 getfile = absent.
// - Decompiled ParatextData 9.5.0.24 (ilspycmd) — the wire protocol that this mock must satisfy:
//     * RESTClient.PostStreamingInternal: push chunks are separate POSTs, each ContentLength =
//       chunk size, header `Content-Range: " bytes {start}-{end}/{total}"` (end inclusive, leading
//       space literal). After each chunk the client reads response header `Range`; if present it
//       parses Range.Split('-')[0] as the next offset. A ProtocolError (4xx/5xx) on a chunk is NOT
//       fatal — the client retries up to 25× (2s sleeps). Loop ends when offset >= total.
//     * RESTClient.GetStreamingInternalWrapped: pull resume uses AddRange(start, int.MaxValue) i.e.
//       `Range: bytes=start-`; the client treats response ContentLength as the *remaining* bytes
//       and total = start + ContentLength. ContentLength==0 short-circuits to success (empty pull).
//     * InternetSharedRepositorySource.GetRepositories: parses /repos/repo{proj,projid,baseprojid,
//       projecttype,tipid,users/user{name,role}}; role strings are pt_* (RegistryServer.ConvertToUserRole).
//     * .GetFile: trims body, if starts with '<' reads /data else uses body as base64; 410 -> null.
//     * .CreateRepository: 409 -> DisjointProjectsJoined, 403 -> RepositoryExists; reply /repo{proj,projid}.
//     * .LockRemoteRepository: on 403 reads body substring after "locked by " as the holder; retries 30×.
//     * .GetServerProjectName: parses listnames /repos/repo{projid,fullname,langname,langcode}.
//     * projrevhist consumed as {project:{revision_history:{revisions:[{id},…]}}}.
// - JwtInternetSharedRepositorySource.cs (SF) — SF overrides Pull/Push/GetOutgoingRevisions:
//     Pull sends guid,proj,projid,type=zstd-v2[,base1]; pushbundle sends guid,proj,projid,
//     registered,userschanged; auth probe = GET listrepos (HttpException -> false). Bearer PT JWT
//     via RESTClient.SetAuthentication ("Authorization: Bearer <jwt>").
//
// Guesses / open questions are marked GUESS inline.

import { Router, type Request, type Response } from 'express';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { bearerToken } from '../jwt.js';
import { verifyPtToken } from '../pt-tokens.js';
import { state } from '../state.js';
import * as hg from '../hg.js';
import { repoDir } from '../control/ops-projects.js';
import type { MockProject, MockUser } from '../types.js';

export const archivesRouter = Router();

const CHUNK_LIMIT = 262144;

// ---- helpers -------------------------------------------------------------

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Authenticated PT user, or undefined (caller should 401). listrepos doubles as the auth probe. */
function authUser(req: Request): MockUser | undefined {
  return verifyPtToken(bearerToken(req.headers.authorization));
}

function isMember(project: MockProject, user: MockUser): boolean {
  const ptUserId = user.paratext?.ptUserId;
  return ptUserId !== undefined && project.members.some(m => m.ptUserId === ptUserId);
}

/**
 * Resolves the project addressed by ?proj=&projid= and enforces membership. On failure it writes
 * the response and returns undefined. projid (the 40-hex ptId) is authoritative; proj (shortName)
 * is informational.
 */
function resolveProject(
  req: Request,
  res: Response,
  user: MockUser
): { project: MockProject; ptId: string } | undefined {
  const ptId = String(req.query.projid ?? '');
  const project = state.projects.get(ptId);
  if (!project) {
    res.status(404).type('text/plain').send('no such project');
    return undefined;
  }
  if (!isMember(project, user)) {
    res.status(403).type('text/plain').send('not a member of this project');
    return undefined;
  }
  return { project, ptId };
}

const roleTag = (role: string): string => role; // listrepos <role> uses the pt_* string directly.

// ---- pull bundle cache ---------------------------------------------------
// Cache the full bundle bytes per guid so Range-resume requests reuse the same bytes.
const bundleCache = new Map<string, Buffer>();

// ---- push reassembly -----------------------------------------------------
// Reassemble uploaded chunks per guid; run hg unbundle when the last byte arrives.
interface PushState {
  ptId: string;
  total: number;
  buffer: Buffer;
  received: number;
}
const pushState = new Map<string, PushState>();

/** Parses `Content-Range: [ ]bytes {start}-{end}/{total}` tolerantly. end is inclusive. */
function parseContentRange(header: string | undefined): { start: number; end: number; total: number } | undefined {
  if (header === undefined) return undefined;
  const m = header.match(/bytes\s+(\d+)\s*-\s*(\d+)\s*\/\s*(\d+)/i);
  if (!m) return undefined;
  return { start: Number(m[1]), end: Number(m[2]), total: Number(m[3]) };
}

// ---- endpoints -----------------------------------------------------------

// GET listrepos — auth probe + repo listing filtered to the caller's projects.
archivesRouter.get('/listrepos', async (req, res) => {
  const user = authUser(req);
  if (!user) return void res.status(401).type('text/plain').send('unauthorized');

  const repos: string[] = [];
  for (const project of state.projects.values()) {
    if (!isMember(project, user)) continue;
    const tipid = await hg.tipId(repoDir(project.ptId));
    const users = project.members
      .map(m => {
        const memberUser = state.findUserByPtUserId(m.ptUserId);
        const name = memberUser?.paratext?.ptUsername ?? m.ptUserId;
        return `<user><name>${xmlEscape(name)}</name><role>${roleTag(m.role)}</role></user>`;
      })
      .join('');
    repos.push(
      `<repo><proj>${xmlEscape(project.shortName)}</proj>` +
        `<projid>${project.ptId}</projid>` +
        `<baseprojid>${project.baseProjectPtId ?? ''}</baseprojid>` +
        `<projecttype>${xmlEscape(project.projectType)}</projecttype>` +
        `<tipid>${tipid}</tipid>` +
        `<users>${users}</users></repo>`
    );
  }
  res.type('application/xml').send(`<repos>${repos.join('')}</repos>`);
});

// GET listnames — all registered projects (no membership filter; base class ignores errors here).
archivesRouter.get('/listnames', (req, res) => {
  const user = authUser(req);
  if (!user) return void res.status(401).type('text/plain').send('unauthorized');
  const repos = [...state.projects.values()]
    .filter(p => p.registered)
    .map(
      p =>
        `<repo><projid>${p.ptId}</projid>` +
        `<fullname>${xmlEscape(p.fullName)}</fullname>` +
        `<langname>${xmlEscape(p.languageName)}</langname>` +
        `<langcode>${xmlEscape(p.languageIso)}</langcode></repo>`
    )
    .join('');
  res.type('application/xml').send(`<repos>${repos}</repos>`);
});

// GET pullbundle — raw hg bundle bytes; supports Range-resume against the guid-cached bundle.
archivesRouter.get('/pullbundle', async (req, res) => {
  const user = authUser(req);
  if (!user) return void res.status(401).type('text/plain').send('unauthorized');
  const resolved = resolveProject(req, res, user);
  if (!resolved) return;
  const lockErr = checkLock(resolved.project, user);
  if (lockErr) return void res.status(403).type('text/plain').send(lockErr);

  const guid = String(req.query.guid ?? '');
  const type = String(req.query.type ?? 'zstd-v2');
  const bases: string[] = [];
  for (const key of Object.keys(req.query)) {
    if (/^base\d+$/.test(key)) bases.push(String(req.query[key]));
  }

  let bundle = guid ? bundleCache.get(guid) : undefined;
  if (bundle === undefined) {
    bundle = await hg.bundle(repoDir(resolved.ptId), type, bases);
    if (guid) bundleCache.set(guid, bundle);
  }

  res.type('application/octet-stream');

  // Range-resume: client sends `Range: bytes=<start>-`; reply 206 with the remaining tail. The
  // client uses the response Content-Length as the remaining count (total = start + length).
  const range = req.headers.range;
  const rangeMatch = typeof range === 'string' ? range.match(/bytes=(\d+)-/) : null;
  if (rangeMatch) {
    const start = Math.min(Number(rangeMatch[1]), bundle.length);
    const tail = bundle.subarray(start);
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${Math.max(bundle.length - 1, start)}/${bundle.length}`);
    res.setHeader('Content-Length', String(tail.length));
    res.setHeader('Accept-Ranges', 'bytes');
    return void res.end(tail);
  }

  res.setHeader('Content-Length', String(bundle.length));
  res.setHeader('Accept-Ranges', 'bytes');
  res.end(bundle); // Content-Length 0 with empty body when up to date.
});

// GET pullbundlefinish — drop the cached bundle.
archivesRouter.get('/pullbundlefinish', (req, res) => {
  const user = authUser(req);
  if (!user) return void res.status(401).type('text/plain').send('unauthorized');
  const guid = String(req.query.guid ?? '');
  if (guid) bundleCache.delete(guid);
  res.status(200).end();
});

// POST pushbundle — octet-stream chunks with Content-Range; reassemble per guid then hg unbundle.
archivesRouter.post('/pushbundle', express.raw({ type: '*/*', limit: '300kb' }), async (req, res) => {
  const user = authUser(req);
  if (!user) return void res.status(401).type('text/plain').send('unauthorized');
  const resolved = resolveProject(req, res, user);
  if (!resolved) return;
  const lockErr = checkLock(resolved.project, user);
  if (lockErr) return void res.status(403).type('text/plain').send(lockErr);

  const guid = String(req.query.guid ?? '');
  if (!guid) return void res.status(400).type('text/plain').send('missing guid');

  const body: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const cr = parseContentRange(req.headers['content-range'] as string | undefined);
  // Fall back to a single, whole-body upload if no Content-Range was sent.
  const start = cr ? cr.start : 0;
  const total = cr ? cr.total : body.length;

  if (body.length > CHUNK_LIMIT) {
    return void res.status(400).type('text/plain').send('chunk exceeds 262144 bytes');
  }

  let st = pushState.get(guid);
  if (!st || st.total !== total) {
    st = { ptId: resolved.ptId, total, buffer: Buffer.alloc(total), received: 0 };
    pushState.set(guid, st);
  }
  body.copy(st.buffer, start);
  st.received = Math.max(st.received, start + body.length);

  // Tell the client where to continue (it reads Range.Split('-')[0] as the next offset).
  res.setHeader('Range', `${st.received}-`);

  if (st.received < total) {
    return void res.status(200).end();
  }

  // Final chunk: apply the bundle to the server repo.
  pushState.delete(guid);
  try {
    await hg.unbundle(repoDir(st.ptId), st.buffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return void res.status(422).type('text/plain').send(`unbundle failed: ${message}`);
  }
  res.status(200).end();
});

// GET projrevhist — {project:{revision_history:{revisions:[{id},…]}}}, newest first.
archivesRouter.get('/projrevhist', async (req, res) => {
  const user = authUser(req);
  if (!user) return void res.status(401).type('text/plain').send('unauthorized');
  const resolved = resolveProject(req, res, user);
  if (!resolved) return;
  const revisions = (await hg.revisionHistory(repoDir(resolved.ptId))).map(id => ({ id }));
  res.json({ project: { revision_history: { revisions } } });
});

// GET lockrepo / unlockrepo.
archivesRouter.get('/lockrepo', (req, res) => {
  const user = authUser(req);
  if (!user) return void res.status(401).type('text/plain').send('unauthorized');
  const resolved = resolveProject(req, res, user);
  if (!resolved) return;
  const holder = resolved.project.lockedBy;
  const me = user.paratext?.ptUsername ?? user.name;
  if (holder && holder !== me) {
    return void res.status(403).type('text/plain').send(`locked by ${holder}`);
  }
  resolved.project.lockedBy = me;
  state.save();
  res.status(200).end();
});

archivesRouter.get('/unlockrepo', (req, res) => {
  const user = authUser(req);
  if (!user) return void res.status(401).type('text/plain').send('unauthorized');
  const resolved = resolveProject(req, res, user);
  if (!resolved) return;
  resolved.project.lockedBy = undefined;
  state.save();
  res.status(200).end();
});

/** Returns a 403 body string if the project is locked by someone other than `user`, else null. */
function checkLock(project: MockProject, user: MockUser): string | null {
  const me = user.paratext?.ptUsername ?? user.name;
  if (project.lockedBy && project.lockedBy !== me) return `locked by ${project.lockedBy}`;
  return null;
}

// GET getfile — base64 body; ProjectUserAccess.xml is served from the repo working dir (the file
// there was written by ParatextData via ParatextProjectTool); unknown file -> 410.
archivesRouter.get('/getfile', (req, res) => {
  const user = authUser(req);
  if (!user) return void res.status(401).type('text/plain').send('unauthorized');
  const resolved = resolveProject(req, res, user);
  if (!resolved) return;
  const filename = String(req.query.filename ?? '');
  if (filename === 'ProjectUserAccess.xml') {
    const filePath = path.join(repoDir(resolved.project.ptId), 'ProjectUserAccess.xml');
    if (!fs.existsSync(filePath)) return void res.status(410).type('text/plain').send('file not available');
    // GetFile: raw base64 body (not the <data> wrapper). Client trims then base64-decodes.
    return void res.type('text/plain').send(fs.readFileSync(filePath).toString('base64'));
  }
  res.status(410).type('text/plain').send('file not available');
});

// GET createrepo — hg init + register a project; 403 if it already exists.
archivesRouter.get('/createrepo', async (req, res) => {
  const user = authUser(req);
  if (!user) return void res.status(401).type('text/plain').send('unauthorized');
  const shortName = String(req.query.proj ?? '');
  const ptId = String(req.query.projid ?? '');
  if (!/^[0-9a-fA-F]{40}$/.test(ptId)) {
    return void res.status(400).type('text/plain').send('projid must be 40 hex chars');
  }
  if (state.projects.has(ptId)) {
    return void res.status(403).type('text/plain').send('repository exists on server');
  }
  const baseprojid = String(req.query.baseprojid ?? '');
  const project: MockProject = {
    ptId,
    shortName,
    fullName: shortName,
    languageLdml: 'en',
    languageIso: 'en',
    languageName: 'English',
    projectType: String(req.query.projecttype ?? 'Standard'),
    baseProjectPtId: baseprojid || undefined,
    members: user.paratext ? [{ ptUserId: user.paratext.ptUserId, role: 'pt_administrator' }] : [],
    registered: String(req.query.registryid ?? 'none') !== 'none',
    licenseExpired: false
  };
  await hg.init(repoDir(ptId));
  state.projects.set(ptId, project);
  state.save();
  res.type('application/xml').send(`<repo><proj>${xmlEscape(shortName)}</proj><projid>${ptId}</projid></repo>`);
});

// GET resettests — alias for control-API reset (matches ParatextData's own test hooks).
archivesRouter.get('/resettests', async (_req, res) => {
  const { applySeed } = await import('../seeds/index.js');
  await applySeed('default');
  bundleCache.clear();
  pushState.clear();
  res.status(200).end();
});

// ---- low-priority stubs (rarely hit by SF): benign defaults + log. -------

archivesRouter.get('/verify', (_req, res) => {
  console.log('[mock archives] verify (stub) -> empty (no problems)');
  res.type('text/plain').send(''); // empty body = "no problems"
});

archivesRouter.get('/highestrev', (_req, res) => {
  console.log('[mock archives] highestrev (stub) -> 0');
  res.type('text/plain').send('0'); // int.TryParse -> 0
});

archivesRouter.get('/hiderepo', (_req, res) => {
  console.log('[mock archives] hiderepo (stub) -> 200');
  res.status(200).end();
});

archivesRouter.get('/removecaller', (_req, res) => {
  console.log('[mock archives] removecaller (stub) -> SUCCESS');
  res.type('text/plain').send('SUCCESS'); // client checks == "SUCCESS"
});

archivesRouter.get('/getsettings', (_req, res) => {
  console.log('[mock archives] getsettings (stub) -> empty');
  res.type('application/octet-stream');
  res.setHeader('Content-Length', '0');
  res.end();
});
