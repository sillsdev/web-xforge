import { createUser } from '../control/ops-users.js';
import { createProject } from '../control/ops-projects.js';
import { createResource } from '../control/ops-resources.js';

/**
 * Default seed (spec §6): a few users (admin/translator/observer/unlinked), two projects (one
 * with a source project), one DBL resource. Fixed ids so tests and docs can reference them.
 */
export async function applyDefaultSeed(): Promise<void> {
  const admin = createUser({
    email: 'admin@mock.local',
    name: 'Mock Admin',
    authId: 'oauth2|paratext|mock-admin',
    xfUserId: 'mockadmin000000000000001',
    paratext: { ptUserId: 'pt-user-admin', ptUsername: 'Mock Admin' }
  });
  const translator = createUser({
    email: 'translator@mock.local',
    name: 'Mock Translator',
    authId: 'oauth2|paratext|mock-translator',
    xfUserId: 'mocktranslator0000000002',
    paratext: { ptUserId: 'pt-user-translator', ptUsername: 'Mock Translator' }
  });
  const observer = createUser({
    email: 'observer@mock.local',
    name: 'Mock Observer',
    authId: 'oauth2|paratext|mock-observer',
    xfUserId: 'mockobserver000000000003',
    paratext: { ptUserId: 'pt-user-observer', ptUsername: 'Mock Observer' }
  });
  createUser({
    email: 'unlinked@mock.local',
    name: 'Mock Unlinked',
    authId: 'auth0|mock-unlinked',
    xfUserId: 'mockunlinked000000000004'
  });
  // Serval administrator: can enable pre-translation drafting on projects (Serval Administration
  // page), which the draft-generation flow requires.
  createUser({
    email: 'serval-admin@mock.local',
    name: 'Mock Serval Admin',
    authId: 'auth0|mock-serval-admin',
    xfUserId: 'mockservaladmin000000005',
    sfRole: 'serval_admin'
  });

  const source = await createProject({
    shortName: 'MSRC',
    fullName: 'Mock Source Project',
    ptId: 'a'.repeat(39) + '1',
    templateBooks: ['RUT', 'JON'],
    members: [
      { ptUserId: admin.paratext!.ptUserId, role: 'pt_administrator' },
      { ptUserId: translator.paratext!.ptUserId, role: 'pt_observer' }
    ]
  });
  await createProject({
    shortName: 'MTRG',
    fullName: 'Mock Target Project',
    ptId: 'a'.repeat(39) + '2',
    templateBooks: ['RUT', 'JON'],
    baseProjectPtId: source.ptId,
    members: [
      { ptUserId: admin.paratext!.ptUserId, role: 'pt_administrator' },
      { ptUserId: translator.paratext!.ptUserId, role: 'pt_translator' },
      { ptUserId: observer.paratext!.ptUserId, role: 'pt_observer' }
    ]
  });

  await createResource({
    name: 'MockRes',
    fullname: 'Mock Resource Bible',
    id: 'b'.repeat(15) + '1',
    templateBooks: ['RUT']
  });
}
