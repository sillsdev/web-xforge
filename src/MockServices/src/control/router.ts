import { Router } from 'express';
import express from 'express';
import { state } from '../state.js';
import { applySeed, seedNames } from '../seeds/index.js';
import { createUser } from './ops-users.js';
import { commitToProject, createProject, importProject, setMembers } from './ops-projects.js';
import { createResource } from './ops-resources.js';
import type { ChaosRule } from '../types.js';

/**
 * Control API (spec §6): scenario scripting for E2E tests, agents, and developers.
 * Everything here is a thin HTTP layer over the ops-* modules so seeds and tests share code.
 */
export const controlRouter = Router();

controlRouter.use(express.json({ limit: '20mb' }));

function handle(
  fn: (req: express.Request, res: express.Response) => Promise<unknown> | unknown
): express.RequestHandler {
  return async (req, res) => {
    try {
      const result = await fn(req, res);
      if (!res.headersSent) res.json(result ?? { ok: true });
    } catch (error) {
      res.status(400).json({ error: String(error instanceof Error ? error.message : error) });
    }
  };
}

controlRouter.post(
  '/reset',
  handle(async req => {
    const seed = String(req.query.seed ?? 'default');
    await applySeed(seed);
    return { ok: true, seed, seeds: seedNames() };
  })
);

controlRouter.post(
  '/users',
  handle(req => createUser(req.body))
);

controlRouter.post(
  '/projects',
  handle(req => createProject(req.body))
);

controlRouter.post(
  '/projects/import',
  handle(req => importProject(req.body))
);

controlRouter.post(
  '/projects/:ptId/commit',
  handle(req => commitToProject(req.params.ptId, req.body))
);

controlRouter.patch(
  '/projects/:ptId/members',
  handle(req => setMembers(req.params.ptId, req.body.members ?? req.body))
);

controlRouter.patch(
  '/projects/:ptId',
  handle(req => {
    const project = state.projects.get(req.params.ptId);
    if (!project) throw new Error(`unknown project ${req.params.ptId}`);
    for (const key of ['registered', 'licenseExpired', 'lockedBy'] as const) {
      if (key in req.body) (project as unknown as Record<string, unknown>)[key] = req.body[key];
    }
    state.save();
    return project;
  })
);

controlRouter.post(
  '/resources',
  handle(req => createResource(req.body))
);

controlRouter.post(
  '/next-login',
  handle(req => {
    const { authId } = req.body;
    if (authId !== undefined && !state.users.has(authId)) throw new Error(`unknown user ${authId}`);
    state.nextLoginAuthId = authId;
    return { ok: true, authId };
  })
);

controlRouter.post(
  '/chaos',
  handle(req => {
    const rule = req.body as ChaosRule;
    if (!['auth0', 'registry', 'archives', 'dbl'].includes(rule.service)) {
      throw new Error(`unknown service ${rule.service}`);
    }
    state.chaosRules.push(rule);
    return { ok: true, rules: state.chaosRules };
  })
);

controlRouter.delete(
  '/chaos',
  handle(() => {
    state.chaosRules = [];
  })
);

controlRouter.post(
  '/tokens/revoke',
  handle(req => {
    const { authId, kind } = req.body as { authId?: string; kind?: 'auth0' | 'paratext' };
    let revoked = 0;
    for (const record of state.refreshTokens.values()) {
      if ((authId === undefined || record.authId === authId) && (kind === undefined || record.kind === kind)) {
        record.revoked = true;
        revoked += 1;
      }
    }
    state.save();
    return { ok: true, revoked };
  })
);

controlRouter.get('/state', (_req, res) => {
  res.json(state.dump());
});
