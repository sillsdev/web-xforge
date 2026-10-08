import ShareDB from 'sharedb';
import { NOTE_THREAD_COLLECTION } from '../../scriptureforge/models/note-thread';
import { QUESTIONS_COLLECTION } from '../../scriptureforge/models/question';
import { SF_PROJECTS_COLLECTION } from '../../scriptureforge/models/sf-project';
import { SF_PROJECT_USER_CONFIGS_COLLECTION } from '../../scriptureforge/models/sf-project-user-config';
import { TEXTS_COLLECTION } from '../../scriptureforge/models/text-data';
import { TRAINING_DATA_COLLECTION } from '../../scriptureforge/models/training-data';
import { USERS_COLLECTION } from '../models/user';
import { FailClosedGatewayPolicies } from './authorization';
import {
  CLOSE_CODE_INTERNAL_ERROR,
  CLOSE_CODE_POLICY_VIOLATION,
  CLOSE_CODE_TOKEN_EXPIRED,
  GATEWAY_REFUSED_CODE,
  GATEWAY_UNSUPPORTED_QUERY_CODE,
  GATEWAY_WITHHELD_CODE,
  MAX_FORWARDED_JSON0_COMPONENTS,
  MAX_PRESENCE_VERSION_LAG,
  PERMISSION_DENIED_MESSAGE,
  SHAREDB_SILENT_READ_REJECTION_CODE
} from './gateway-connection';
import { CLOSE_CODE_TRY_AGAIN_LATER } from './transport';
import { JsonObject } from './json';
import { JSON0_TYPE_URI, RICH_TEXT_TYPE_URI } from './protocol-config';
import {
  ADMIN,
  CHECKER,
  COMMENTER,
  CONSULTANT,
  Message,
  NON_MEMBER,
  PROJECT_ID,
  QUESTION_ID,
  READ_ONLY_TEXT_ID,
  TestClient,
  TestEnvironment,
  TEXT_ID,
  TRANSLATOR,
  UNPUBLISHED_THREAD_ID
} from './test-gateway-environment';

describe('RealtimeGateway', () => {
  describe('transport and protocol', () => {
    it('rewrites init to carry a gateway-minted src and answers both handshakes with it', async () => {
      const env = new TestEnvironment();
      await env.start();
      const client: TestClient = await env.connect(ADMIN, { handshake: false });

      const init: Message = await client.waitFor(m => m.a === 'init');
      client.send({ a: 'hs', id: null, protocol: 1, protocolMinor: 2 });
      client.send({ a: 'hs', id: null, protocol: 1, protocolMinor: 2 });
      const first: Message = await client.waitFor(m => m.a === 'hs');
      const second: Message = await client.waitFor(m => m.a === 'hs' && m !== first);

      expect(init.id).not.toMatch(/^[0-9a-f]{32}$/);
      expect(env.srcAuthority.verify(init.id, ADMIN)).toBe(true);
      expect(first.id).toEqual(init.id);
      expect(second.id).toEqual(init.id);
      await env.stop();
    });

    it('closes a connection whose first message is not a handshake', async () => {
      const env = new TestEnvironment();
      await env.start();
      const client: TestClient = await env.connect(ADMIN, { handshake: false });

      // SUT
      client.send({ a: 'f', c: SF_PROJECTS_COLLECTION, d: PROJECT_ID, v: null });
      const closeCode: number = await client.closed();

      expect(closeCode).toEqual(CLOSE_CODE_POLICY_VIOLATION);
      await env.flushLog();
      expect(env.eventSink.events.filter(e => e.kind === 'protocol-violation').map(e => e.reason)).toEqual([
        'the first message was not a handshake'
      ]);
      await env.stop();
    });

    it('closes a connection with too many requests waiting for replies', async () => {
      const env = new TestEnvironment({ maxPendingRequests: 2 });
      await env.start();
      const client: TestClient = await env.connect(ADMIN);

      // SUT
      for (let n = 0; n < 20; n++) {
        client.send({ a: 'f', c: TEXTS_COLLECTION, d: TEXT_ID, v: null });
      }
      const closeCode: number = await client.closed();

      expect(closeCode).toEqual(CLOSE_CODE_TRY_AGAIN_LATER);
      await env.flushLog();
      expect(env.eventSink.events.map(e => e.kind)).toContain('overflow');
      await env.stop();
    });

    it('keeps a src from an earlier connection of the same user, but not one of another user', async () => {
      const env = new TestEnvironment();
      await env.start();
      const earlier: TestClient = await env.connect(ADMIN);
      const translator: TestClient = await env.connect(TRANSLATOR);

      const again: TestClient = await env.connect(ADMIN, { handshake: false });
      again.send({ a: 'hs', id: earlier.src, protocol: 1, protocolMinor: 2 });
      const kept: Message = await again.waitFor(m => m.a === 'hs');
      const other: TestClient = await env.connect(ADMIN, { handshake: false });
      other.send({ a: 'hs', id: translator.src, protocol: 1, protocolMinor: 2 });
      const replaced: Message = await other.waitFor(m => m.a === 'hs');

      expect(kept.id).toEqual(earlier.src);
      expect(replaced.id).not.toEqual(translator.src);
      expect(env.srcAuthority.verify(replaced.id, ADMIN)).toBe(true);
      await env.stop();
    });

    it('closes when a later handshake asks for a different verified src', async () => {
      const env = new TestEnvironment();
      await env.start();
      const earlier: TestClient = await env.connect(ADMIN);
      const client: TestClient = await env.connect(ADMIN);

      client.send({ a: 'hs', id: earlier.src, protocol: 1, protocolMinor: 2 });

      expect(await client.closed()).toEqual(CLOSE_CODE_POLICY_VIOLATION);
      await env.stop();
    });

    it.each([
      ['invalid JSON', (client: TestClient) => client.sendRaw('{"a":')],
      ['a binary frame', (client: TestClient) => client.sendBinary(Buffer.from('{"a":"pp"}'))],
      ['an unknown action', (client: TestClient) => client.send({ a: 'zz' })],
      ['a ping, which our client never sends', (client: TestClient) => client.send({ a: 'pp' })],
      ['an extra key', (client: TestClient) => client.send({ a: 'f', c: TEXTS_COLLECTION, d: TEXT_ID, x: 1 })],
      ['an unknown collection', (client: TestClient) => client.send({ a: 'f', c: 'secrets', d: 'a' })],
      ['a __proto__ key', (client: TestClient) => client.sendRaw('{"a":"f","c":"texts","d":"x","__proto__":{}}')],
      [
        'a migration version on an op',
        (client: TestClient) =>
          client.send({ a: 'op', c: USERS_COLLECTION, d: ADMIN, v: 1, seq: 1, x: {}, op: [], mv: 1 })
      ]
    ])('closes the connection on %s, and logs it', async (_name: string, send: (client: TestClient) => void) => {
      const env = new TestEnvironment();
      await env.start();
      const client: TestClient = await env.connect(ADMIN);

      send(client);

      expect(await client.closed()).toEqual(CLOSE_CODE_POLICY_VIOLATION);
      await env.flushLog();
      expect(env.eventSink.events.map(e => e.kind)).toContain('protocol-violation');
      await env.stop();
    });

    it('closes the connection when the access token expires', async () => {
      const env = new TestEnvironment();
      await env.start();
      const client: TestClient = await env.connect(ADMIN, { expiresInMs: 600 });

      expect(await client.closed()).toEqual(CLOSE_CODE_TOKEN_EXPIRED);
      await env.flushLog();
      expect(env.eventSink.events.map(e => e.kind)).toContain('token-expired');
      await env.stop();
    });
  });

  describe('with the fail-closed policies', () => {
    it('refuses doc requests with an error reply and keeps the connection open', async () => {
      const env = new TestEnvironment({ policies: new FailClosedGatewayPolicies() });
      await env.start();
      const client: TestClient = await env.connect(ADMIN);

      const reply: Message = await client.request({ a: 'f', c: SF_PROJECTS_COLLECTION, d: PROJECT_ID, v: null });
      const unsubscribed: Message = await client.request({ a: 'u', c: SF_PROJECTS_COLLECTION, d: PROJECT_ID });

      expect(reply.error.code).toEqual(GATEWAY_REFUSED_CODE);
      expect(reply.data).toBeUndefined();
      expect(unsubscribed).toEqual({ a: 'u', c: SF_PROJECTS_COLLECTION, d: PROJECT_ID });
      expect(client.isOpen).toBe(true);
      await env.stop();
    });

    it('answers a query no registry entry matches with an error reply', async () => {
      const env = new TestEnvironment({ policies: new FailClosedGatewayPolicies() });
      await env.start();
      const client: TestClient = await env.connect(ADMIN);

      const reply: Message = await client.request({
        a: 'qf',
        id: 1,
        c: SF_PROJECTS_COLLECTION,
        q: { _id: PROJECT_ID, $limit: 1, $count: { applySkipLimit: true } },
        o: {}
      });

      expect(reply.error.code).toEqual(GATEWAY_UNSUPPORTED_QUERY_CODE);
      expect(client.isOpen).toBe(true);
      await env.flushLog();
      expect(env.eventSink.events.map(e => e.kind)).toContain('unsupported-query');
      await env.stop();
    });

    it('refuses ops, so nothing is written', async () => {
      const env = new TestEnvironment({ policies: new FailClosedGatewayPolicies() });
      await env.start();
      const client: TestClient = await env.connect(ADMIN);

      const reply: Message = await client.request({
        a: 'op',
        c: TEXTS_COLLECTION,
        d: TEXT_ID,
        v: 1,
        seq: 1,
        x: { source: 'Editor' },
        op: { ops: [{ insert: 'Hello' }] }
      });

      expect(reply.error.code).toEqual(GATEWAY_REFUSED_CODE);
      expect((await env.serverSnapshot(TEXTS_COLLECTION, TEXT_ID)).v).toEqual(1);
      await env.stop();
    });
  });

  describe('with permissive test policies', () => {
    it('forwards a fetch and sends the snapshot', async () => {
      const env = new TestEnvironment();
      await env.start();
      const client: TestClient = await env.connect(ADMIN);

      const reply: Message = await client.request({ a: 'f', c: SF_PROJECTS_COLLECTION, d: PROJECT_ID, v: null });

      expect(reply.error).toBeUndefined();
      expect(reply.data.data.name).toEqual('project01');
      await env.stop();
    });

    it('forwards a rich-text op, acks it, and pushes it to another subscriber', async () => {
      const env = new TestEnvironment();
      await env.start();
      const subscriber: TestClient = await env.connect(TRANSLATOR);
      const subscribed: Message = await subscriber.request({ a: 's', c: TEXTS_COLLECTION, d: TEXT_ID });
      const editor: TestClient = await env.connect(ADMIN);

      // SUT
      const ack: Message = await editor.request({
        a: 'op',
        c: TEXTS_COLLECTION,
        d: TEXT_ID,
        v: 1,
        seq: 1,
        x: { source: 'Editor' },
        op: { ops: [{ insert: 'Hello' }] }
      });
      const pushed: Message = await subscriber.waitFor(m => m.a === 'op' && m.op != null);

      expect(subscribed.data.type).toEqual(RICH_TEXT_TYPE_URI);
      expect(ack).toEqual({ a: 'op', c: TEXTS_COLLECTION, d: TEXT_ID, src: editor.src, seq: 1, v: 1 });
      expect(pushed).toEqual({
        a: 'op',
        c: TEXTS_COLLECTION,
        d: TEXT_ID,
        v: 1,
        src: editor.src,
        seq: 1,
        op: { ops: [{ insert: 'Hello' }] }
      });
      const ops: ShareDB.RawOp[] = env.db.ops[TEXTS_COLLECTION][TEXT_ID];
      expect(ops[1].m.source).toEqual('Editor');
      await env.stop();
    });

    it('forwards a json0 op and a create', async () => {
      const env = new TestEnvironment();
      await env.start();
      const client: TestClient = await env.connect(TRANSLATOR);
      const configId = `${PROJECT_ID}:${TRANSLATOR}`;
      const trainingData: JsonObject = env.trainingData('data03', TRANSLATOR);

      const edit: Message = await client.request({
        a: 'op',
        c: SF_PROJECT_USER_CONFIGS_COLLECTION,
        d: configId,
        v: 1,
        seq: 1,
        x: {},
        op: [{ p: ['selectedBookNum'], oi: 40 }]
      });
      const create: Message = await client.request({
        a: 'op',
        c: TRAINING_DATA_COLLECTION,
        d: `${PROJECT_ID}:data03`,
        v: null,
        seq: 2,
        x: {},
        create: { type: 'json0', data: trainingData }
      });

      expect(edit.error).toBeUndefined();
      expect((await env.serverSnapshot(SF_PROJECT_USER_CONFIGS_COLLECTION, configId)).data.selectedBookNum).toEqual(40);
      expect(create.error).toBeUndefined();
      // The write hook sees the create with its type normalized to the URI.
      expect(env.writes.map(w => w.change)).toContainEqual({
        kind: 'create',
        type: JSON0_TYPE_URI,
        data: trainingData
      });
      expect(env.writes.map(w => w.change.kind)).toContain('edit');
      await env.stop();
    });

    it('lets the write hook check ops that ShareDB transformed against concurrent ops', async () => {
      const env = new TestEnvironment();
      await env.start();
      const admin: TestClient = await env.connect(ADMIN);
      const translator: TestClient = await env.connect(TRANSLATOR);

      // SUT
      const first: Message = await admin.request({
        a: 'op',
        c: TEXTS_COLLECTION,
        d: TEXT_ID,
        v: 1,
        seq: 1,
        x: { source: 'Editor' },
        op: { ops: [{ insert: 'A' }] }
      });
      const second: Message = await translator.request({
        a: 'op',
        c: TEXTS_COLLECTION,
        d: TEXT_ID,
        v: 1,
        seq: 1,
        x: { source: 'Editor' },
        op: { ops: [{ insert: 'B' }] }
      });

      expect(first.error).toBeUndefined();
      expect(second.error).toBeUndefined();
      expect(env.writes.filter(w => w.collection === TEXTS_COLLECTION).length).toEqual(2);
      expect((await env.serverSnapshot(TEXTS_COLLECTION, TEXT_ID)).v).toEqual(3);
      await env.stop();
    });

    it('closes the connection when a query id is reused while the query is in use', async () => {
      const env = new TestEnvironment();
      await env.start();
      const client: TestClient = await env.connect(ADMIN);
      const query: Message = { a: 'qf', id: 1, c: TRAINING_DATA_COLLECTION, q: { projectRef: PROJECT_ID }, o: {} };

      client.send(query);
      client.send(query);

      expect(await client.closed()).toEqual(CLOSE_CODE_POLICY_VIOLATION);
      await env.stop();
    });

    it('answers an op whose src belongs to another user with an error, without closing', async () => {
      const env = new TestEnvironment();
      await env.start();
      const translator: TestClient = await env.connect(TRANSLATOR);
      const client: TestClient = await env.connect(ADMIN);

      const reply: Message = await client.request({
        a: 'op',
        c: TEXTS_COLLECTION,
        d: TEXT_ID,
        v: 1,
        src: translator.src,
        seq: 1,
        x: { source: 'Editor' },
        op: { ops: [{ insert: 'Hello' }] }
      });

      expect(reply.error.code).toEqual(GATEWAY_REFUSED_CODE);
      expect(client.isOpen).toBe(true);
      expect((await env.serverSnapshot(TEXTS_COLLECTION, TEXT_ID)).v).toEqual(1);
      await env.stop();
    });

    it('binds a src from before the gateway to the first user that uses it', async () => {
      const env = new TestEnvironment();
      await env.start();
      const legacySrc = '0123456789abcdef0123456789abcdef';
      const admin: TestClient = await env.connect(ADMIN);
      const translator: TestClient = await env.connect(TRANSLATOR);

      // SUT
      const accepted: Message = await admin.request({
        a: 'op',
        c: TEXTS_COLLECTION,
        d: TEXT_ID,
        v: 1,
        src: legacySrc,
        seq: 7,
        x: { source: 'Editor' },
        op: { ops: [{ insert: 'A' }] }
      });
      const refused: Message = await translator.request({
        a: 'op',
        c: TEXTS_COLLECTION,
        d: TEXT_ID,
        v: 2,
        src: legacySrc,
        seq: 8,
        x: { source: 'Editor' },
        op: { ops: [{ insert: 'B' }] }
      });

      expect(accepted).toEqual({ a: 'op', c: TEXTS_COLLECTION, d: TEXT_ID, src: legacySrc, seq: 7, v: 1 });
      expect(refused.error.code).toEqual(GATEWAY_REFUSED_CODE);
      await env.stop();
    });

    it('forwards the query the registry built, never the client options', async () => {
      const env = new TestEnvironment();
      await env.start();
      const client: TestClient = await env.connect(ADMIN);

      const reply: Message = await client.request({
        a: 'qf',
        id: 1,
        c: TRAINING_DATA_COLLECTION,
        q: { projectRef: PROJECT_ID },
        o: {}
      });

      expect(reply.error).toBeUndefined();
      // The built query restricts the results to the user's own training data.
      expect(reply.data.map((r: Message) => r.d)).toEqual([`${PROJECT_ID}:data01`]);
      await env.stop();
    });

    it('relays presence between two clients on a text', async () => {
      const env = new TestEnvironment();
      await env.start();
      const viewer: TestClient = await env.connect(TRANSLATOR);
      const channel = `${TEXTS_COLLECTION}:${TEXT_ID}`;
      await viewer.request({ a: 'ps', ch: channel, seq: 1 });
      const sender: TestClient = await env.connect(ADMIN);
      await sender.request({ a: 'ps', ch: channel, seq: 1 });
      const presence: JsonObject = {
        viewer: { displayName: 'Admin', avatarUrl: '', cursorColor: '#123456', activeInEditor: true }
      };

      sender.send({ a: 'p', ch: channel, id: '0123456789abcdef01234567', p: presence, pv: 0 });
      const relayed: Message = await viewer.waitFor(m => m.a === 'p' && m.p != null);

      expect(relayed).toEqual({
        a: 'p',
        ch: channel,
        src: sender.src,
        id: '0123456789abcdef01234567',
        p: presence,
        pv: 0
      });
      await env.stop();
    });

    it('answers the refused docs of a bulk fetch separately and forwards the rest', async () => {
      const env = new TestEnvironment({ refusedDocIds: [`${PROJECT_ID}:${TRANSLATOR}`] });
      await env.start();
      const client: TestClient = await env.connect(ADMIN);
      const allowedId = `${PROJECT_ID}:${ADMIN}`;
      const refusedId = `${PROJECT_ID}:${TRANSLATOR}`;

      client.send({ a: 'bf', c: SF_PROJECT_USER_CONFIGS_COLLECTION, b: [allowedId, refusedId] });
      const refusal: Message = await client.waitFor(m => m.a === 'bf' && m.error != null);
      const data: Message = await client.waitFor(m => m.a === 'bf' && m.data != null);

      expect(refusal).toEqual({
        a: 'bf',
        c: SF_PROJECT_USER_CONFIGS_COLLECTION,
        b: [refusedId],
        error: { code: GATEWAY_REFUSED_CODE, message: expect.any(String) }
      });
      expect(Object.keys(data.data)).toEqual([allowedId]);
      await env.stop();
    });

    it('withholds what the egress authorizer withholds and ends the subscription', async () => {
      const env = new TestEnvironment({ withheldCollections: [TEXTS_COLLECTION] });
      await env.start();
      const subscriber: TestClient = await env.connect(TRANSLATOR);
      // The subscribe reply is withheld too, so the client gets an error in its place.
      const subscribed: Message = await subscriber.request({ a: 's', c: TEXTS_COLLECTION, d: TEXT_ID });

      // SUT
      await env.submitAsServer(TEXTS_COLLECTION, TEXT_ID, { ops: [{ insert: 'Hidden' }] });
      const received: Message[] = await subscriber.collectFor(200);

      expect(subscribed.error).toBeDefined();
      expect(subscribed.data).toBeUndefined();
      expect(received.filter(m => m.a === 'op')).toEqual([]);
      expect(subscriber.isOpen).toBe(true);
      await env.flushLog();
      expect(env.eventSink.events.map(e => e.kind)).toContain('withheld');
      await env.stop();
    });

    it('answers the withheld docs of a bulk reply with errors and sends the rest', async () => {
      const env = new TestEnvironment({ withheldDocIds: [TEXT_ID] });
      await env.start();
      const client: TestClient = await env.connect(TRANSLATOR);

      const reply: Message = await client.request({ a: 'bs', c: TEXTS_COLLECTION, b: [TEXT_ID, READ_ONLY_TEXT_ID] });

      expect(reply.data[TEXT_ID]).toEqual({ error: { code: GATEWAY_WITHHELD_CODE, message: '403: Withheld.' } });
      expect(reply.data[READ_ONLY_TEXT_ID].data).toBeDefined();
      expect(client.isOpen).toBe(true);
      await env.stop();
    });

    it('answers with an error the docs of a bulk reply whose subscription it ended while the request was in flight', async () => {
      const env = new TestEnvironment({ withheldDocIds: [TEXT_ID] });
      await env.start();
      const client: TestClient = await env.connect(TRANSLATOR);
      const start: number = client.mark;

      // ShareDB sends the ops since each version before its reply; the op of the withheld doc ends its subscription.
      client.send({ a: 'bs', c: TEXTS_COLLECTION, b: { [TEXT_ID]: 0, [READ_ONLY_TEXT_ID]: 0 } });
      const echo: Message = await client.waitFor(m => m.a === 'bs' && m.error == null, start);
      const error: Message = await client.waitFor(m => m.a === 'bs' && m.error != null, start);
      const received: Message[] = client.since(start);

      expect(echo.b).toEqual({ [READ_ONLY_TEXT_ID]: 0 });
      expect(error.b).toEqual({ [TEXT_ID]: 0 });
      expect(error.error.code).toEqual(GATEWAY_WITHHELD_CODE);
      expect(received.filter(m => m.a === 'op').map(m => m.d)).toEqual([READ_ONLY_TEXT_ID]);
      await env.stop();
    });

    it('gives no reply in place of a withheld presence echo', async () => {
      const env = new TestEnvironment({ withheldDocIds: [TEXT_ID] });
      await env.start();
      const client: TestClient = await env.connect(TRANSLATOR);
      const channel = `${TEXTS_COLLECTION}:${TEXT_ID}`;
      await client.request({ a: 'ps', ch: channel, seq: 1 });

      client.send({ a: 'p', ch: channel, id: '0123456789abcdef01234567', p: null, pv: 0 });
      const received: Message[] = await client.collectFor(200);

      // The client throws on an error reply to presence.
      expect(received).toEqual([]);
      expect(client.isOpen).toBe(true);
      await env.stop();
    });

    it('refuses an op the write hook refuses', async () => {
      const env = new TestEnvironment({ refuseWrites: true });
      await env.start();
      const client: TestClient = await env.connect(ADMIN);

      const reply: Message = await client.request({
        a: 'op',
        c: TEXTS_COLLECTION,
        d: TEXT_ID,
        v: 1,
        seq: 1,
        x: { source: 'Editor' },
        op: { ops: [{ insert: 'Hello' }] }
      });

      // The same code and message as the gateway's other refusals, not ShareDB's generic one. The reason is only logged.
      expect(reply.error).toEqual({ code: GATEWAY_REFUSED_CODE, message: PERMISSION_DENIED_MESSAGE });
      expect((await env.serverSnapshot(TEXTS_COLLECTION, TEXT_ID)).v).toEqual(1);
      await env.flushLog();
      expect(env.eventSink.events.filter(e => e.kind === 'refused')).toEqual([
        expect.objectContaining({
          reason: 'test refusal',
          action: 'apply',
          collection: TEXTS_COLLECTION,
          docId: TEXT_ID
        })
      ]);
      await env.stop();
    });

    it('refuses a json0 op with more components than the client makes, without closing', async () => {
      const env = new TestEnvironment();
      await env.start();
      const client: TestClient = await env.connect(ADMIN);
      const components: JsonObject[] = Array.from({ length: MAX_FORWARDED_JSON0_COMPONENTS + 1 }, (_, n: number) => ({
        p: ['questionRefsRead', 0],
        li: `q${n}`
      }));

      // SUT
      const reply: Message = await client.request({
        a: 'op',
        c: SF_PROJECT_USER_CONFIGS_COLLECTION,
        d: `${PROJECT_ID}:${ADMIN}`,
        v: 1,
        seq: 1,
        x: {},
        op: components
      });

      expect(reply.error.code).toEqual(GATEWAY_REFUSED_CODE);
      expect(client.isOpen).toBe(true);
      expect(env.writes).toEqual([]);
      await env.stop();
    });

    it('closes a connection that has more ended subscriptions than it can remember', async () => {
      const env = new TestEnvironment({ withheldCollections: [TEXTS_COLLECTION], maxEndedSubscriptions: 2 });
      await env.start();
      const client: TestClient = await env.connect(TRANSLATOR);
      // Each subscribe reply is withheld, which ends the subscription.
      await client.request({ a: 's', c: TEXTS_COLLECTION, d: TEXT_ID });
      await client.request({ a: 's', c: TEXTS_COLLECTION, d: READ_ONLY_TEXT_ID });

      // SUT
      client.send({ a: 's', c: TEXTS_COLLECTION, d: `${PROJECT_ID}:MAT:3:target` });
      const closeCode: number = await client.closed();

      expect(closeCode).toEqual(CLOSE_CODE_INTERNAL_ERROR);
      await env.flushLog();
      expect(env.eventSink.events.filter(e => e.kind === 'closed').map(e => e.reason)).toEqual([
        `${CLOSE_CODE_INTERNAL_ERROR} too many ended subscriptions`
      ]);
      await env.stop();
    });
  });

  describe("with Scripture Forge's policies", () => {
    it('refuses what the user may not read, and sends the rest', async () => {
      const env = new TestEnvironment({ sfPolicies: true });
      await env.start();
      const member: TestClient = await env.connect(TRANSLATOR);
      const outsider: TestClient = await env.connect(NON_MEMBER);

      const forwarded: Message = await member.request({ a: 'f', c: TEXTS_COLLECTION, d: TEXT_ID, v: null });
      const refused: Message = await outsider.request({ a: 'f', c: TEXTS_COLLECTION, d: TEXT_ID, v: null });
      // A doc that does not exist yet is decided by its id: the user config of another user may not be read. As for
      // every refused id where no doc is stored, the refusal is silent.
      const otherConfig: Message = await member.request({
        a: 's',
        c: SF_PROJECT_USER_CONFIGS_COLLECTION,
        d: `${PROJECT_ID}:${NON_MEMBER}`
      });

      expect(forwarded.error).toBeUndefined();
      expect(forwarded.data.type).toEqual(RICH_TEXT_TYPE_URI);
      expect(refused.error.code).toEqual(GATEWAY_REFUSED_CODE);
      expect(otherConfig.error.code).toEqual(SHAREDB_SILENT_READ_REJECTION_CODE);
      expect(outsider.isOpen).toBe(true);
      await env.stop();
    });

    it('tells the client only that a request was refused, and logs why', async () => {
      const env = new TestEnvironment({ sfPolicies: true });
      await env.start();
      const commenter: TestClient = await env.connect(COMMENTER);

      // SUT
      const reply: Message = await commenter.request({ a: 'f', c: NOTE_THREAD_COLLECTION, d: UNPUBLISHED_THREAD_ID });

      // Why it was refused would say that the thread is not published to Scripture Forge.
      expect(reply.error).toEqual({ code: GATEWAY_REFUSED_CODE, message: PERMISSION_DENIED_MESSAGE });
      await env.flushLog();
      expect(env.eventSink.events.filter(e => e.kind === 'refused').map(e => e.reason)).toEqual([
        expect.stringContaining('pt_note_threads')
      ]);
      await env.stop();
    });

    it('ends a subscribed query, sending nothing more of it, once the user may no longer run it', async () => {
      const env = new TestEnvironment({ sfPolicies: true });
      await env.start();
      const checker: TestClient = await env.connect(CHECKER);
      const subscribed: Message = await checker.request({
        a: 'qs',
        id: 1,
        c: QUESTIONS_COLLECTION,
        q: { projectRef: PROJECT_ID },
        o: {}
      });
      expect(subscribed.error).toBeUndefined();
      expect(subscribed.data.map((result: Message) => result.d)).toEqual([QUESTION_ID]);
      await env.removeFromProjectAsServer(CHECKER);
      const mark: number = checker.mark;

      // SUT
      // Deleting the question would remove it from the checker's results.
      await env.deleteAsServer(QUESTIONS_COLLECTION, QUESTION_ID);
      await checker.collectFor(300);

      expect(checker.since(mark).filter(m => m.a === 'q')).toEqual([]);
      await env.flushLog();
      expect(env.eventSink.events.filter(e => e.kind === 'withheld').map(e => e.reason)).toContainEqual(
        expect.stringContaining('the query is no longer authorized')
      );
      await env.stop();
    });

    it('refuses doc presence with a version the connection was never given, or far behind the one it has', async () => {
      const env = new TestEnvironment({ sfPolicies: true });
      await env.start();
      const translator: TestClient = await env.connect(TRANSLATOR);
      const docPresence = (version: number, presenceId: string): Message => ({
        a: 'p',
        ch: `${TEXTS_COLLECTION}.${TEXT_ID}`,
        id: presenceId,
        p: { index: 0, length: 0 },
        pv: 0,
        c: TEXTS_COLLECTION,
        d: TEXT_ID,
        v: version,
        t: RICH_TEXT_TYPE_URI
      });
      // Not yet fetched, so the connection knows no version of the text.
      translator.send(docPresence(1, '0123456789abcdef01234567'));
      const subscribed: Message = await translator.request({ a: 's', c: TEXTS_COLLECTION, d: TEXT_ID, v: null });
      expect(subscribed.data.v).toEqual(1);

      // SUT
      translator.send(docPresence(2, '0123456789abcdef01234568'));
      translator.send(docPresence(1, '0123456789abcdef01234569'));
      const echo: Message = await translator.waitFor(m => m.a === 'p');

      expect(echo.id).toEqual('0123456789abcdef01234569');
      // A subscribe naming a version far ahead (which the client could only claim) makes version 1 far behind.
      await translator.request({ a: 's', c: TEXTS_COLLECTION, d: TEXT_ID, v: 1 + MAX_PRESENCE_VERSION_LAG + 1 });
      translator.send(docPresence(1, '0123456789abcdef01234569'));
      await translator.collectFor(200);
      expect(translator.since(0).filter(m => m.a === 'p').length).toEqual(1);
      await env.flushLog();
      expect(env.eventSink.events.filter(e => e.kind === 'refused').map(e => e.reason)).toEqual([
        'presence names a doc whose version the connection has not been given',
        'presence names a version of the doc the connection has not been given',
        'presence names a version of the doc far behind the one the connection has'
      ]);
      await env.stop();
    });

    it('refuses silently a versioned subscribe to a doc deleted since that version', async () => {
      const env = new TestEnvironment({ sfPolicies: true });
      await env.start();
      await env.deleteAsServer(TEXTS_COLLECTION, READ_ONLY_TEXT_ID);
      const outsider: TestClient = await env.connect(NON_MEMBER);

      const reply: Message = await outsider.request({ a: 's', c: TEXTS_COLLECTION, d: READ_ONLY_TEXT_ID, v: 0 });

      // The ShareDB client then stops wanting the doc instead of raising an error.
      expect(reply.error.code).toEqual(SHAREDB_SILENT_READ_REJECTION_CODE);
      expect(outsider.isOpen).toBe(true);
      await env.stop();
    });

    it("applies a text edit only where the user's chapter permission is write", async () => {
      const env = new TestEnvironment({ sfPolicies: true });
      await env.start();
      const translator: TestClient = await env.connect(TRANSLATOR);
      const consultant: TestClient = await env.connect(CONSULTANT);

      // SUT
      const allowed: Message = await translator.request(env.textOp(TEXT_ID, 1, 1, 'Hello'));
      const readOnlyChapter: Message = await translator.request(env.textOp(READ_ONLY_TEXT_ID, 1, 2, 'Hello'));
      const noEditRight: Message = await consultant.request(env.textOp(TEXT_ID, 2, 1, 'Hello'));

      expect(allowed.error).toBeUndefined();
      expect(readOnlyChapter.error.code).toEqual(GATEWAY_REFUSED_CODE);
      expect(noEditRight.error.code).toEqual(GATEWAY_REFUSED_CODE);
      expect((await env.serverSnapshot(TEXTS_COLLECTION, TEXT_ID)).v).toEqual(2);
      expect((await env.serverSnapshot(TEXTS_COLLECTION, READ_ONLY_TEXT_ID)).v).toEqual(1);
      await env.stop();
    });

    it('refuses in the write hook an op the inbound check lets through', async () => {
      const env = new TestEnvironment({ sfPolicies: true });
      await env.start();
      const client: TestClient = await env.connect(TRANSLATOR);

      // Users may edit their own doc, but not their system roles.
      const reply: Message = await client.request({
        a: 'op',
        c: USERS_COLLECTION,
        d: TRANSLATOR,
        v: 1,
        seq: 1,
        x: {},
        op: [{ p: ['roles'], oi: ['system_admin'] }]
      });

      expect(reply.error).toBeDefined();
      expect((await env.serverSnapshot(USERS_COLLECTION, TRANSLATOR)).data.roles).not.toContain('system_admin');
      await env.stop();
    });

    it('refuses deletes and creates in collections the client does not create in', async () => {
      const env = new TestEnvironment({ sfPolicies: true });
      await env.start();
      const client: TestClient = await env.connect(ADMIN);

      const create: Message = await client.request({
        a: 'op',
        c: TRAINING_DATA_COLLECTION,
        d: `${PROJECT_ID}:bbbbbbbbbbbbbbbbbbbbbbbb`,
        v: null,
        seq: 1,
        x: {},
        create: { type: 'json0', data: { ...env.trainingData('bbbbbbbbbbbbbbbbbbbbbbbb', TRANSLATOR) } }
      });

      // The training data names another user as its owner.
      expect(create.error.code).toEqual(GATEWAY_REFUSED_CODE);
      await env.stop();
    });

    it('answers an existence query with a count of 0 for a doc the user may not read', async () => {
      const env = new TestEnvironment({ sfPolicies: true });
      await env.start();
      const outsider: TestClient = await env.connect(NON_MEMBER);

      const reply: Message = await outsider.request({
        a: 'qf',
        id: 1,
        c: TEXTS_COLLECTION,
        q: { _id: TEXT_ID, $limit: 1, $count: { applySkipLimit: true } },
        o: {}
      });

      // The query is forwarded, built so that it matches nothing.
      expect(reply.error).toBeUndefined();
      expect(reply.extra).toEqual(0);
      expect(outsider.isOpen).toBe(true);
      await env.stop();
    });

    it('drops refused presence without a reply, and keeps the connection open', async () => {
      const env = new TestEnvironment({ sfPolicies: true });
      await env.start();
      const outsider: TestClient = await env.connect(NON_MEMBER);
      const channel = `${TEXTS_COLLECTION}:${TEXT_ID}`;

      outsider.send({ a: 'ps', ch: channel, seq: 1 });
      outsider.send({ a: 'p', ch: channel, id: '0123456789abcdef01234567', p: null, pv: 0 });
      const received: Message[] = await outsider.collectFor(200);

      expect(received).toEqual([]);
      expect(outsider.isOpen).toBe(true);
      await env.flushLog();
      expect(env.eventSink.events.filter(e => e.kind === 'refused').length).toEqual(2);
      await env.stop();
    });

    it("forwards a viewer's presence with the name from their user doc", async () => {
      const env = new TestEnvironment({ sfPolicies: true });
      await env.start();
      const sender: TestClient = await env.connect(TRANSLATOR);
      const channel = `${TEXTS_COLLECTION}:${TEXT_ID}`;
      await sender.request({ a: 'ps', ch: channel, seq: 1 });
      const viewer: JsonObject = {
        viewer: { displayName: 'Someone else', avatarUrl: '', cursorColor: '#123456', activeInEditor: true }
      };

      sender.send({ a: 'p', ch: channel, id: '0123456789abcdef01234567', p: viewer, pv: 0 });
      // ShareDB echoes the presence, as forwarded, to its sender.
      const echo: Message = await sender.waitFor(m => m.a === 'p');

      expect(echo.p.viewer.displayName).toEqual('Test user 2');
      expect(echo.p.viewer.cursorColor).toEqual('#123456');
      await env.flushLog();
      expect(env.eventSink.events.filter(e => e.kind === 'refused')).toEqual([]);
      await env.stop();
    });
  });
});
