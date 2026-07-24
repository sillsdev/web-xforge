/**
 * Mock DBL adapter router — mounted at /dbl.
 *
 * Provenance:
 *   - List endpoint shape: empirical capture of production
 *     GET pt-resources-adapter.library.bible/api/resource_entries (spec §5.4)
 *   - Download endpoint: SF code inspection — SFInstallableDblResource.GetFile() calls
 *     RESTClient.GetFile() which follows redirects; we serve bytes directly (equivalent)
 *   - Auth: SF uses a PT access JWT as Bearer (SFDblRestClientFactory → JwtRestClient.JwtToken →
 *     "Authorization: Bearer <token>"; ParatextData decompile line ~12466)
 *   - Unauthenticated requests: GET /api/resource_entries with no token returns 401.
 *     SF's GetInstallableDblResources wraps the call in try/catch and returns [] on WebException.
 *     Requiring auth ensures we exercise the token path and test restricted-resource filtering.
 *     Resources with permittedUsers=undefined are listed for any authenticated user
 *     (relevance.basic_permissions = ["allow_any_user"]).
 *     Resources with permittedUsers set are only listed for users in that array.
 */

import { Router } from 'express';
import fs from 'node:fs';
import { bearerToken } from '../jwt.js';
import { verifyPtToken } from '../pt-tokens.js';
import { state } from '../state.js';
import { checksums } from './p8z.js';

export const dblRouter = Router();

// ---------------------------------------------------------------------------
// GET /api/resource_entries[?id=<16hex>]
// Returns a JSON resource listing filtered by the caller's identity.
// ---------------------------------------------------------------------------
dblRouter.get('/api/resource_entries', (req, res) => {
  const token = bearerToken(req.headers.authorization);
  const caller = verifyPtToken(token);

  if (caller === undefined) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const idFilter = typeof req.query['id'] === 'string' ? req.query['id'] : undefined;

  const resources = [...state.resources.values()].filter(r => {
    if (idFilter !== undefined && r.id !== idFilter) return false;
    // Resources with no permittedUsers are public (allow_any_user)
    if (r.permittedUsers === undefined) return true;
    // Otherwise only listed for permitted PT users
    return r.permittedUsers.includes(caller.paratext?.ptUserId ?? '');
  });

  const now = new Date().toISOString();
  const body = {
    version: 'mock',
    resources: resources.map(r => {
      const { permissionsChecksum, manifestChecksum } = checksums(r);
      const isRestricted = r.permittedUsers !== undefined;
      return {
        id: r.id,
        revision: String(r.revision),
        name: r.name,
        fullname: r.fullname,
        nameCommon: r.name,
        languageName: r.languageName,
        languageCode: r.languageCode,
        languageLDMLId: r.languageLDMLId,
        dateUpdated: now,
        'permissions-checksum': permissionsChecksum,
        'p8z-manifest-checksum': manifestChecksum,
        relevance: {
          basic_permissions: isRestricted ? [] : ['allow_any_user']
        }
      };
    })
  };

  res.json(body);
});

// ---------------------------------------------------------------------------
// GET /api/resource_entries/:id
// Streams the .p8z file directly (real service 302s to CloudFront; client follows redirects
// so direct 200 is equivalent — see spec §5.4 and SFInstallableDblResource.GetFile).
// ---------------------------------------------------------------------------
dblRouter.get('/api/resource_entries/:id', (req, res) => {
  const token = bearerToken(req.headers.authorization);
  const caller = verifyPtToken(token);

  if (caller === undefined) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const { id } = req.params;
  const resource = state.resources.get(id);

  if (resource === undefined) {
    res.status(404).json({ error: 'resource not found' });
    return;
  }

  // Check permission
  if (resource.permittedUsers !== undefined && !resource.permittedUsers.includes(caller.paratext?.ptUserId ?? '')) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }

  // Check the file exists (may not have been built yet if something went wrong at seed time)
  if (!resource.p8zPath || !fs.existsSync(resource.p8zPath)) {
    res.status(503).json({ error: 'p8z not built yet' });
    return;
  }

  const stat = fs.statSync(resource.p8zPath);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Disposition', `attachment; filename="${resource.name}.p8z"`);

  const stream = fs.createReadStream(resource.p8zPath);
  stream.on('error', err => {
    console.error('[mock/dbl] stream error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'stream error' });
  });
  stream.pipe(res);
});
