import { MAX_REPLAYED_OPS } from '../../common/gateway/gateway-data-source';
import { InboundAuthorizationSubject, InboundDecision } from '../../common/gateway/authorization';
import { InboundMessage, PresenceChannel, ViewerPresence } from '../../common/gateway/inbound-messages';
import { USER_PROFILES_COLLECTION, USERS_COLLECTION } from '../../common/models/user';
import { NOTE_THREAD_COLLECTION } from '../models/note-thread';
import { SF_PROJECT_PROFILES_COLLECTION, SF_PROJECTS_COLLECTION } from '../models/sf-project';
import { SF_PROJECT_USER_CONFIGS_COLLECTION } from '../models/sf-project-user-config';
import { TEXTS_COLLECTION } from '../models/text-data';
import { TRAINING_DATA_COLLECTION } from '../models/training-data';
import { PROJECT_ID, sessionFor, testProjectData, TestUserName, TestWorld, USERS } from './test-gateway-world';
import { PresenceIdBindings } from './presence-bindings';
import { ReadGrants } from './read-grants';
import { SFInboundAuthorizer } from './sf-inbound-authorizer';

const TEXT_1 = `${PROJECT_ID}:MAT:1:target`;
const TEXT_2 = `${PROJECT_ID}:MAT:2:target`;
const PT_THREAD = `${PROJECT_ID}:ptthread01`;
const SF_THREAD = `${PROJECT_ID}:sfthread01`;
const NEW_THREAD = `${PROJECT_ID}:newthread01`;
const PRESENCE_ID = '0123456789abcdef01234567';
const OTHER_PRESENCE_ID = '0123456789abcdef0123456f';
const SRC = 'src01';

describe('SFInboundAuthorizer', () => {
  describe('fetch and subscribe', () => {
    it.each<[TestUserName, boolean]>([
      ['admin', true],
      ['checker', true],
      ['sfObserver', true],
      ['nonMember', false],
      ['systemAdmin', false]
    ])('lets %s read a text: %s', async (user: TestUserName, allowed: boolean) => {
      const env = new TestEnvironment();

      const decision: InboundDecision = await env.authorize(user, env.fetch(TEXTS_COLLECTION, TEXT_1));

      expect(decision.kind).toEqual(allowed ? 'authorized' : 'refused');
    });

    it('decides a doc that does not exist by its id', async () => {
      const env = new TestEnvironment();

      expect((await env.authorize('admin', env.fetch(NOTE_THREAD_COLLECTION, NEW_THREAD))).kind).toEqual('authorized');
      // Whether a thread that does not exist yet would be published is not known, so SF-only roles may not read it.
      expect((await env.authorize('commenter', env.fetch(NOTE_THREAD_COLLECTION, NEW_THREAD))).kind).toEqual('refused');
      expect((await env.authorize('nonMember', env.fetch(NOTE_THREAD_COLLECTION, NEW_THREAD))).kind).toEqual('refused');
    });

    it('lets SF-only roles read published note threads only', async () => {
      const env = new TestEnvironment();

      expect((await env.authorize('commenter', env.fetch(NOTE_THREAD_COLLECTION, SF_THREAD))).kind).toEqual(
        'authorized'
      );
      expect((await env.authorize('commenter', env.fetch(NOTE_THREAD_COLLECTION, PT_THREAD))).kind).toEqual('refused');
      expect((await env.authorize('checker', env.fetch(NOTE_THREAD_COLLECTION, SF_THREAD))).kind).toEqual('refused');
    });

    it('lets users read only their own user doc and project user config', async () => {
      const env = new TestEnvironment();
      const ownConfig = `${PROJECT_ID}:${USERS.checker}`;
      const otherConfig = `${PROJECT_ID}:${USERS.admin}`;
      env.world.data.put(SF_PROJECT_USER_CONFIGS_COLLECTION, otherConfig, {
        projectRef: PROJECT_ID,
        ownerRef: USERS.admin
      });

      expect((await env.authorize('checker', env.fetch(USERS_COLLECTION, USERS.checker))).kind).toEqual('authorized');
      expect((await env.authorize('checker', env.fetch(USERS_COLLECTION, USERS.admin))).kind).toEqual('refused');
      expect((await env.authorize('servalAdmin', env.fetch(USERS_COLLECTION, USERS.admin))).kind).toEqual('authorized');
      expect((await env.authorize('checker', env.fetch(USER_PROFILES_COLLECTION, USERS.admin))).kind).toEqual(
        'authorized'
      );
      // The config does not exist yet: decided by its id.
      expect((await env.authorize('checker', env.fetch(SF_PROJECT_USER_CONFIGS_COLLECTION, ownConfig))).kind).toEqual(
        'authorized'
      );
      expect(await env.authorize('checker', env.fetch(SF_PROJECT_USER_CONFIGS_COLLECTION, otherConfig))).toEqual({
        kind: 'refused',
        reason: expect.any(String),
        reply: 'error'
      });
      // Nobody else's config may be read where none exists either; that refusal is silent, as for any missing doc.
      expect(
        await env.authorize('admin', env.fetch(SF_PROJECT_USER_CONFIGS_COLLECTION, `${PROJECT_ID}:${USERS.nonMember}`))
      ).toEqual({ kind: 'refused', reason: expect.any(String), reply: 'silent-read-rejection' });
    });

    it('lets users read their own project user config without being members, as administrators do', async () => {
      const env = new TestEnvironment();
      const removedUserConfig = `${PROJECT_ID}:${USERS.nonMember}`;
      const servalAdminConfig = `${PROJECT_ID}:${USERS.servalAdmin}`;
      // A user removed from the project whose config the backend has not deleted yet.
      env.world.data.put(SF_PROJECT_USER_CONFIGS_COLLECTION, removedUserConfig, {
        projectRef: PROJECT_ID,
        ownerRef: USERS.nonMember
      });

      const removedUser: InboundDecision = await env.authorize(
        'nonMember',
        env.fetch(SF_PROJECT_USER_CONFIGS_COLLECTION, removedUserConfig)
      );
      const servalAdmin: InboundDecision = await env.authorize(
        'servalAdmin',
        env.fetch(SF_PROJECT_USER_CONFIGS_COLLECTION, servalAdminConfig)
      );
      const servalAdminEdit: InboundDecision = await env.authorize('servalAdmin', {
        kind: 'edit-op',
        collection: SF_PROJECT_USER_CONFIGS_COLLECTION,
        docId: servalAdminConfig,
        src: SRC,
        seq: 1,
        source: null,
        version: 1,
        edit: { otType: 'json0', components: [] }
      });

      expect(removedUser).toEqual({ kind: 'authorized' });
      expect(servalAdmin).toEqual({ kind: 'authorized' });
      // Edits still need membership.
      expect(servalAdminEdit.kind).toEqual('refused');
    });

    it('lets members read the project profile, and only Paratext roles the whole project', async () => {
      const env = new TestEnvironment();

      expect((await env.authorize('checker', env.fetch(SF_PROJECT_PROFILES_COLLECTION, PROJECT_ID))).kind).toEqual(
        'authorized'
      );
      expect((await env.authorize('checker', env.fetch(SF_PROJECTS_COLLECTION, PROJECT_ID))).kind).toEqual('refused');
      expect((await env.authorize('consultant', env.fetch(SF_PROJECTS_COLLECTION, PROJECT_ID))).kind).toEqual(
        'authorized'
      );
      expect((await env.authorize('nonMember', env.fetch(SF_PROJECT_PROFILES_COLLECTION, PROJECT_ID))).kind).toEqual(
        'refused'
      );
    });

    it('gives non-members no rights from user permissions or role permissions', async () => {
      const env = new TestEnvironment({
        userPermissions: { [USERS.nonMember]: ['texts.view', 'texts.edit'] },
        rolePermissions: { undefined: ['texts.view'] }
      });

      expect((await env.authorize('nonMember', env.fetch(TEXTS_COLLECTION, TEXT_1))).kind).toEqual('refused');
    });

    it('allows a versioned request spanning a delete or create only to users who may read any doc at the id', async () => {
      const env = new TestEnvironment();
      env.world.data.edit(NOTE_THREAD_COLLECTION, SF_THREAD, 3);
      // The thread is at version 4, created at version 0. Commenters may read it, but not every thread at its id.
      expect(await env.authorize('commenter', env.fetch(NOTE_THREAD_COLLECTION, SF_THREAD, 2))).toEqual({
        kind: 'authorized'
      });

      env.world.data.delete(NOTE_THREAD_COLLECTION, SF_THREAD);
      expect(await env.authorize('commenter', env.fetch(NOTE_THREAD_COLLECTION, SF_THREAD, 2))).toEqual({
        kind: 'refused',
        reason: expect.any(String),
        reply: 'silent-read-rejection'
      });
      expect((await env.authorize('admin', env.fetch(NOTE_THREAD_COLLECTION, SF_THREAD, 2))).kind).toEqual(
        'authorized'
      );

      // SUT
      env.world.data.recreate(NOTE_THREAD_COLLECTION, SF_THREAD, env.thread(SF_THREAD, true));
      const acrossRecreate: InboundDecision = await env.authorize(
        'commenter',
        env.fetch(NOTE_THREAD_COLLECTION, SF_THREAD, 2)
      );
      const fromCreate: InboundDecision = await env.authorize(
        'commenter',
        env.fetch(NOTE_THREAD_COLLECTION, SF_THREAD, 5)
      );
      const current: InboundDecision = await env.authorize(
        'commenter',
        env.fetch(NOTE_THREAD_COLLECTION, SF_THREAD, 6)
      );
      const admin: InboundDecision = await env.authorize('admin', env.fetch(NOTE_THREAD_COLLECTION, SF_THREAD, 2));

      expect(acrossRecreate).toEqual({ kind: 'refused', reason: expect.any(String), reply: 'silent-read-rejection' });
      // The client's copy at the create's version is "no doc", so the ops from there are the current doc's history.
      expect(fromCreate.kind).toEqual('authorized');
      expect(current.kind).toEqual('authorized');
      expect(admin.kind).toEqual('authorized');
    });

    it('refuses an unversioned read of a doc that exists with an error, not silently', async () => {
      const env = new TestEnvironment();

      expect(await env.authorize('commenter', env.fetch(NOTE_THREAD_COLLECTION, PT_THREAD))).toEqual({
        kind: 'refused',
        reason: expect.any(String),
        reply: 'error'
      });
    });

    it('refuses silently a read of an id where no doc is, as the server answered it with an empty snapshot', async () => {
      const env = new TestEnvironment();

      // SUT
      // A thread that is not there yet could be one that is not published to Scripture Forge.
      const commenter: InboundDecision = await env.authorize(
        'commenter',
        env.fetch(NOTE_THREAD_COLLECTION, NEW_THREAD)
      );
      const nonMember: InboundDecision = await env.authorize(
        'nonMember',
        env.fetch(TEXTS_COLLECTION, `${PROJECT_ID}:MAT:3:target`)
      );
      // The project is gone, as when a former member opens a deleted project's page.
      env.world.data.delete(SF_PROJECTS_COLLECTION, PROJECT_ID);
      const deletedProject: InboundDecision = await env.authorize(
        'admin',
        env.fetch(SF_PROJECT_PROFILES_COLLECTION, PROJECT_ID)
      );

      for (const decision of [commenter, nonMember, deletedProject]) {
        expect(decision).toEqual({ kind: 'refused', reason: expect.any(String), reply: 'silent-read-rejection' });
      }
    });

    it('records a read decision for a request with a version, at the version it was made on', async () => {
      const env = new TestEnvironment();
      env.world.data.edit(NOTE_THREAD_COLLECTION, SF_THREAD, 3);
      const grants = new ReadGrants(env.world.projects);
      const authorizer: SFInboundAuthorizer = env.authorizer('commenter', grants);

      // SUT
      await env.authorizeWith(authorizer, env.fetch(NOTE_THREAD_COLLECTION, SF_THREAD, 2));
      await env.authorizeWith(authorizer, env.fetch(NOTE_THREAD_COLLECTION, PT_THREAD, 1));
      await env.authorizeWith(authorizer, env.fetch(TEXTS_COLLECTION, TEXT_1));

      // The reply to a request with a version carries no snapshot for the egress authorizer to decide on.
      expect(grants.current(NOTE_THREAD_COLLECTION, SF_THREAD)).toEqual(
        expect.objectContaining({ allowed: true, version: 4, fields: expect.objectContaining({ publishedToSF: true }) })
      );
      // Refusals are not recorded, nor are requests without a version, whose reply has the snapshot.
      expect(grants.current(NOTE_THREAD_COLLECTION, PT_THREAD)).toBeUndefined();
      expect(grants.current(TEXTS_COLLECTION, TEXT_1)).toBeUndefined();
      // A change of membership makes the decision stale, as decisions the egress authorizer makes.
      env.world.projects.invalidate(PROJECT_ID);
      expect(grants.current(NOTE_THREAD_COLLECTION, SF_THREAD)).toBeUndefined();
    });

    it('reads the ops when the doc does not record when it was created', async () => {
      const env = new TestEnvironment();
      env.world.data.edit(NOTE_THREAD_COLLECTION, SF_THREAD, 3);
      env.world.data.delete(NOTE_THREAD_COLLECTION, SF_THREAD);
      env.world.data.recreate(NOTE_THREAD_COLLECTION, SF_THREAD, env.thread(SF_THREAD, true));
      env.world.data.forgetCreateVersion(NOTE_THREAD_COLLECTION, SF_THREAD);

      expect((await env.authorize('commenter', env.fetch(NOTE_THREAD_COLLECTION, SF_THREAD, 2))).kind).toEqual(
        'refused'
      );
      expect((await env.authorize('commenter', env.fetch(NOTE_THREAD_COLLECTION, SF_THREAD, 5))).kind).toEqual(
        'authorized'
      );
    });

    it('refuses when the database cannot be read', async () => {
      const env = new TestEnvironment();
      env.world.data.fail();

      expect((await env.authorize('admin', env.fetch(TEXTS_COLLECTION, TEXT_1))).kind).toEqual('refused');
    });
  });

  describe('bulk requests and known query results', () => {
    it('refuses only the docs that may not be read', async () => {
      const env = new TestEnvironment();

      const decision: InboundDecision = await env.authorize('commenter', {
        kind: 'bulk-subscribe',
        collection: NOTE_THREAD_COLLECTION,
        docs: { form: 'ids', ids: [SF_THREAD, PT_THREAD] }
      });

      expect(decision).toEqual({
        kind: 'partially-authorized',
        refusedDocs: new Map([[PT_THREAD, expect.any(String)]]),
        silentlyRefusedDocs: new Set()
      });
    });

    it('checks the versions of a bulk request, and refuses docs gone since then silently', async () => {
      const env = new TestEnvironment();
      const deletedThread = `${PROJECT_ID}:sfthread02`;
      env.world.data.put(NOTE_THREAD_COLLECTION, deletedThread, env.thread(deletedThread, true));
      env.world.data.delete(NOTE_THREAD_COLLECTION, deletedThread);

      const decision: InboundDecision = await env.authorize('commenter', {
        kind: 'bulk-subscribe',
        collection: NOTE_THREAD_COLLECTION,
        docs: {
          form: 'versions',
          versions: new Map([
            [SF_THREAD, 1],
            [deletedThread, 1],
            [PT_THREAD, 1]
          ])
        }
      });

      expect(decision).toEqual({
        kind: 'partially-authorized',
        refusedDocs: new Map([
          [deletedThread, expect.any(String)],
          [PT_THREAD, expect.any(String)]
        ]),
        silentlyRefusedDocs: new Set([deletedThread])
      });
    });

    it('checks the docs a query subscribe names in r, and gives refused ones a version that reveals nothing', async () => {
      const env = new TestEnvironment();
      env.world.data.edit(NOTE_THREAD_COLLECTION, PT_THREAD, 2);
      const deletedThread = `${PROJECT_ID}:sfthread02`;
      env.world.data.put(NOTE_THREAD_COLLECTION, deletedThread, env.thread(deletedThread, true));
      env.world.data.delete(NOTE_THREAD_COLLECTION, deletedThread);
      const recreatedThread = `${PROJECT_ID}:sfthread03`;
      env.world.data.put(NOTE_THREAD_COLLECTION, recreatedThread, env.thread(recreatedThread, false));
      env.world.data.delete(NOTE_THREAD_COLLECTION, recreatedThread);
      env.world.data.recreate(NOTE_THREAD_COLLECTION, recreatedThread, env.thread(recreatedThread, true));
      const subject: InboundAuthorizationSubject = {
        kind: 'query',
        message: {
          kind: 'query-subscribe',
          queryId: 1,
          collection: NOTE_THREAD_COLLECTION,
          query: { projectRef: PROJECT_ID },
          knownResults: [
            { docId: SF_THREAD, version: 1 },
            { docId: PT_THREAD, version: null },
            { docId: deletedThread, version: 1 },
            { docId: recreatedThread, version: 1 }
          ]
        },
        query: {
          entryName: 'test',
          collection: NOTE_THREAD_COLLECTION,
          extraIsSafe: false,
          authorize: async () => ({ kind: 'authorized' }),
          build: async () => ({})
        },
        src: SRC
      };

      const decision: InboundDecision = await env.authorizer('commenter').authorize(subject);

      expect(decision).toEqual({
        kind: 'partially-authorized',
        refusedDocs: new Map([
          [PT_THREAD, expect.any(String)],
          [deletedThread, expect.any(String)],
          [recreatedThread, expect.any(String)]
        ]),
        // ShareDB sends no op and no snapshot of a doc named at its current version, and a remove if the query does
        // not return it. The thread that may be read now, but not across its delete and create, is sent as it is now.
        knownResultVersions: new Map([
          [PT_THREAD, 3],
          [deletedThread, 2],
          [recreatedThread, null]
        ])
      });
    });
  });

  describe('ops', () => {
    it.each<[TestUserName, string, boolean]>([
      ['admin', TEXT_1, true],
      ['admin', TEXT_2, true],
      ['translator', TEXT_1, true],
      // The chapter's own permission (read) wins over the book's (write).
      ['translator', TEXT_2, false],
      // A consultant has no texts edit right, whatever the Paratext permission.
      ['consultant', TEXT_1, false],
      ['checker', TEXT_1, false],
      ['nonMember', TEXT_1, false],
      // A chapter the project does not list has no permission.
      ['admin', `${PROJECT_ID}:MAT:3:target`, false]
    ])('lets %s edit %s: %s', async (user: TestUserName, textId: string, allowed: boolean) => {
      const env = new TestEnvironment();

      const decision: InboundDecision = await env.authorize(user, {
        kind: 'edit-op',
        collection: TEXTS_COLLECTION,
        docId: textId,
        src: SRC,
        seq: 1,
        source: 'Editor',
        version: 1,
        edit: { otType: 'rich-text', ops: [{ kind: 'insert-text', text: 'a', attributes: null }] }
      });

      expect(decision.kind).toEqual(allowed ? 'authorized' : 'refused');
    });

    it('refuses creates in collections clients do not create in, and creates at a foreign project', async () => {
      const env = new TestEnvironment();

      const decision: InboundDecision = await env.authorize('admin', {
        kind: 'create-op',
        collection: TRAINING_DATA_COLLECTION,
        docId: `${PROJECT_ID}:data01`,
        src: SRC,
        seq: 1,
        source: null,
        version: null,
        data: { projectRef: 'cccccccccccccccccccccccc', ownerRef: USERS.admin }
      });

      expect(decision.kind).toEqual('refused');
    });
  });

  describe('snapshot fetch by version', () => {
    it('needs read access to the doc now and at that version', async () => {
      const env = new TestEnvironment();
      env.world.data.edit(NOTE_THREAD_COLLECTION, SF_THREAD, 2);

      const allowed: InboundDecision = await env.authorize('commenter', env.snapshotFetch(SF_THREAD, 2));
      const tooNew: InboundDecision = await env.authorize('commenter', env.snapshotFetch(SF_THREAD, 9));
      const unreadable: InboundDecision = await env.authorize('commenter', env.snapshotFetch(PT_THREAD, 1));

      expect(allowed.kind).toEqual('authorized');
      expect(tooNew.kind).toEqual('refused');
      expect(unreadable.kind).toEqual('refused');
    });

    it('refuses a version that would take too many ops to rebuild', async () => {
      const env = new TestEnvironment();
      env.world.data.edit(NOTE_THREAD_COLLECTION, SF_THREAD, MAX_REPLAYED_OPS + 1);

      // SUT
      const decision: InboundDecision = await env.authorize(
        'commenter',
        env.snapshotFetch(SF_THREAD, MAX_REPLAYED_OPS + 1)
      );

      expect(decision.kind).toEqual('refused');
    });
  });

  describe('presence', () => {
    it('lets members, but not others, subscribe to a text presence channel', async () => {
      const env = new TestEnvironment();
      const subscribe = (): InboundMessage => ({
        kind: 'presence-subscribe',
        channel: env.channel('plain', TEXT_1),
        seq: 1
      });

      expect((await env.authorize('sfObserver', subscribe())).kind).toEqual('authorized');
      expect((await env.authorize('nonMember', subscribe())).kind).toEqual('refused');
    });

    it("rebuilds the viewer's name and avatar from their user doc", async () => {
      const env = new TestEnvironment();
      env.world.data.put(USERS_COLLECTION, USERS.translator, {
        displayName: 'Real Name',
        avatarUrl: 'https://example.com/avatar.png',
        authId: 'google-oauth2|123'
      });

      const decision: InboundDecision = await env.authorize('translator', env.channelPresence('Impostor'));

      const expected: ViewerPresence = {
        displayName: 'Real Name',
        avatarUrl: 'https://example.com/avatar.png',
        cursorColor: '#123456',
        activeInEditor: true
      };
      expect(decision).toEqual({ kind: 'authorized-with-viewer', viewer: expected });
    });

    it("sends an empty name, not the client's, when the user has none, and leaves out an avatar the client would", async () => {
      const env = new TestEnvironment();
      env.world.data.put(USERS_COLLECTION, USERS.translator, {
        displayName: '',
        avatarUrl: 'https://example.com/avatar.png',
        authId: 'unknown'
      });

      const decision: InboundDecision = await env.authorize('translator', env.channelPresence('Anonymous'));

      expect(decision.kind === 'authorized-with-viewer' && decision.viewer.displayName).toEqual('');
      expect(decision.kind === 'authorized-with-viewer' && decision.viewer.avatarUrl).toEqual('');
    });

    it('binds a presence id to the first connection that uses it', async () => {
      const env = new TestEnvironment();
      env.world.data.put(USERS_COLLECTION, USERS.translator, { displayName: 'T', avatarUrl: '', authId: '' });
      env.world.data.put(USERS_COLLECTION, USERS.admin, { displayName: 'A', avatarUrl: '', authId: '' });

      const first: InboundDecision = await env.authorize('translator', env.channelPresence('T'), 'srcA');
      const again: InboundDecision = await env.authorize('translator', env.channelPresence('T'), 'srcA');
      const other: InboundDecision = await env.authorize('admin', env.channelPresence('A'), 'srcB');
      const left: InboundDecision = await env.authorize(
        'admin',
        {
          kind: 'doc-presence',
          collection: TEXTS_COLLECTION,
          docId: TEXT_1,
          channel: env.channel('doc', TEXT_1),
          presenceId: PRESENCE_ID,
          range: null,
          presenceVersion: 1,
          version: 1
        },
        'srcB'
      );

      expect(first.kind).toEqual('authorized-with-viewer');
      expect(again.kind).toEqual('authorized-with-viewer');
      expect(other.kind).toEqual('refused');
      // The id is bound on every channel, so it cannot be taken on the doc presence channel either.
      expect(left.kind).toEqual('refused');
    });

    it('lets a connection clear the presence it sent under its own id, even after it lost access to the text', async () => {
      const env = new TestEnvironment();
      env.world.data.put(USERS_COLLECTION, USERS.translator, { displayName: 'T', avatarUrl: '', authId: '' });
      const channelClear: InboundMessage = env.channelPresence(null);
      const docClear: InboundMessage = {
        kind: 'doc-presence',
        channel: env.channel('doc', TEXT_1),
        collection: TEXTS_COLLECTION,
        docId: TEXT_1,
        presenceId: PRESENCE_ID,
        range: null,
        presenceVersion: 1,
        version: 1
      };
      expect((await env.authorize('translator', env.channelPresence('T'), 'srcA')).kind).toEqual(
        'authorized-with-viewer'
      );
      const roles: Record<string, string> = { ...(testProjectData().userRoles as Record<string, string>) };
      delete roles[USERS.translator];
      env.world.data.put(SF_PROJECTS_COLLECTION, PROJECT_ID, testProjectData({ userRoles: roles }));
      env.world.projects.invalidate(PROJECT_ID);

      // SUT
      const clearedViewer: InboundDecision = await env.authorize('translator', channelClear, 'srcA');
      const clearedCursor: InboundDecision = await env.authorize('translator', docClear, 'srcA');
      const viewer: InboundDecision = await env.authorize('translator', env.channelPresence('T'), 'srcA');
      const otherConnection: InboundDecision = await env.authorize('translator', channelClear, 'srcB');
      const unboundId: InboundDecision = await env.authorize(
        'nonMember',
        env.channelPresence(null, OTHER_PRESENCE_ID),
        'srcC'
      );

      expect(clearedViewer).toEqual({ kind: 'authorized' });
      expect(clearedCursor).toEqual({ kind: 'authorized' });
      expect(viewer.kind).toEqual('refused');
      expect(otherConnection.kind).toEqual('refused');
      expect(unboundId.kind).toEqual('refused');
    });

    it('holds the presence ids of a connection until it closes', async () => {
      const env = new TestEnvironment();
      env.world.data.put(USERS_COLLECTION, USERS.translator, { displayName: 'T', avatarUrl: '', authId: '' });
      env.world.data.put(USERS_COLLECTION, USERS.admin, { displayName: 'A', avatarUrl: '', authId: '' });
      const authorizer: SFInboundAuthorizer = env.authorizer('translator');
      await env.authorizeWith(authorizer, env.channelPresence('T'), 'srcA');
      expect(env.presenceIds.isBoundTo(PRESENCE_ID, 'srcA')).toBe(true);

      // SUT
      authorizer.connectionClosed();

      // Released, but kept for the src, so that the client finds it again when it reconnects.
      expect(env.presenceIds.isBoundTo(PRESENCE_ID, 'srcA')).toBe(true);
      expect((await env.authorize('admin', env.channelPresence('A'), 'srcB')).kind).toEqual('refused');
      expect((await env.authorize('translator', env.channelPresence('T'), 'srcA')).kind).toEqual(
        'authorized-with-viewer'
      );
    });

    it('refuses presence for a text the user may not read', async () => {
      const env = new TestEnvironment();

      const decision: InboundDecision = await env.authorize('nonMember', env.channelPresence('X'));

      expect(decision.kind).toEqual('refused');
    });
  });
});

/** An authorizer over a TestWorld with texts, note threads and a presence binding table. */
class TestEnvironment {
  readonly world: TestWorld;
  readonly presenceIds = new PresenceIdBindings();

  constructor(projectOverrides: Record<string, unknown> = {}) {
    this.world = new TestWorld({ ...testProjectData(), ...projectOverrides });
    this.world.data.putText(TEXT_1);
    this.world.data.putText(TEXT_2);
    this.world.data.put(NOTE_THREAD_COLLECTION, PT_THREAD, this.thread(PT_THREAD, false));
    this.world.data.put(NOTE_THREAD_COLLECTION, SF_THREAD, this.thread(SF_THREAD, true));
  }

  authorizer(user: TestUserName, grants: ReadGrants = new ReadGrants(this.world.projects)): SFInboundAuthorizer {
    return new SFInboundAuthorizer(
      sessionFor(user),
      {
        projects: this.world.projects,
        profiles: this.world.profiles,
        data: this.world.data,
        presenceIds: this.presenceIds
      },
      grants
    );
  }

  authorize(user: TestUserName, message: InboundMessage, src: string = SRC): Promise<InboundDecision> {
    return this.authorizeWith(this.authorizer(user), message, src);
  }

  authorizeWith(authorizer: SFInboundAuthorizer, message: InboundMessage, src: string = SRC): Promise<InboundDecision> {
    if (
      message.kind === 'handshake' ||
      message.kind === 'unsubscribe' ||
      message.kind === 'bulk-unsubscribe' ||
      message.kind === 'query-unsubscribe' ||
      message.kind === 'presence-unsubscribe' ||
      message.kind === 'query-fetch' ||
      message.kind === 'query-subscribe'
    ) {
      throw new Error('not an authorizable message');
    }
    return authorizer.authorize({ kind: 'message', message: message, src: src });
  }

  fetch(collection: string, docId: string, version: number | null = null): InboundMessage {
    return { kind: 'fetch', collection: collection, docId: docId, version: version };
  }

  snapshotFetch(docId: string, version: number): InboundMessage {
    return { kind: 'snapshot-fetch', collection: NOTE_THREAD_COLLECTION, docId: docId, requestId: 1, version: version };
  }

  channel<F extends 'plain' | 'doc'>(form: F, docId: string): PresenceChannel & { form: F } {
    return {
      form: form,
      name: `${TEXTS_COLLECTION}${form === 'plain' ? ':' : '.'}${docId}`,
      collection: TEXTS_COLLECTION,
      docId: docId
    };
  }

  /** A viewer's presence on TEXT_1, or with a null name, the presence that clears it. */
  channelPresence(displayName: string | null, presenceId: string = PRESENCE_ID): InboundMessage {
    return {
      kind: 'channel-presence',
      channel: this.channel('plain', TEXT_1),
      presenceId: presenceId,
      viewer:
        displayName == null
          ? null
          : {
              displayName: displayName,
              avatarUrl: 'https://evil.example/x.png',
              cursorColor: '#123456',
              activeInEditor: true
            },
      presenceVersion: 0
    };
  }

  thread(docId: string, publishedToSF: boolean): Record<string, unknown> {
    return {
      dataId: docId.split(':')[1],
      projectRef: PROJECT_ID,
      ownerRef: USERS.admin,
      publishedToSF: publishedToSF,
      notes: []
    };
  }
}
