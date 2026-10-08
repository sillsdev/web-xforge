import { DecodeResult } from './decoder';
import { encodeErrorReply, encodeForShareDB } from './forwarded-messages';
import { decodeInboundMessage } from './inbound-decoders';
import { BulkFetchRequest, InboundMessage, QueryFetchRequest } from './inbound-messages';
import { JsonObject } from './json';
import { CollectionProtocol, GatewayProtocolConfig, JSON0_TYPE_URI, RICH_TEXT_TYPE_URI } from './protocol-config';

const PROJECT_ID = '5f0c1a2b3c4d5e6f7a8b9c0d';
const TEXT_ID = `${PROJECT_ID}:MAT:1:target`;
const QUESTION_ID = `${PROJECT_ID}:question01`;
const OTHER_QUESTION_ID = `${PROJECT_ID}:question02`;
const NOTE_THREAD_ID = `${PROJECT_ID}:thread01`;
const PRESENCE_ID = '650a1b2c3d4e5f6a7b8c9d0e';
const CONNECTION_ID = 'nonce0123456789abcdefg.mac0123456789abcdefghijklmnopqrstuvwxyz0123';

const JSON0_COLLECTION: CollectionProtocol = {
  otType: 'json0',
  clientCreates: false,
  opSources: [],
  snapshotFetchByVersion: false,
  presence: false
};

const TEST_CONFIG: GatewayProtocolConfig = {
  collections: new Map<string, CollectionProtocol>([
    ['users', JSON0_COLLECTION],
    ['questions', { ...JSON0_COLLECTION, clientCreates: true }],
    ['note_threads', { ...JSON0_COLLECTION, clientCreates: true, snapshotFetchByVersion: true }],
    [
      'texts',
      {
        otType: 'rich-text',
        clientCreates: false,
        opSources: ['Editor', 'History', 'Draft'],
        snapshotFetchByVersion: false,
        presence: true
      }
    ]
  ])
};

/** Helpers for these tests. */
class TestEnvironment {
  /** Decodes a client message, failing the test if it is not accepted. */
  static decode(raw: unknown): InboundMessage {
    const result: DecodeResult<InboundMessage> = decodeInboundMessage(raw, TEST_CONFIG);
    if (!result.ok) {
      throw new Error(`expected the message to be accepted, but: ${result.path}: ${result.message}`);
    }
    return result.value;
  }

  /** Decodes a client message and gives what the gateway would forward to ShareDB. */
  static forward(raw: unknown): JsonObject {
    return encodeForShareDB(TestEnvironment.decode(raw));
  }
}

const VIEWER = { displayName: 'Ana', avatarUrl: '', cursorColor: '#a1b2c3', activeInEditor: false };
const RESULTS_QUERY = { projectRef: PROJECT_ID, isArchived: false, $sort: { dateCreated: 1 } };
const EXISTENCE_QUERY = { _id: TEXT_ID, $limit: 1, $count: { applySkipLimit: true } };

/** Client messages whose forwarded form is exactly the client message. */
const UNCHANGED_MESSAGES: [string, Record<string, unknown>][] = [
  ['a first handshake', { a: 'hs', id: null, protocol: 1, protocolMinor: 2 }],
  ['a reconnect handshake', { a: 'hs', id: CONNECTION_ID, protocol: 1, protocolMinor: 2 }],
  ['a fetch without v', { a: 'f', c: 'users', d: 'user01' }],
  ['a fetch with v', { a: 'f', c: 'users', d: 'user01', v: 3 }],
  ['a subscribe without v', { a: 's', c: 'texts', d: TEXT_ID }],
  ['a subscribe with v 0', { a: 's', c: 'texts', d: TEXT_ID, v: 0 }],
  ['an unsubscribe', { a: 'u', c: 'texts', d: TEXT_ID }],
  ['a bulk fetch of ids', { a: 'bf', c: 'questions', b: [QUESTION_ID, OTHER_QUESTION_ID] }],
  ['a bulk subscribe of versions', { a: 'bs', c: 'questions', b: { [QUESTION_ID]: 3, [OTHER_QUESTION_ID]: 0 } }],
  ['a bulk subscribe of ids', { a: 'bs', c: 'questions', b: [QUESTION_ID, OTHER_QUESTION_ID] }],
  ['a bulk fetch of versions', { a: 'bf', c: 'questions', b: { [QUESTION_ID]: 1, [OTHER_QUESTION_ID]: 2 } }],
  ['a bulk unsubscribe', { a: 'bu', c: 'questions', b: [QUESTION_ID, OTHER_QUESTION_ID] }],
  [
    'a json0 op on its first send',
    {
      a: 'op',
      c: 'questions',
      d: QUESTION_ID,
      v: 4,
      seq: 1,
      x: {},
      op: [
        { p: ['answers', 0], li: { dataId: 'a1', text: 'An answer' } },
        { p: ['answers', 1, 'likes', 0], ld: { ownerRef: 'user01' } },
        { p: ['status'], oi: 'resolved', od: 'todo' },
        { p: ['dateModified'], oi: '2026-10-08T00:00:00.000Z' },
        { p: ['audioUrl'], od: 'audio.mp3' }
      ]
    }
  ],
  ['a resent json0 op', { a: 'op', c: 'questions', d: QUESTION_ID, v: 4, src: CONNECTION_ID, seq: 1, x: {}, op: [] }],
  [
    'a text op',
    {
      a: 'op',
      c: 'texts',
      d: TEXT_ID,
      v: 10,
      seq: 2,
      x: { source: 'History' },
      op: {
        ops: [
          { retain: 4 },
          { retain: 1, attributes: { bold: null } },
          { insert: 'a', attributes: { segment: 'verse_1_1' } },
          { insert: { verse: { number: '2', style: 'v' } } },
          { delete: 3 }
        ]
      }
    }
  ],
  ['a text op with x {}', { a: 'op', c: 'texts', d: TEXT_ID, v: 10, seq: 2, x: {}, op: { ops: [] } }],
  [
    'a create',
    {
      a: 'op',
      c: 'note_threads',
      d: NOTE_THREAD_ID,
      v: null,
      seq: 3,
      x: {},
      create: { type: JSON0_TYPE_URI, data: { dataId: 'thread01', notes: [] } }
    }
  ],
  ['a count query subscribe', { a: 'qs', id: 2, c: 'questions', q: { ...RESULTS_QUERY, $count: {} } }],
  ['a count query subscribe with r', { a: 'qs', id: 2, c: 'questions', q: RESULTS_QUERY, r: [] }],
  ['a query unsubscribe', { a: 'qu', id: 2 }],
  ['a snapshot fetch', { a: 'nf', id: 1, c: 'note_threads', d: NOTE_THREAD_ID, v: 0 }],
  ['a plain presence subscribe', { a: 'ps', ch: `texts:${TEXT_ID}`, seq: 1 }],
  ['a doc presence subscribe', { a: 'ps', ch: `texts.${TEXT_ID}`, seq: 2 }],
  ['a plain presence unsubscribe', { a: 'pu', ch: `texts:${TEXT_ID}`, seq: 3 }],
  ['a doc presence unsubscribe', { a: 'pu', ch: `texts.${TEXT_ID}`, seq: 4 }],
  ['a presence request', { a: 'pr', ch: `texts.${TEXT_ID}` }],
  ['a viewer presence', { a: 'p', ch: `texts:${TEXT_ID}`, id: PRESENCE_ID, p: { viewer: VIEWER }, pv: 0 }],
  ['a null viewer presence', { a: 'p', ch: `texts:${TEXT_ID}`, id: PRESENCE_ID, p: null, pv: 1 }],
  [
    'a doc presence',
    {
      a: 'p',
      ch: `texts.${TEXT_ID}`,
      id: PRESENCE_ID,
      p: { index: 7, length: 0 },
      pv: 2,
      c: 'texts',
      d: TEXT_ID,
      v: 10,
      t: RICH_TEXT_TYPE_URI
    }
  ],
  [
    'a null doc presence',
    {
      a: 'p',
      ch: `texts.${TEXT_ID}`,
      id: PRESENCE_ID,
      p: null,
      pv: 3,
      c: 'texts',
      d: TEXT_ID,
      v: 10,
      t: RICH_TEXT_TYPE_URI
    }
  ]
];

/** Client messages whose forwarded form differs from the client message, with the forwarded form. */
const NORMALIZED_MESSAGES: [string, Record<string, unknown>, Record<string, unknown>][] = [
  ['a fetch with v null loses v', { a: 'f', c: 'users', d: 'user01', v: null }, { a: 'f', c: 'users', d: 'user01' }],
  ['a subscribe with v null loses v', { a: 's', c: 'texts', d: TEXT_ID, v: null }, { a: 's', c: 'texts', d: TEXT_ID }],
  [
    'a create with the json0 type name gets the json0 URI',
    {
      a: 'op',
      c: 'questions',
      d: QUESTION_ID,
      v: 0,
      src: CONNECTION_ID,
      seq: 9,
      x: {},
      create: { type: 'json0', data: { dataId: 'question01' } }
    },
    {
      a: 'op',
      c: 'questions',
      d: QUESTION_ID,
      v: 0,
      src: CONNECTION_ID,
      seq: 9,
      x: {},
      create: { type: JSON0_TYPE_URI, data: { dataId: 'question01' } }
    }
  ],
  [
    'a query fetch loses o',
    { a: 'qf', id: 1, c: 'texts', q: EXISTENCE_QUERY, o: {} },
    { a: 'qf', id: 1, c: 'texts', q: EXISTENCE_QUERY }
  ],
  [
    'a results query subscribe loses o and keeps r',
    {
      a: 'qs',
      id: 3,
      c: 'questions',
      q: RESULTS_QUERY,
      o: {},
      r: [
        [QUESTION_ID, 3],
        [OTHER_QUESTION_ID, null]
      ]
    },
    {
      a: 'qs',
      id: 3,
      c: 'questions',
      q: RESULTS_QUERY,
      r: [
        [QUESTION_ID, 3],
        [OTHER_QUESTION_ID, null]
      ]
    }
  ],
  [
    'a results query subscribe with an empty r loses o',
    { a: 'qs', id: 3, c: 'questions', q: RESULTS_QUERY, o: {}, r: [] },
    { a: 'qs', id: 3, c: 'questions', q: RESULTS_QUERY, r: [] }
  ]
];

describe('encodeForShareDB', () => {
  it.each(UNCHANGED_MESSAGES)('forwards %s exactly as the client sent it', (_name: string, raw: unknown) => {
    expect(TestEnvironment.forward(raw)).toStrictEqual(raw);
  });

  it.each(NORMALIZED_MESSAGES)('forwards %s', (_name: string, raw: unknown, expected: unknown) => {
    expect(TestEnvironment.forward(raw)).toStrictEqual(expected);
  });

  it('builds the forwarded message from the decoded value, sharing nothing with the client message', () => {
    const data = { dataId: 'question01', text: 'original' };
    const raw = { a: 'op', c: 'questions', d: QUESTION_ID, v: null, seq: 1, x: {}, create: { type: 'json0', data } };
    const message: InboundMessage = TestEnvironment.decode(raw);
    data.text = 'changed';

    // SUT
    const forwarded: JsonObject = encodeForShareDB(message);
    expect(forwarded.create).toEqual({ type: JSON0_TYPE_URI, data: { dataId: 'question01', text: 'original' } });
    expect(forwarded.x).not.toBe(raw.x);
  });

  it('forwards the query the message holds, so the gateway can substitute the built query', () => {
    const decoded: InboundMessage = TestEnvironment.decode({ a: 'qf', id: 1, c: 'texts', q: EXISTENCE_QUERY, o: {} });
    if (decoded.kind !== 'query-fetch') {
      throw new Error('expected a query fetch');
    }
    const built: QueryFetchRequest = { ...decoded, query: { _id: TEXT_ID, $limit: 1 } };
    expect(encodeForShareDB(built)).toStrictEqual({ a: 'qf', id: 1, c: 'texts', q: { _id: TEXT_ID, $limit: 1 } });
  });

  it('encodes a version map into own properties of a plain object', () => {
    // These ids cannot come from the decoder; this checks that encoding cannot reach Object.prototype even so.
    const message: BulkFetchRequest = {
      kind: 'bulk-fetch',
      collection: 'questions',
      docs: {
        form: 'versions',
        versions: new Map([
          ['__proto__', 1],
          ['q1', 2]
        ])
      }
    };

    // SUT
    const forwarded: JsonObject = encodeForShareDB(message);
    const versions: unknown = forwarded.b;
    expect(Object.getPrototypeOf(versions)).toBe(Object.prototype);
    expect(Object.getOwnPropertyNames(versions)).toEqual(['__proto__', 'q1']);
    expect(JSON.parse(JSON.stringify(forwarded))).toStrictEqual(
      JSON.parse('{"a": "bf", "c": "questions", "b": {"__proto__": 1, "q1": 2}}')
    );
  });
});

describe('encodeErrorReply', () => {
  it('echoes the forwarded form of the request with the error added', () => {
    const raw = { a: 'op', c: 'questions', d: QUESTION_ID, v: 4, src: CONNECTION_ID, seq: 1, x: {}, op: [] };
    expect(
      encodeErrorReply(TestEnvironment.decode(raw), { code: 'ERR_ACCESS_DENIED', message: 'Permission denied' })
    ).toStrictEqual({ ...raw, error: { code: 'ERR_ACCESS_DENIED', message: 'Permission denied' } });
  });

  it('leaves query options out of the echoed request', () => {
    const raw = { a: 'qs', id: 1, c: 'questions', q: RESULTS_QUERY, o: {}, r: [] };
    expect(encodeErrorReply(TestEnvironment.decode(raw), { code: 'ERR_QUERY', message: 'Unsupported query' })).toEqual({
      a: 'qs',
      id: 1,
      c: 'questions',
      q: RESULTS_QUERY,
      r: [],
      error: { code: 'ERR_QUERY', message: 'Unsupported query' }
    });
  });

  it('answers a fetch the way ShareDB answers one it refuses', () => {
    expect(
      encodeErrorReply(TestEnvironment.decode({ a: 'f', c: 'users', d: 'user02', v: 1 }), {
        code: 'ERR_ACCESS_DENIED',
        message: 'No access'
      })
    ).toStrictEqual({
      a: 'f',
      c: 'users',
      d: 'user02',
      v: 1,
      error: { code: 'ERR_ACCESS_DENIED', message: 'No access' }
    });
  });
});
