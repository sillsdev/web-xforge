import {
  AuthorizableOutboundMessage,
  EgressDecision,
  FailClosedEgressAuthorizer,
  FailClosedGatewayPolicies,
  GatewaySession,
  InboundDecision,
  ListQueryRegistry,
  MatchedQuery,
  registerQuery,
  RegisteredQuery,
  WriteDecision
} from './authorization';
import { JsonObject } from './json';
import { JSON0_TYPE_URI } from './protocol-config';

const SESSION: GatewaySession = { userId: 'user01', systemRoles: ['user'] };

describe('ListQueryRegistry', () => {
  it('matches the entry for the collection and action, with its arguments bound', async () => {
    const registry = new ListQueryRegistry([projectQuery('questions', ['query-subscribe'])]);

    const matched: MatchedQuery | undefined = registry.match('query-subscribe', 'questions', { projectRef: 'p1' });

    expect(matched?.entryName).toEqual('questions-by-project');
    expect(await matched?.build(SESSION)).toEqual({ projectRef: 'p1', ownerRef: 'user01' });
  });

  it('does not match another collection, another action, or another shape', () => {
    const registry = new ListQueryRegistry([projectQuery('questions', ['query-subscribe'])]);

    expect(registry.match('query-subscribe', 'note_threads', { projectRef: 'p1' })).toBeUndefined();
    expect(registry.match('query-fetch', 'questions', { projectRef: 'p1' })).toBeUndefined();
    expect(registry.match('query-subscribe', 'questions', { projectRef: 'p1', extra: 1 })).toBeUndefined();
  });

  it('supports no query that two entries match', () => {
    const registry = new ListQueryRegistry([
      projectQuery('questions', ['query-subscribe']),
      projectQuery('questions', ['query-subscribe', 'query-fetch'])
    ]);

    expect(registry.match('query-subscribe', 'questions', { projectRef: 'p1' })).toBeUndefined();
    expect(registry.match('query-fetch', 'questions', { projectRef: 'p1' })).toBeDefined();
  });
});

describe('FailClosedGatewayPolicies', () => {
  it('refuses every inbound message, matches no query and refuses every write', async () => {
    const policies = new FailClosedGatewayPolicies();

    const inbound: InboundDecision = await policies.createConnectionAuthorizers(SESSION).inbound.authorize({
      kind: 'message',
      message: { kind: 'fetch', collection: 'texts', docId: 'p1:MAT:1:target', version: null },
      src: 'src01'
    });
    const write: WriteDecision = await policies.writeHook.authorize(
      {
        collection: 'questions',
        addressedAs: 'questions',
        docId: 'p1:q1',
        change: { kind: 'create', type: JSON0_TYPE_URI, data: {} },
        snapshot: { version: 0, type: null, data: undefined }
      },
      SESSION
    );

    expect(inbound.kind).toEqual('refused');
    expect(policies.queryRegistry.match('query-fetch', 'users', { _id: 'user01' })).toBeUndefined();
    expect(write.kind).toEqual('refused');
  });
});

describe('FailClosedEgressAuthorizer', () => {
  const authorizer = new FailClosedEgressAuthorizer();
  const opAck: AuthorizableOutboundMessage = {
    kind: 'op',
    collection: 'texts',
    docId: 'p1:MAT:1:target',
    version: 3,
    src: 'src',
    seq: 1,
    content: { kind: 'none' },
    fixup: []
  };

  it.each<[string, AuthorizableOutboundMessage]>([
    ['an unsubscribe reply', { kind: 'unsubscribe-reply', collection: 'texts', docId: 'd' }],
    ['a query unsubscribe reply', { kind: 'query-unsubscribe-reply', queryId: 1 }],
    ['a presence unsubscribe reply', { kind: 'presence-unsubscribe-reply', channel: 'texts:d', seq: 1 }],
    [
      'an error reply',
      {
        kind: 'error-reply',
        action: 'f',
        error: { code: 'ERR', message: 'no' },
        collection: 'texts',
        docId: 'd',
        bulkIds: null,
        id: null,
        src: null,
        seq: null,
        channel: null
      }
    ]
  ])('sends %s', async (_name: string, message: AuthorizableOutboundMessage) => {
    const decision: EgressDecision = await authorizer.authorize(message, { request: null, query: null });

    expect(decision.kind).toEqual('send');
  });

  it('sends an op ack, but withholds the same message when no op of the client is waiting for it', async () => {
    const ack: EgressDecision = await authorizer.authorize(opAck, {
      request: {
        kind: 'edit-op',
        collection: 'texts',
        docId: 'p1:MAT:1:target',
        version: 2,
        src: 'src',
        seq: 1,
        source: 'Editor',
        edit: { otType: 'rich-text', ops: [] }
      },
      query: null
    });
    const push: EgressDecision = await authorizer.authorize(opAck, { request: null, query: null });

    expect(ack.kind).toEqual('send');
    expect(push).toEqual({
      kind: 'withhold',
      reason: expect.any(String),
      end: [{ kind: 'doc', collection: 'texts', docId: 'p1:MAT:1:target' }]
    });
  });

  it.each<[string, AuthorizableOutboundMessage]>([
    [
      'a snapshot',
      {
        kind: 'fetch-reply',
        collection: 'texts',
        docId: 'd',
        snapshot: { exists: true, version: 1, type: JSON0_TYPE_URI, data: {} }
      }
    ],
    ['a query diff', { kind: 'query-diff', queryId: 2, diff: [] }],
    ['a query count', { kind: 'query-extra', queryId: 2, hasExtra: true, extra: 5 }],
    [
      'a presence relay',
      {
        kind: 'presence',
        channel: 'texts:d',
        src: 's',
        presenceId: 'p',
        value: null,
        presenceVersion: 0,
        doc: null
      }
    ],
    ['a presence subscribe reply', { kind: 'presence-subscribe-reply', channel: 'texts:d', seq: 1 }]
  ])('withholds %s', async (_name: string, message: AuthorizableOutboundMessage) => {
    const decision: EgressDecision = await authorizer.authorize(message, { request: null, query: null });

    expect(decision.kind).toEqual('withhold');
  });
});

/** A registry entry for `{ projectRef }` queries that builds a query limited to the session's user. */
function projectQuery(collection: string, actions: ('query-fetch' | 'query-subscribe')[]): RegisteredQuery {
  return registerQuery<{ projectId: string }>({
    name: `${collection}-by-project`,
    collection: collection,
    actions: actions,
    extraIsSafe: false,
    match: (query: JsonObject) => {
      const projectRef = query['projectRef'];
      return Object.keys(query).length === 1 && typeof projectRef === 'string' ? { projectId: projectRef } : undefined;
    },
    authorize: async () => ({ kind: 'authorized' }),
    build: async (args: { projectId: string }, session: GatewaySession) => ({
      projectRef: args.projectId,
      ownerRef: session.userId
    })
  });
}
