import { MAX_REPLAYED_OPS } from '../../common/gateway/gateway-data-source';
import {
  AuthorizableOutboundMessage,
  EgressContext,
  EgressDecision,
  MatchedQuery
} from '../../common/gateway/authorization';
import { EditOpRequest, InboundMessage } from '../../common/gateway/inbound-messages';
import { OpMessage, OutboundOpContent, OutboundSnapshot, ResultSnapshot } from '../../common/gateway/outbound-messages';
import { JSON0_TYPE_URI, RICH_TEXT_TYPE_URI } from '../../common/gateway/protocol-config';
import { USER_PROFILES_COLLECTION } from '../../common/models/user';
import { NOTE_THREAD_COLLECTION } from '../models/note-thread';
import { QUESTIONS_COLLECTION } from '../models/question';
import { SF_PROJECT_PROFILES_COLLECTION, SF_PROJECTS_COLLECTION } from '../models/sf-project';
import { SF_PROJECT_USER_CONFIGS_COLLECTION } from '../models/sf-project-user-config';
import { TEXTS_COLLECTION } from '../models/text-data';
import {
  OTHER_PROJECT_ID,
  PROJECT_ID,
  sessionFor,
  testProjectData,
  TestUserName,
  TestWorld,
  USERS
} from './test-gateway-world';
import { PresenceIdBindings } from './presence-bindings';
import { MAX_READ_GRANTS, ReadGrants } from './read-grants';
import { SFEgressAuthorizer } from './sf-egress-authorizer';
import { SFGatewayServices, SFInboundAuthorizer } from './sf-inbound-authorizer';

const TEXT_1 = `${PROJECT_ID}:MAT:1:target`;
const PT_THREAD = `${PROJECT_ID}:ptthread01`;
const SF_THREAD = `${PROJECT_ID}:sfthread01`;
const NEW_THREAD = `${PROJECT_ID}:newthread01`;
const QUESTION = `${PROJECT_ID}:question01`;
/** A question made long ago whose id names another project than its `projectRef`. */
const LEGACY_QUESTION = `${OTHER_PROJECT_ID}:question02`;
const QUERY_ID = 7;

describe('SFEgressAuthorizer', () => {
  describe('snapshots', () => {
    it('sends a snapshot the user may read, and withholds one they may not', async () => {
      const env = new TestEnvironment();

      const allowed: EgressDecision = await env.authorize(
        'commenter',
        env.fetchReply(NOTE_THREAD_COLLECTION, SF_THREAD)
      );
      const refused: EgressDecision = await env.authorize(
        'commenter',
        env.fetchReply(NOTE_THREAD_COLLECTION, PT_THREAD)
      );

      expect(allowed).toEqual({ kind: 'send' });
      expect(refused).toEqual({
        kind: 'withhold',
        reason: expect.any(String),
        end: [{ kind: 'doc', collection: NOTE_THREAD_COLLECTION, docId: PT_THREAD }]
      });
    });

    it('decides an existing doc by the project its data names, not by its id', async () => {
      const env = new TestEnvironment();

      expect(await env.authorize('checker', env.fetchReply(QUESTIONS_COLLECTION, LEGACY_QUESTION))).toEqual({
        kind: 'send'
      });
      expect((await env.authorize('nonMember', env.fetchReply(QUESTIONS_COLLECTION, LEGACY_QUESTION))).kind).toEqual(
        'withhold'
      );
    });

    it('decides a doc that does not exist by its id', async () => {
      const env = new TestEnvironment();
      const missing: OutboundSnapshot = { exists: false, version: 0 };

      expect(await env.authorize('admin', env.fetchReply(NOTE_THREAD_COLLECTION, NEW_THREAD, missing))).toEqual({
        kind: 'send'
      });
      // Whether a thread that does not exist yet would be published is not known.
      expect(
        (await env.authorize('commenter', env.fetchReply(NOTE_THREAD_COLLECTION, NEW_THREAD, missing))).kind
      ).toEqual('withhold');
    });

    it('sends the reply to a request with a version, whose ops were decided one by one', async () => {
      const env = new TestEnvironment();

      const decision: EgressDecision = await env.authorize('nonMember', {
        kind: 'subscribe-reply',
        collection: TEXTS_COLLECTION,
        docId: TEXT_1,
        snapshot: null
      });

      expect(decision).toEqual({ kind: 'send' });
    });

    it('withholds only the docs of a bulk reply that the user may not read', async () => {
      const env = new TestEnvironment();

      const decision: EgressDecision = await env.authorize('commenter', {
        kind: 'bulk-subscribe-reply',
        collection: NOTE_THREAD_COLLECTION,
        snapshots: new Map([
          [SF_THREAD, { kind: 'snapshot', snapshot: env.snapshotOf(NOTE_THREAD_COLLECTION, SF_THREAD) }],
          [PT_THREAD, { kind: 'snapshot', snapshot: env.snapshotOf(NOTE_THREAD_COLLECTION, PT_THREAD) }],
          [NEW_THREAD, { kind: 'error', error: { code: 'X', message: 'refused' } }]
        ])
      });

      expect(decision).toEqual({
        kind: 'withhold-docs',
        reason: expect.any(String),
        docIds: new Set([PT_THREAD]),
        end: [{ kind: 'doc', collection: NOTE_THREAD_COLLECTION, docId: PT_THREAD }]
      });
    });

    it('decides a projection whose read depends on the doc from the stored doc', async () => {
      const env = new TestEnvironment();
      // A projection could leave out what the decision depends on, so the projected data is not trusted.
      const projected: OutboundSnapshot = { exists: true, version: 1, type: JSON0_TYPE_URI, data: { name: 'x' } };

      const member: EgressDecision = await env.authorize(
        'commenter',
        env.fetchReply(SF_PROJECT_PROFILES_COLLECTION, PROJECT_ID, projected)
      );
      const outsider: EgressDecision = await env.authorize(
        'nonMember',
        env.fetchReply(SF_PROJECT_PROFILES_COLLECTION, PROJECT_ID, projected)
      );

      expect(member).toEqual({ kind: 'send' });
      expect(outsider.kind).toEqual('withhold');
      expect(env.world.data.reads).toContain(`${SF_PROJECTS_COLLECTION}/${PROJECT_ID}`);
    });

    it('sends user profiles to anyone', async () => {
      const env = new TestEnvironment();
      const profile: OutboundSnapshot = { exists: true, version: 1, type: JSON0_TYPE_URI, data: { displayName: 'A' } };

      expect(await env.authorize('nonMember', env.fetchReply(USER_PROFILES_COLLECTION, USERS.admin, profile))).toEqual({
        kind: 'send'
      });
    });

    it("withholds another user's project config", async () => {
      const env = new TestEnvironment();
      const config: OutboundSnapshot = {
        exists: true,
        version: 1,
        type: JSON0_TYPE_URI,
        data: { projectRef: PROJECT_ID, ownerRef: USERS.admin }
      };
      const configId = `${PROJECT_ID}:${USERS.admin}`;

      expect(
        await env.authorize('admin', env.fetchReply(SF_PROJECT_USER_CONFIGS_COLLECTION, configId, config))
      ).toEqual({ kind: 'send' });
      expect(
        (await env.authorize('translator', env.fetchReply(SF_PROJECT_USER_CONFIGS_COLLECTION, configId, config))).kind
      ).toEqual('withhold');
    });
  });

  describe('queries', () => {
    it('sends results the user may read, and withholds the whole reply otherwise', async () => {
      const env = new TestEnvironment();
      const query: MatchedQuery = env.query(NOTE_THREAD_COLLECTION, true);

      const readable: EgressDecision = await env.authorize(
        'commenter',
        env.queryReply([env.result(NOTE_THREAD_COLLECTION, SF_THREAD)]),
        { query: query }
      );
      const unreadable: EgressDecision = await env.authorize(
        'commenter',
        env.queryReply([env.result(NOTE_THREAD_COLLECTION, SF_THREAD), env.result(NOTE_THREAD_COLLECTION, PT_THREAD)]),
        { query: query }
      );

      expect(readable).toEqual({ kind: 'send' });
      expect(unreadable).toEqual({
        kind: 'withhold',
        reason: expect.any(String),
        end: [{ kind: 'query', queryId: QUERY_ID }]
      });
    });

    it('withholds a diff with an unreadable insert and ends the query; removes and moves reveal nothing', async () => {
      const env = new TestEnvironment();
      const query: MatchedQuery = env.query(NOTE_THREAD_COLLECTION, true);

      const insert: EgressDecision = await env.authorize(
        'commenter',
        {
          kind: 'query-diff',
          queryId: QUERY_ID,
          diff: [
            { kind: 'insert', index: 0, values: [env.result(NOTE_THREAD_COLLECTION, SF_THREAD)] },
            { kind: 'insert', index: 1, values: [env.result(NOTE_THREAD_COLLECTION, PT_THREAD)] }
          ]
        },
        { query: query }
      );
      const remove: EgressDecision = await env.authorize(
        'nonMember',
        {
          kind: 'query-diff',
          queryId: QUERY_ID,
          diff: [
            { kind: 'remove', index: 0, howMany: 1 },
            { kind: 'move', from: 0, to: 1, howMany: 1 }
          ]
        },
        { query: query }
      );

      expect(insert).toEqual({
        kind: 'withhold',
        reason: expect.any(String),
        end: [{ kind: 'query', queryId: QUERY_ID }]
      });
      expect(remove).toEqual({ kind: 'send' });
    });

    it('sends extra only for queries whose count is safe', async () => {
      const env = new TestEnvironment();
      const extra: AuthorizableOutboundMessage = {
        kind: 'query-extra',
        queryId: QUERY_ID,
        hasExtra: true,
        extra: 3
      };

      expect(await env.authorize('admin', extra, { query: env.query(QUESTIONS_COLLECTION, true) })).toEqual({
        kind: 'send'
      });
      expect((await env.authorize('admin', extra, { query: env.query(QUESTIONS_COLLECTION, false) })).kind).toEqual(
        'withhold'
      );
      expect(
        (
          await env.authorize('admin', env.queryReply([], 3), {
            query: env.query(QUESTIONS_COLLECTION, false)
          })
        ).kind
      ).toEqual('withhold');
    });

    it('ends the query when a message about it cannot be checked', async () => {
      const env = new TestEnvironment();
      const query: MatchedQuery = env.query(NOTE_THREAD_COLLECTION, true);
      env.world.data.fail();

      const reply: EgressDecision = await env.authorize(
        'commenter',
        env.queryReply([env.result(NOTE_THREAD_COLLECTION, SF_THREAD)]),
        { query: query }
      );
      const diff: EgressDecision = await env.authorize(
        'commenter',
        {
          kind: 'query-diff',
          queryId: QUERY_ID,
          diff: [{ kind: 'insert', index: 0, values: [env.result(NOTE_THREAD_COLLECTION, SF_THREAD)] }]
        },
        { query: query }
      );

      const endsQuery: EgressDecision = {
        kind: 'withhold',
        reason: 'the message could not be checked',
        end: [{ kind: 'query', queryId: QUERY_ID }]
      };
      expect(reply).toEqual(endsQuery);
      expect(diff).toEqual(endsQuery);
    });

    it('withholds what belongs to a query it does not know', async () => {
      const env = new TestEnvironment();

      expect((await env.authorize('admin', env.queryReply([]))).kind).toEqual('withhold');
    });
  });

  describe('ops', () => {
    it('decides a stream of ops on a text from one read of the database', async () => {
      const env = new TestEnvironment();
      const authorizer: SFEgressAuthorizer = env.authorizer('translator');

      const decisions: EgressDecision[] = [];
      for (let version = 1; version <= 50; version++) {
        decisions.push(await env.authorizeWith(authorizer, env.op(TEXTS_COLLECTION, TEXT_1, version)));
      }

      expect(decisions.every(decision => decision.kind === 'send')).toBe(true);
      expect(env.world.data.reads.filter(read => read.startsWith(TEXTS_COLLECTION)).length).toEqual(1);
    });

    it('withholds ops to a user who may not read the doc, and ends the subscription', async () => {
      const env = new TestEnvironment();

      expect(await env.authorize('nonMember', env.op(TEXTS_COLLECTION, TEXT_1, 1))).toEqual({
        kind: 'withhold',
        reason: expect.any(String),
        end: [{ kind: 'doc', collection: TEXTS_COLLECTION, docId: TEXT_1 }]
      });
    });

    it('decides again once the project may have changed, and withholds after the user was removed', async () => {
      const env = new TestEnvironment();
      const authorizer: SFEgressAuthorizer = env.authorizer('translator');
      expect((await env.authorizeWith(authorizer, env.op(TEXTS_COLLECTION, TEXT_1, 1))).kind).toEqual('send');

      const roles: Record<string, string> = { ...(testProjectData().userRoles as Record<string, string>) };
      delete roles[USERS.translator];
      env.world.data.put(SF_PROJECTS_COLLECTION, PROJECT_ID, testProjectData({ userRoles: roles }));
      env.world.projects.invalidate(PROJECT_ID);

      expect((await env.authorizeWith(authorizer, env.op(TEXTS_COLLECTION, TEXT_1, 2))).kind).toEqual('withhold');
    });

    it('decides again after an op that changes what reading depends on', async () => {
      const env = new TestEnvironment();
      const authorizer: SFEgressAuthorizer = env.authorizer('commenter');
      expect(await env.authorizeWith(authorizer, env.fetchReply(NOTE_THREAD_COLLECTION, SF_THREAD))).toEqual({
        kind: 'send'
      });
      const readsBefore: number = env.world.data.reads.length;
      expect((await env.authorizeWith(authorizer, env.op(NOTE_THREAD_COLLECTION, SF_THREAD, 1))).kind).toEqual('send');
      expect(env.world.data.reads.length).toEqual(readsBefore);

      // The thread is no longer published to Scripture Forge.
      env.world.data.put(NOTE_THREAD_COLLECTION, SF_THREAD, env.thread(false), { edits: 2 });
      const unpublish: OpMessage = env.op(NOTE_THREAD_COLLECTION, SF_THREAD, 2, {
        kind: 'edit',
        op: [{ p: ['publishedToSF'], od: true, oi: false }]
      });

      // The op itself is of the thread while it was published, so it is sent; what comes after it is not.
      expect((await env.authorizeWith(authorizer, unpublish)).kind).toEqual('send');
      expect((await env.authorizeWith(authorizer, env.op(NOTE_THREAD_COLLECTION, SF_THREAD, 3))).kind).toEqual(
        'withhold'
      );
    });

    it('sends the op that removes the user from the project, even right after another change of roles', async () => {
      const env = new TestEnvironment();
      const authorizer: SFEgressAuthorizer = env.authorizer('translator');
      const projected: OutboundSnapshot = { exists: true, version: 1, type: JSON0_TYPE_URI, data: {} };
      await env.authorizeWith(authorizer, env.fetchReply(SF_PROJECT_PROFILES_COLLECTION, PROJECT_ID, projected));
      const readsBefore: number = env.world.data.reads.length;
      const roleOp = (version: number, component: Record<string, unknown>): OpMessage =>
        env.op(SF_PROJECT_PROFILES_COLLECTION, PROJECT_ID, version, { kind: 'edit', op: [component] });

      const joined: EgressDecision = await env.authorizeWith(
        authorizer,
        roleOp(1, { p: ['userRoles', USERS.nonMember], oi: 'sf_commenter' })
      );
      const removed: EgressDecision = await env.authorizeWith(
        authorizer,
        roleOp(2, { p: ['userRoles', USERS.translator], od: 'pt_translator' })
      );
      const after: EgressDecision = await env.authorizeWith(
        authorizer,
        env.op(SF_PROJECT_PROFILES_COLLECTION, PROJECT_ID, 3)
      );

      expect(joined).toEqual({ kind: 'send' });
      expect(removed).toEqual({ kind: 'send' });
      expect(after.kind).toEqual('withhold');
      // The fields the decision depends on were followed through the ops, without reading the project again.
      expect(env.world.data.reads.length).toEqual(readsBefore);
    });

    it('decides an op it has no decision for as of the doc before the op', async () => {
      const env = new TestEnvironment();
      // No decision is known, as after a subscribe with a version that the inbound authorizer did not record.
      const authorizer: SFEgressAuthorizer = env.authorizer('translator');
      env.removeFromProject(USERS.translator);
      const removal: OpMessage = env.op(SF_PROJECT_PROFILES_COLLECTION, PROJECT_ID, 1, {
        kind: 'edit',
        op: [{ p: ['userRoles', USERS.translator], od: 'pt_translator' }]
      });

      // SUT
      const removed: EgressDecision = await env.authorizeWith(authorizer, removal);
      const after: EgressDecision = await env.authorizeWith(
        authorizer,
        env.op(SF_PROJECT_PROFILES_COLLECTION, PROJECT_ID, 2)
      );

      // The project was read as it was at the op's version: the translator was a member then.
      expect(removed).toEqual({ kind: 'send' });
      expect(env.world.data.versionReads).toEqual([`${SF_PROJECTS_COLLECTION}/${PROJECT_ID}@1`]);
      expect(after.kind).toEqual('withhold');
    });

    it('decides an op it has no decision for from the stored doc when later ops leave what reading depends on', async () => {
      const env = new TestEnvironment();
      const authorizer: SFEgressAuthorizer = env.authorizer('checker');
      env.world.data.edit(QUESTIONS_COLLECTION, QUESTION, 1, [{ p: ['text'], oi: 'first' }]);
      env.world.data.edit(QUESTIONS_COLLECTION, QUESTION, 2, [{ p: ['text'], oi: 'later' }]);

      // SUT
      const decision: EgressDecision = await env.authorizeWith(
        authorizer,
        env.op(QUESTIONS_COLLECTION, QUESTION, 1, { kind: 'edit', op: [{ p: ['text'], oi: 'first' }] })
      );

      expect(decision).toEqual({ kind: 'send' });
      // The ops stored after this one were read, not the whole history.
      expect(env.world.data.opReads).toEqual([`${QUESTIONS_COLLECTION}/${QUESTION}@2..4`]);
      expect(env.world.data.versionReads).toEqual([]);
    });

    it('rebuilds the doc as it was before an op only when later ops may change what reading depends on', async () => {
      const env = new TestEnvironment();
      const authorizer: SFEgressAuthorizer = env.authorizer('checker');
      env.world.data.edit(QUESTIONS_COLLECTION, QUESTION, 1, [{ p: ['text'], oi: 'first' }]);
      env.world.data.edit(QUESTIONS_COLLECTION, QUESTION, 1, [{ p: ['ownerRef'], od: USERS.admin, oi: USERS.admin }]);

      // SUT
      const decision: EgressDecision = await env.authorizeWith(
        authorizer,
        env.op(QUESTIONS_COLLECTION, QUESTION, 1, { kind: 'edit', op: [{ p: ['text'], oi: 'first' }] })
      );

      expect(decision).toEqual({ kind: 'send' });
      expect(env.world.data.versionReads).toEqual([`${QUESTIONS_COLLECTION}/${QUESTION}@1`]);
    });

    it('withholds, without ending the subscription, an op whose decision would rebuild too much history', async () => {
      const env = new TestEnvironment();
      const authorizer: SFEgressAuthorizer = env.authorizer('checker');
      env.world.data.edit(QUESTIONS_COLLECTION, QUESTION, MAX_REPLAYED_OPS + 5);

      // SUT
      const decision: EgressDecision = await env.authorizeWith(
        authorizer,
        env.op(QUESTIONS_COLLECTION, QUESTION, MAX_REPLAYED_OPS + 2, {
          kind: 'edit',
          op: [{ p: ['ownerRef'], od: USERS.admin, oi: USERS.admin }]
        })
      );

      expect(decision).toEqual({ kind: 'withhold', reason: 'the message could not be checked', end: [] });
    });

    it('decides the ops after a subscribe with a version from the decision the inbound authorizer recorded', async () => {
      const env = new TestEnvironment();
      const grants = new ReadGrants(env.world.projects);
      const inbound = new SFInboundAuthorizer(sessionFor('translator'), env.services(), grants);
      const authorizer: SFEgressAuthorizer = env.authorizer('translator', {}, grants);
      const subscribe: InboundMessage = {
        kind: 'subscribe',
        collection: SF_PROJECT_PROFILES_COLLECTION,
        docId: PROJECT_ID,
        version: 1
      };
      expect(await inbound.authorize({ kind: 'message', message: subscribe, src: 'src' })).toEqual({
        kind: 'authorized'
      });
      env.removeFromProject(USERS.translator);
      const readsBefore: number = env.world.data.reads.length;

      // SUT
      const removed: EgressDecision = await env.authorizeWith(
        authorizer,
        env.op(SF_PROJECT_PROFILES_COLLECTION, PROJECT_ID, 1, {
          kind: 'edit',
          op: [{ p: ['userRoles', USERS.translator], od: 'pt_translator' }]
        })
      );

      expect(removed).toEqual({ kind: 'send' });
      expect(env.world.data.reads.length).toEqual(readsBefore);
      expect(env.world.data.versionReads).toEqual([]);
    });

    it('withholds an op it has no decision for when the user could not read the doc before it', async () => {
      const env = new TestEnvironment();
      const authorizer: SFEgressAuthorizer = env.authorizer('commenter');
      // The thread is published by the op; before it, the commenter could not read it.
      env.world.data.editData(NOTE_THREAD_COLLECTION, PT_THREAD, env.thread(true));

      const decision: EgressDecision = await env.authorizeWith(
        authorizer,
        env.op(NOTE_THREAD_COLLECTION, PT_THREAD, 1, {
          kind: 'edit',
          op: [{ p: ['publishedToSF'], od: false, oi: true }]
        })
      );

      expect(decision.kind).toEqual('withhold');
    });

    it('sends a delete to a connection that was allowed to read the doc, even after the user lost access', async () => {
      const env = new TestEnvironment();
      const authorizer: SFEgressAuthorizer = env.authorizer('translator');
      expect(await env.authorizeWith(authorizer, env.fetchReply(QUESTIONS_COLLECTION, QUESTION))).toEqual({
        kind: 'send'
      });
      env.removeFromProject(USERS.translator);
      env.world.data.delete(QUESTIONS_COLLECTION, QUESTION);
      const deleteOp = (docId: string): OpMessage => env.op(QUESTIONS_COLLECTION, docId, 1, { kind: 'delete' });

      // SUT
      const deleted: EgressDecision = await env.authorizeWith(authorizer, deleteOp(QUESTION));
      const neverRead: EgressDecision = await env.authorize('nonMember', deleteOp(QUESTION));
      // A doc created at the same id later is a new doc, which the connection has not been allowed to read.
      const deletedAgain: EgressDecision = await env.authorizeWith(authorizer, deleteOp(QUESTION));

      expect(deleted).toEqual({ kind: 'send' });
      expect(neverRead.kind).toEqual('withhold');
      expect(deletedAgain.kind).toEqual('withhold');
    });

    it('sends users their own project config after they were removed from the project', async () => {
      const env = new TestEnvironment();
      const configId = `${PROJECT_ID}:${USERS.translator}`;
      env.world.data.put(SF_PROJECT_USER_CONFIGS_COLLECTION, configId, {
        projectRef: PROJECT_ID,
        ownerRef: USERS.translator
      });
      env.removeFromProject(USERS.translator);

      const decision: EgressDecision = await env.authorize(
        'translator',
        env.fetchReply(SF_PROJECT_USER_CONFIGS_COLLECTION, configId, {
          exists: true,
          version: 1,
          type: JSON0_TYPE_URI,
          data: { projectRef: PROJECT_ID, ownerRef: USERS.translator }
        })
      );

      expect(decision).toEqual({ kind: 'send' });
    });

    it('withholds an op that takes away access and also changes the rest of the doc', async () => {
      const env = new TestEnvironment();
      const authorizer: SFEgressAuthorizer = env.authorizer('commenter');
      await env.authorizeWith(authorizer, env.fetchReply(NOTE_THREAD_COLLECTION, SF_THREAD));

      const decision: EgressDecision = await env.authorizeWith(
        authorizer,
        env.op(NOTE_THREAD_COLLECTION, SF_THREAD, 1, {
          kind: 'edit',
          op: [
            { p: ['publishedToSF'], od: true, oi: false },
            { p: ['notes', 0], li: { content: 'Paratext only' } }
          ]
        })
      );

      expect(decision.kind).toEqual('withhold');
    });

    it('does not end the subscription when the database cannot be read', async () => {
      const env = new TestEnvironment();
      env.world.data.fail();

      expect(await env.authorize('admin', env.op(TEXTS_COLLECTION, TEXT_1, 1))).toEqual({
        kind: 'withhold',
        reason: expect.any(String),
        end: []
      });
    });

    it('decides again when ops were missed', async () => {
      const env = new TestEnvironment();
      const authorizer: SFEgressAuthorizer = env.authorizer('commenter');
      await env.authorizeWith(authorizer, env.fetchReply(NOTE_THREAD_COLLECTION, SF_THREAD));
      const readsBefore: number = env.world.data.reads.length;

      // The decision was made at version 1; an op at version 5 means this connection did not see ops 1 to 4. The stored
      // doc is just past that op, which changes nothing reading depends on, so one read of it decides.
      env.world.data.edit(NOTE_THREAD_COLLECTION, SF_THREAD, 5);
      await env.authorizeWith(authorizer, env.op(NOTE_THREAD_COLLECTION, SF_THREAD, 5));

      expect(env.world.data.reads.length).toEqual(readsBefore + 1);
    });

    it("keeps the decision in step with the client's own ops, which it is only acked", async () => {
      const env = new TestEnvironment();
      const authorizer: SFEgressAuthorizer = env.authorizer('translator');
      await env.authorizeWith(authorizer, env.op(TEXTS_COLLECTION, TEXT_1, 1));
      const readsBefore: number = env.world.data.reads.length;
      const ownOp: EditOpRequest = {
        kind: 'edit-op',
        collection: TEXTS_COLLECTION,
        docId: TEXT_1,
        src: 'src',
        seq: 1,
        source: 'Editor',
        version: 2,
        edit: { otType: 'rich-text', ops: [{ kind: 'insert-text', text: 'a', attributes: null }] }
      };

      const ack: EgressDecision = await env.authorizeWith(
        authorizer,
        env.op(TEXTS_COLLECTION, TEXT_1, 2, { kind: 'none' }),
        { request: ownOp }
      );
      const next: EgressDecision = await env.authorizeWith(authorizer, env.op(TEXTS_COLLECTION, TEXT_1, 3));

      expect(ack).toEqual({ kind: 'send' });
      expect(next).toEqual({ kind: 'send' });
      expect(env.world.data.reads.length).toEqual(readsBefore);
    });

    it('decides a create op on the data it creates', async () => {
      const env = new TestEnvironment();
      const create = (published: boolean): OpMessage =>
        env.op(NOTE_THREAD_COLLECTION, NEW_THREAD, 0, {
          kind: 'create',
          type: JSON0_TYPE_URI,
          data: env.thread(published)
        });

      expect(await env.authorize('commenter', create(true))).toEqual({ kind: 'send' });
      expect((await env.authorize('commenter', create(false))).kind).toEqual('withhold');
      expect((await env.authorize('nonMember', create(true))).kind).toEqual('withhold');
    });

    it('decides again when a decision expires', async () => {
      let nowMs = 0;
      const env = new TestEnvironment();
      const authorizer: SFEgressAuthorizer = env.authorizer('translator', { ttlMs: 1000, now: () => nowMs });
      await env.authorizeWith(authorizer, env.op(TEXTS_COLLECTION, TEXT_1, 1));
      const readsBefore: number = env.world.data.reads.length;

      nowMs = 1000;
      await env.authorizeWith(authorizer, env.op(TEXTS_COLLECTION, TEXT_1, 2));

      expect(env.world.data.reads.length).toEqual(readsBefore + 1);
    });

    it('withholds when the doc cannot be read from the database', async () => {
      const env = new TestEnvironment();
      env.world.data.fail();

      expect((await env.authorize('admin', env.op(TEXTS_COLLECTION, TEXT_1, 1))).kind).toEqual('withhold');
    });
  });

  describe('past snapshots', () => {
    it('sends a past snapshot only when it and the doc as it is now may be read', async () => {
      const env = new TestEnvironment();
      const request = (docId: string): InboundMessage => ({
        kind: 'snapshot-fetch',
        collection: NOTE_THREAD_COLLECTION,
        docId: docId,
        requestId: 1,
        version: 1
      });
      const reply = (published: boolean): AuthorizableOutboundMessage => ({
        kind: 'snapshot-fetch-reply',
        requestId: 1,
        snapshot: { exists: true, version: 1, type: JSON0_TYPE_URI, data: env.thread(published) }
      });

      expect(await env.authorize('commenter', reply(true), { request: request(SF_THREAD) })).toEqual({ kind: 'send' });
      // The thread was not published at that version.
      expect((await env.authorize('commenter', reply(false), { request: request(SF_THREAD) })).kind).toEqual(
        'withhold'
      );
      // The thread is not published now.
      expect((await env.authorize('commenter', reply(true), { request: request(PT_THREAD) })).kind).toEqual('withhold');
      expect((await env.authorize('commenter', reply(true))).kind).toEqual('withhold');
    });
  });

  describe('presence', () => {
    it('sends presence on a text the user may read', async () => {
      const env = new TestEnvironment();

      expect(await env.authorize('checker', env.presence(`${TEXTS_COLLECTION}:${TEXT_1}`, null))).toEqual({
        kind: 'send'
      });
      expect(await env.authorize('checker', env.presence(`${TEXTS_COLLECTION}.${TEXT_1}`, TEXT_1))).toEqual({
        kind: 'send'
      });
      expect(
        await env.authorize('checker', { kind: 'presence-request-relay', channel: `${TEXTS_COLLECTION}.${TEXT_1}` })
      ).toEqual({ kind: 'send' });
    });

    it('withholds presence from a user who may not read the text, and ends the presence subscription', async () => {
      const env = new TestEnvironment();
      const channel = `${TEXTS_COLLECTION}:${TEXT_1}`;

      expect(await env.authorize('nonMember', env.presence(channel, null))).toEqual({
        kind: 'withhold',
        reason: expect.any(String),
        end: [{ kind: 'presence', channel: channel }]
      });
      expect((await env.authorize('nonMember', { kind: 'presence-request-relay', channel: channel })).kind).toEqual(
        'withhold'
      );
    });

    it('withholds a doc presence whose doc is not the one its channel names', async () => {
      const env = new TestEnvironment();
      const otherText = `${PROJECT_ID}:MAT:2:target`;

      expect((await env.authorize('admin', env.presence(`${TEXTS_COLLECTION}.${TEXT_1}`, otherText))).kind).toEqual(
        'withhold'
      );
      expect((await env.authorize('admin', env.presence(`${TEXTS_COLLECTION}:${TEXT_1}`, TEXT_1))).kind).toEqual(
        'withhold'
      );
      expect((await env.authorize('admin', env.presence('secrets:x', null))).kind).toEqual('withhold');
    });
  });

  it('sends replies that reveal no doc', async () => {
    const env = new TestEnvironment();

    for (const message of [
      { kind: 'unsubscribe-reply', collection: TEXTS_COLLECTION, docId: TEXT_1 },
      { kind: 'presence-subscribe-reply', channel: `${TEXTS_COLLECTION}:${TEXT_1}`, seq: 1 },
      { kind: 'bulk-subscribe-versions-reply', collection: TEXTS_COLLECTION, versions: new Map([[TEXT_1, 3]]) }
    ] as const) {
      expect(await env.authorize('nonMember', message)).toEqual({ kind: 'send' });
    }
  });
});

describe('ReadGrants', () => {
  it('keeps decisions for a bounded number of docs, dropping the least recently used', () => {
    const world = new TestWorld();
    const grants = new ReadGrants(world.projects, { maxGrants: 2 });
    const allowed = { allowed: true, reason: '' };
    grants.set(TEXTS_COLLECTION, 'a', allowed, 1, new Map(), null);
    grants.set(TEXTS_COLLECTION, 'b', allowed, 1, new Map(), null);
    grants.current(TEXTS_COLLECTION, 'a');

    grants.set(TEXTS_COLLECTION, 'c', allowed, 1, new Map(), null);

    expect(grants.size).toEqual(2);
    expect(grants.current(TEXTS_COLLECTION, 'a')).toBeDefined();
    expect(grants.current(TEXTS_COLLECTION, 'b')).toBeUndefined();
    expect(MAX_READ_GRANTS).toBeGreaterThan(1000);
  });

  it('remembers that a doc was readable after its decision went stale, until the doc is deleted', () => {
    const world = new TestWorld();
    const grants = new ReadGrants(world.projects);
    const epochs = new Map([[PROJECT_ID, world.projects.readEpoch(PROJECT_ID)]]);
    grants.set(TEXTS_COLLECTION, 'a', { allowed: true, reason: '' }, 1, epochs, null);
    grants.set(TEXTS_COLLECTION, 'b', { allowed: false, reason: 'no' }, 1, epochs, null);

    world.projects.invalidate(PROJECT_ID);

    expect(grants.current(TEXTS_COLLECTION, 'a')).toBeUndefined();
    expect(grants.wasReadable(TEXTS_COLLECTION, 'a')).toBe(true);
    expect(grants.wasReadable(TEXTS_COLLECTION, 'b')).toBe(false);
    grants.forgetDeleted(TEXTS_COLLECTION, 'a');
    expect(grants.wasReadable(TEXTS_COLLECTION, 'a')).toBe(false);
  });

  it('drops a decision whose project moved to a new epoch', () => {
    const world = new TestWorld();
    const grants = new ReadGrants(world.projects);
    grants.set(
      TEXTS_COLLECTION,
      'a',
      { allowed: true, reason: '' },
      1,
      new Map([[PROJECT_ID, world.projects.readEpoch(PROJECT_ID)]]),
      null
    );

    world.projects.invalidate(PROJECT_ID);

    expect(grants.current(TEXTS_COLLECTION, 'a')).toBeUndefined();
  });
});

/** An egress authorizer over a TestWorld with a text, note threads and questions. */
class TestEnvironment {
  readonly world: TestWorld = new TestWorld();
  readonly presenceIds = new PresenceIdBindings();

  constructor() {
    this.world.data.putText(TEXT_1);
    this.world.data.put(NOTE_THREAD_COLLECTION, PT_THREAD, this.thread(false));
    this.world.data.put(NOTE_THREAD_COLLECTION, SF_THREAD, this.thread(true));
    this.world.data.put(QUESTIONS_COLLECTION, QUESTION, { projectRef: PROJECT_ID, ownerRef: USERS.admin });
    this.world.data.put(QUESTIONS_COLLECTION, LEGACY_QUESTION, { projectRef: PROJECT_ID, ownerRef: USERS.admin });
  }

  authorizer(
    user: TestUserName,
    grantOptions: { ttlMs?: number; now?: () => number } = {},
    grants: ReadGrants = new ReadGrants(this.world.projects, grantOptions)
  ): SFEgressAuthorizer {
    return new SFEgressAuthorizer(sessionFor(user), this.services(), grants);
  }

  /** Removes a member from PROJECT_ID, as the project's own op does. */
  removeFromProject(userId: string): void {
    const roles: Record<string, string> = { ...(testProjectData().userRoles as Record<string, string>) };
    delete roles[userId];
    this.world.data.editData(SF_PROJECTS_COLLECTION, PROJECT_ID, testProjectData({ userRoles: roles }));
    this.world.projects.invalidate(PROJECT_ID);
  }

  services(): SFGatewayServices {
    return {
      projects: this.world.projects,
      profiles: this.world.profiles,
      data: this.world.data,
      presenceIds: this.presenceIds
    };
  }

  authorize(
    user: TestUserName,
    message: AuthorizableOutboundMessage,
    context: Partial<EgressContext> = {}
  ): Promise<EgressDecision> {
    return this.authorizeWith(this.authorizer(user), message, context);
  }

  authorizeWith(
    authorizer: SFEgressAuthorizer,
    message: AuthorizableOutboundMessage,
    context: Partial<EgressContext> = {}
  ): Promise<EgressDecision> {
    return authorizer.authorize(message, { request: context.request ?? null, query: context.query ?? null });
  }

  thread(publishedToSF: boolean): Record<string, unknown> {
    return { projectRef: PROJECT_ID, ownerRef: USERS.admin, publishedToSF: publishedToSF, notes: [] };
  }

  /** The stored doc as ShareDB would send it. */
  snapshotOf(collection: string, docId: string): OutboundSnapshot {
    if (collection === TEXTS_COLLECTION) {
      return { exists: true, version: 1, type: RICH_TEXT_TYPE_URI, data: { ops: [] } };
    }
    if (collection === NOTE_THREAD_COLLECTION) {
      return { exists: true, version: 1, type: JSON0_TYPE_URI, data: this.thread(docId === SF_THREAD) };
    }
    return { exists: true, version: 1, type: JSON0_TYPE_URI, data: { projectRef: PROJECT_ID, ownerRef: USERS.admin } };
  }

  fetchReply(collection: string, docId: string, snapshot?: OutboundSnapshot): AuthorizableOutboundMessage {
    return {
      kind: 'fetch-reply',
      collection: collection,
      docId: docId,
      snapshot: snapshot ?? this.snapshotOf(collection, docId)
    };
  }

  result(collection: string, docId: string): ResultSnapshot {
    return { ...this.snapshotOf(collection, docId), docId: docId };
  }

  queryReply(results: ResultSnapshot[], extra?: number): AuthorizableOutboundMessage {
    return {
      kind: 'query-subscribe-reply',
      queryId: QUERY_ID,
      data: { form: 'results', results: results },
      hasExtra: extra != null,
      extra: extra
    };
  }

  query(collection: string, extraIsSafe: boolean): MatchedQuery {
    return {
      entryName: 'test',
      collection: collection,
      extraIsSafe: extraIsSafe,
      authorize: async () => ({ kind: 'authorized' }),
      build: async () => ({})
    };
  }

  op(collection: string, docId: string, version: number, content?: OutboundOpContent): OpMessage {
    return {
      kind: 'op',
      collection: collection,
      docId: docId,
      version: version,
      src: 'other',
      seq: version,
      content: content ?? { kind: 'edit', op: collection === TEXTS_COLLECTION ? { ops: [{ insert: 'a' }] } : [] },
      fixup: []
    };
  }

  presence(channel: string, docId: string | null): AuthorizableOutboundMessage {
    return {
      kind: 'presence',
      channel: channel,
      src: 'other',
      presenceId: 'p1',
      value: null,
      presenceVersion: 1,
      doc: docId == null ? null : { collection: TEXTS_COLLECTION, docId: docId, version: 1, type: RICH_TEXT_TYPE_URI }
    };
  }
}
