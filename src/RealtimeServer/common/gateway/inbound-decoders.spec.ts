import { DecodeResult } from './decoder';
import {
  decodeInboundMessage,
  MAX_CONNECTION_ID_LENGTH,
  MAX_DOC_ID_LENGTH,
  MAX_QUERY_KNOWN_RESULTS
} from './inbound-decoders';
import { InboundMessage } from './inbound-messages';
import {
  CollectionProtocol,
  GatewayProtocolConfig,
  JSON0_TYPE_NAME,
  JSON0_TYPE_URI,
  RICH_TEXT_TYPE_URI
} from './protocol-config';

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

/** A config shaped like Scripture Forge's, with one collection of each kind. */
const TEST_CONFIG: GatewayProtocolConfig = {
  collections: new Map<string, CollectionProtocol>([
    ['users', JSON0_COLLECTION],
    ['sf_projects', JSON0_COLLECTION],
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

/** Helpers for decoding messages in these tests. */
class TestEnvironment {
  /** Decodes `raw` with the test config, and gives the message or fails the test. */
  static accept(raw: unknown, config: GatewayProtocolConfig = TEST_CONFIG): InboundMessage {
    const result: DecodeResult<InboundMessage> = decodeInboundMessage(raw, config);
    if (!result.ok) {
      throw new Error(`expected the message to be accepted, but: ${result.path}: ${result.message}`);
    }
    return result.value;
  }

  /** Whether the test config's decoder refuses `raw`. */
  static isRejected(raw: unknown, config: GatewayProtocolConfig = TEST_CONFIG): boolean {
    return !decodeInboundMessage(raw, config).ok;
  }

  /** A copy of `message` with `key` set to `value` (or removed when `value` is undefined). */
  static withField(message: Record<string, unknown>, key: string, value: unknown): Record<string, unknown> {
    const copy: Record<string, unknown> = { ...message };
    if (value === undefined) {
      delete copy[key];
    } else {
      copy[key] = value;
    }
    return copy;
  }
}

const EDIT_OP: Record<string, unknown> = {
  a: 'op',
  c: 'questions',
  d: QUESTION_ID,
  v: 4,
  seq: 1,
  x: {},
  op: [{ p: ['isArchived'], oi: true, od: false }]
};
const TEXT_OP: Record<string, unknown> = {
  a: 'op',
  c: 'texts',
  d: TEXT_ID,
  v: 10,
  seq: 2,
  x: { source: 'Editor' },
  op: { ops: [{ retain: 4 }, { insert: 'a', attributes: { segment: 'verse_1_1' } }] }
};
const CREATE_OP: Record<string, unknown> = {
  a: 'op',
  c: 'questions',
  d: QUESTION_ID,
  v: null,
  seq: 3,
  x: {},
  create: { type: JSON0_TYPE_URI, data: { dataId: 'question01', projectRef: PROJECT_ID, answers: [] } }
};
const VIEWER = {
  displayName: 'Ana',
  avatarUrl: 'https://example.org/a.png',
  cursorColor: '#a1b2c3',
  activeInEditor: true
};
const CHANNEL_PRESENCE: Record<string, unknown> = {
  a: 'p',
  ch: `texts:${TEXT_ID}`,
  id: PRESENCE_ID,
  p: { viewer: VIEWER },
  pv: 0
};
const DOC_PRESENCE: Record<string, unknown> = {
  a: 'p',
  ch: `texts.${TEXT_ID}`,
  id: PRESENCE_ID,
  p: { index: 5, length: 2 },
  pv: 1,
  c: 'texts',
  d: TEXT_ID,
  v: 10,
  t: RICH_TEXT_TYPE_URI
};

describe('decodeInboundMessage', () => {
  describe('hs', () => {
    it('accepts a first handshake and a reconnect handshake', () => {
      expect(TestEnvironment.accept({ a: 'hs', id: null, protocol: 1, protocolMinor: 2 })).toEqual({
        kind: 'handshake',
        id: null
      });
      expect(TestEnvironment.accept({ a: 'hs', id: CONNECTION_ID, protocol: 1, protocolMinor: 2 })).toEqual({
        kind: 'handshake',
        id: CONNECTION_ID
      });
    });

    it.each([
      ['missing id', { a: 'hs', protocol: 1, protocolMinor: 2 }],
      ['numeric id', { a: 'hs', id: 5, protocol: 1, protocolMinor: 2 }],
      ['empty id', { a: 'hs', id: '', protocol: 1, protocolMinor: 2 }],
      ['too long id', { a: 'hs', id: 'x'.repeat(MAX_CONNECTION_ID_LENGTH + 1), protocol: 1, protocolMinor: 2 }],
      ['other protocol', { a: 'hs', id: null, protocol: 2, protocolMinor: 2 }],
      ['other minor protocol', { a: 'hs', id: null, protocol: 1, protocolMinor: 1 }],
      ['protocol as a string', { a: 'hs', id: null, protocol: '1', protocolMinor: 2 }],
      ['extra key', { a: 'hs', id: null, protocol: 1, protocolMinor: 2, extra: 1 }]
    ])('rejects a handshake with %s', (_name: string, raw: unknown) => {
      expect(TestEnvironment.isRejected(raw)).toBe(true);
    });
  });

  describe('f, s and u', () => {
    it('accepts a fetch or subscribe with no v, a null v or a numeric v', () => {
      for (const action of ['f', 's']) {
        const kind: string = action === 'f' ? 'fetch' : 'subscribe';
        expect(TestEnvironment.accept({ a: action, c: 'users', d: 'user01' })).toEqual({
          kind: kind,
          collection: 'users',
          docId: 'user01',
          version: null
        });
        expect(TestEnvironment.accept({ a: action, c: 'users', d: 'user01', v: null })).toEqual({
          kind: kind,
          collection: 'users',
          docId: 'user01',
          version: null
        });
        expect(TestEnvironment.accept({ a: action, c: 'texts', d: TEXT_ID, v: 0 })).toEqual({
          kind: kind,
          collection: 'texts',
          docId: TEXT_ID,
          version: 0
        });
      }
    });

    it('accepts an unsubscribe', () => {
      expect(TestEnvironment.accept({ a: 'u', c: 'questions', d: QUESTION_ID })).toEqual({
        kind: 'unsubscribe',
        collection: 'questions',
        docId: QUESTION_ID
      });
    });

    it.each([
      ['a negative version', { v: -1 }],
      ['a fractional version', { v: 1.5 }],
      ['a version as a string', { v: '1' }],
      ['an unsafe version', { v: Number.MAX_SAFE_INTEGER + 1 }],
      ['a NaN version', { v: NaN }],
      ['an infinite version', { v: Infinity }],
      ['an unknown collection', { c: 'projects' }],
      ['text_documents', { c: 'text_documents' }],
      ['a numeric collection', { c: 1 }],
      ['no collection', { c: undefined }],
      ['no doc id', { d: undefined }],
      ['an empty doc id', { d: '' }],
      ['a numeric doc id', { d: 1 }],
      ['the doc id __proto__', { d: '__proto__' }],
      ['the doc id constructor', { d: 'constructor' }],
      ['the doc id toString', { d: 'toString' }],
      ['the doc id hasOwnProperty', { d: 'hasOwnProperty' }],
      ['the doc id prototype', { d: 'prototype' }],
      ['a too long doc id', { d: 'x'.repeat(MAX_DOC_ID_LENGTH + 1) }],
      ['an extra key', { extra: true }]
    ])('rejects a fetch or subscribe with %s', (_name: string, change: Record<string, unknown>) => {
      for (const action of ['f', 's']) {
        let raw: Record<string, unknown> = { a: action, c: 'users', d: 'user01', v: 1 };
        for (const [key, value] of Object.entries(change)) {
          raw = TestEnvironment.withField(raw, key, value);
        }
        expect(TestEnvironment.isRejected(raw)).toBe(true);
      }
    });

    it('accepts a doc id of the longest length', () => {
      expect(TestEnvironment.isRejected({ a: 's', c: 'users', d: 'x'.repeat(MAX_DOC_ID_LENGTH) })).toBe(false);
    });

    it('rejects an unsubscribe with v', () => {
      expect(TestEnvironment.isRejected({ a: 'u', c: 'users', d: 'user01', v: null })).toBe(true);
      expect(TestEnvironment.isRejected({ a: 'u', c: 'users', d: 'user01', v: 1 })).toBe(true);
    });
  });

  describe('bf, bs and bu', () => {
    it('accepts the id list form and the version map form', () => {
      for (const action of ['bf', 'bs']) {
        const kind: string = action === 'bf' ? 'bulk-fetch' : 'bulk-subscribe';
        expect(TestEnvironment.accept({ a: action, c: 'questions', b: [QUESTION_ID, OTHER_QUESTION_ID] })).toEqual({
          kind: kind,
          collection: 'questions',
          docs: { form: 'ids', ids: [QUESTION_ID, OTHER_QUESTION_ID] }
        });
        expect(
          TestEnvironment.accept({ a: action, c: 'questions', b: { [QUESTION_ID]: 3, [OTHER_QUESTION_ID]: 0 } })
        ).toEqual({
          kind: kind,
          collection: 'questions',
          docs: {
            form: 'versions',
            versions: new Map([
              [QUESTION_ID, 3],
              [OTHER_QUESTION_ID, 0]
            ])
          }
        });
      }
    });

    it('accepts a bulk unsubscribe', () => {
      expect(TestEnvironment.accept({ a: 'bu', c: 'texts', b: [TEXT_ID, `${PROJECT_ID}:MAT:2:target`] })).toEqual({
        kind: 'bulk-unsubscribe',
        collection: 'texts',
        ids: [TEXT_ID, `${PROJECT_ID}:MAT:2:target`]
      });
    });

    it.each([
      ['a single id', ['q1']],
      ['no ids', []],
      ['duplicate ids', ['q1', 'q1']],
      ['an empty id', ['q1', '']],
      ['a numeric id', ['q1', 2]],
      ['a forbidden id', ['q1', 'constructor']],
      ['a single version', { q1: 1 }],
      ['a null version', { q1: 1, q2: null }],
      ['a negative version', { q1: 1, q2: -1 }],
      ['a fractional version', { q1: 1, q2: 0.5 }],
      ['an empty id in the version map', { q1: 1, '': 2 }],
      ['a forbidden id in the version map', { q1: 1, toString: 2 }],
      ['a string', 'q1'],
      ['null', null]
    ])('rejects a bulk fetch or subscribe with %s', (_name: string, docs: unknown) => {
      for (const action of ['bf', 'bs']) {
        expect(TestEnvironment.isRejected({ a: action, c: 'questions', b: docs })).toBe(true);
      }
    });

    it('rejects a version map with a __proto__ key that JSON.parse made an own property', () => {
      const raw: unknown = JSON.parse('{"a": "bs", "c": "questions", "b": {"q1": 1, "__proto__": 2}}');
      expect(TestEnvironment.isRejected(raw)).toBe(true);
    });

    it('rejects the version map form of a bulk unsubscribe', () => {
      expect(TestEnvironment.isRejected({ a: 'bu', c: 'questions', b: { q1: 1, q2: 2 } })).toBe(true);
    });

    it('rejects a bulk request with an extra key or an unknown collection', () => {
      expect(TestEnvironment.isRejected({ a: 'bs', c: 'questions', b: ['q1', 'q2'], v: 1 })).toBe(true);
      expect(TestEnvironment.isRejected({ a: 'bs', c: 'text_documents', b: ['q1', 'q2'] })).toBe(true);
    });
  });

  describe('op', () => {
    it('accepts a json0 edit on its first send, without src', () => {
      expect(TestEnvironment.accept(EDIT_OP)).toEqual({
        kind: 'edit-op',
        collection: 'questions',
        docId: QUESTION_ID,
        src: null,
        seq: 1,
        source: null,
        version: 4,
        edit: {
          otType: 'json0',
          components: [{ kind: 'object-replace', path: ['isArchived'], inserted: true, deleted: false }]
        }
      });
    });

    it('accepts a resent op with src', () => {
      expect(TestEnvironment.accept({ ...EDIT_OP, src: CONNECTION_ID })).toMatchObject({
        kind: 'edit-op',
        src: CONNECTION_ID
      });
      // A legacy ShareDB connection id, from an op restored from IndexedDB.
      expect(TestEnvironment.accept({ ...EDIT_OP, src: '0123456789abcdef0123456789abcdef' })).toMatchObject({
        src: '0123456789abcdef0123456789abcdef'
      });
    });

    it('accepts an empty json0 op and an empty delta', () => {
      expect(TestEnvironment.accept({ ...EDIT_OP, op: [] })).toMatchObject({
        edit: { otType: 'json0', components: [] }
      });
      expect(TestEnvironment.accept({ ...TEXT_OP, op: { ops: [] } })).toMatchObject({
        edit: { otType: 'rich-text', ops: [] }
      });
    });

    it('accepts text ops with each source, and with x: {}', () => {
      for (const source of ['Editor', 'History', 'Draft']) {
        expect(TestEnvironment.accept({ ...TEXT_OP, x: { source: source } })).toMatchObject({
          kind: 'edit-op',
          collection: 'texts',
          source: source
        });
      }
      expect(TestEnvironment.accept({ ...TEXT_OP, x: {} })).toMatchObject({ source: null });
      expect(TestEnvironment.accept(TEXT_OP)).toEqual({
        kind: 'edit-op',
        collection: 'texts',
        docId: TEXT_ID,
        src: null,
        seq: 2,
        source: 'Editor',
        version: 10,
        edit: {
          otType: 'rich-text',
          ops: [
            { kind: 'retain', length: 4, attributes: null },
            { kind: 'insert-text', text: 'a', attributes: { segment: 'verse_1_1' } }
          ]
        }
      });
    });

    it('accepts a create with the json0 URI or name, and a null or numeric version', () => {
      expect(TestEnvironment.accept(CREATE_OP)).toEqual({
        kind: 'create-op',
        collection: 'questions',
        docId: QUESTION_ID,
        src: null,
        seq: 3,
        source: null,
        version: null,
        data: { dataId: 'question01', projectRef: PROJECT_ID, answers: [] }
      });
      const restoredCreate: Record<string, unknown> = {
        ...CREATE_OP,
        c: 'note_threads',
        d: NOTE_THREAD_ID,
        v: 0,
        src: CONNECTION_ID,
        create: { type: JSON0_TYPE_NAME, data: { dataId: 'thread01' } }
      };
      expect(TestEnvironment.accept(restoredCreate)).toMatchObject({
        kind: 'create-op',
        collection: 'note_threads',
        version: 0,
        src: CONNECTION_ID
      });
    });

    it.each([
      ['a del', { op: undefined, del: true }],
      ['a del alongside op', { del: true }],
      ['an mv', { mv: 1 }],
      ['both op and create', { create: { type: JSON0_TYPE_URI, data: {} } }],
      ['neither op nor create', { op: undefined }],
      ['a null src', { src: null }],
      ['a numeric src', { src: 5 }],
      ['an empty src', { src: '' }],
      ['a too long src', { src: 'x'.repeat(MAX_CONNECTION_ID_LENGTH + 1) }],
      ['seq 0', { seq: 0 }],
      ['a negative seq', { seq: -1 }],
      ['a fractional seq', { seq: 1.5 }],
      ['no seq', { seq: undefined }],
      ['a null version', { v: null }],
      ['no version', { v: undefined }],
      ['no x', { x: undefined }],
      ['a source on a json0 collection', { x: { source: 'Editor' } }],
      ['another key in x', { x: { other: 1 } }],
      ['x that is null', { x: null }],
      ['an unknown collection', { c: 'projects' }],
      ['text_documents', { c: 'text_documents' }],
      ['a forbidden doc id', { d: '__proto__' }],
      ['a number add', { op: [{ p: ['count'], na: 1 }] }],
      ['a string insert', { op: [{ p: ['text', 0], si: 'a' }] }],
      ['a string delete', { op: [{ p: ['text', 0], sd: 'a' }] }],
      ['a list move', { op: [{ p: ['answers', 0], lm: 1 }] }],
      ['a list replace', { op: [{ p: ['answers', 0], li: 1, ld: 2 }] }],
      ['a subtype op', { op: [{ p: ['text'], t: 'text0', o: [] }] }],
      ['a delta', { op: { ops: [] } }],
      ['an extra key', { extra: 1 }]
    ])('rejects a json0 op with %s', (_name: string, change: Record<string, unknown>) => {
      let raw: Record<string, unknown> = EDIT_OP;
      for (const [key, value] of Object.entries(change)) {
        raw = TestEnvironment.withField(raw, key, value);
      }
      expect(TestEnvironment.isRejected(raw)).toBe(true);
    });

    it.each([
      ['an unknown source', { x: { source: 'Paratext' } }],
      ['source true', { x: { source: true } }],
      ['a null source', { x: { source: null } }],
      ['a json0 op', { op: [] }],
      ['a bare array of delta ops', { op: [{ insert: 'a' }] }],
      ['an object retain', { op: { ops: [{ retain: { verse: true } }] } }],
      ['a create with the rich-text URI', { op: undefined, create: { type: RICH_TEXT_TYPE_URI, data: { ops: [] } } }],
      ['a create with the json0 URI', { op: undefined, create: { type: JSON0_TYPE_URI, data: {} } }]
    ])('rejects a text op with %s', (_name: string, change: Record<string, unknown>) => {
      let raw: Record<string, unknown> = TEXT_OP;
      for (const [key, value] of Object.entries(change)) {
        raw = TestEnvironment.withField(raw, key, value);
      }
      expect(TestEnvironment.isRejected(raw)).toBe(true);
    });

    it.each([
      ['a collection the client does not create in', { c: 'users', d: 'user01' }],
      ['the rich-text type', { create: { type: RICH_TEXT_TYPE_URI, data: { ops: [] } } }],
      ['an unknown type', { create: { type: 'json1', data: {} } }],
      ['data that is an array', { create: { type: JSON0_TYPE_URI, data: [] } }],
      ['data that is null', { create: { type: JSON0_TYPE_URI, data: null } }],
      ['data holding a function', { create: { type: JSON0_TYPE_URI, data: { f: () => 1 } } }],
      ['no data', { create: { type: JSON0_TYPE_URI } }],
      ['an extra key in create', { create: { type: JSON0_TYPE_URI, data: {}, extra: 1 } }],
      ['a negative version', { v: -1 }],
      ['a source', { x: { source: 'Editor' } }]
    ])('rejects a create with %s', (_name: string, change: Record<string, unknown>) => {
      let raw: Record<string, unknown> = CREATE_OP;
      for (const [key, value] of Object.entries(change)) {
        raw = TestEnvironment.withField(raw, key, value);
      }
      expect(TestEnvironment.isRejected(raw)).toBe(true);
    });

    it('rejects a create whose data has a __proto__ key that JSON.parse made an own property', () => {
      const raw: unknown = JSON.parse(
        `{"a": "op", "c": "questions", "d": "${QUESTION_ID}", "v": null, "seq": 1, "x": {},` +
          ` "create": {"type": "${JSON0_TYPE_URI}", "data": {"__proto__": {"isAdmin": true}}}}`
      );
      expect(TestEnvironment.isRejected(raw)).toBe(true);
    });
  });

  describe('qf, qs and qu', () => {
    const resultsQuery = { projectRef: PROJECT_ID, isArchived: false, $sort: { dateCreated: 1 } };

    it('accepts an existence query fetch', () => {
      const query = { _id: TEXT_ID, $limit: 1, $count: { applySkipLimit: true } };
      expect(TestEnvironment.accept({ a: 'qf', id: 3, c: 'texts', q: query, o: {} })).toEqual({
        kind: 'query-fetch',
        queryId: 3,
        collection: 'texts',
        query: query
      });
    });

    it('accepts a results query subscribe with o and r, including null versions and an empty r', () => {
      expect(
        TestEnvironment.accept({
          a: 'qs',
          id: 1,
          c: 'questions',
          q: resultsQuery,
          o: {},
          r: [
            [QUESTION_ID, 3],
            [OTHER_QUESTION_ID, null]
          ]
        })
      ).toEqual({
        kind: 'query-subscribe',
        queryId: 1,
        collection: 'questions',
        query: resultsQuery,
        knownResults: [
          { docId: QUESTION_ID, version: 3 },
          { docId: OTHER_QUESTION_ID, version: null }
        ]
      });
      expect(TestEnvironment.accept({ a: 'qs', id: 1, c: 'questions', q: resultsQuery, o: {}, r: [] })).toMatchObject({
        knownResults: []
      });
    });

    it('accepts a count query subscribe without o and r, and on reconnect with r but no o', () => {
      const countQuery = { ...resultsQuery, $limit: 1, $count: { applySkipLimit: false } };
      expect(TestEnvironment.accept({ a: 'qs', id: 2, c: 'questions', q: countQuery })).toEqual({
        kind: 'query-subscribe',
        queryId: 2,
        collection: 'questions',
        query: countQuery,
        knownResults: null
      });
      expect(TestEnvironment.accept({ a: 'qs', id: 2, c: 'questions', q: countQuery, r: [] })).toMatchObject({
        knownResults: []
      });
    });

    it('accepts a query unsubscribe', () => {
      expect(TestEnvironment.accept({ a: 'qu', id: 7 })).toEqual({ kind: 'query-unsubscribe', queryId: 7 });
    });

    it.each([
      ['no o', { o: undefined }],
      ['a non-empty o', { o: { db: 'other' } }],
      ['o that is null', { o: null }],
      ['an r', { r: [] }],
      ['id 0', { id: 0 }],
      ['an id as a string', { id: '1' }],
      ['a query that is an array', { q: [] }],
      ['a query that is null', { q: null }],
      ['an unknown collection', { c: 'projects' }],
      ['an extra key', { extra: 1 }]
    ])('rejects a query fetch with %s', (_name: string, change: Record<string, unknown>) => {
      let raw: Record<string, unknown> = { a: 'qf', id: 1, c: 'questions', q: resultsQuery, o: {} };
      for (const [key, value] of Object.entries(change)) {
        raw = TestEnvironment.withField(raw, key, value);
      }
      expect(TestEnvironment.isRejected(raw)).toBe(true);
    });

    it('rejects a query whose filter has a __proto__ key that JSON.parse made an own property', () => {
      const raw: unknown = JSON.parse('{"a": "qf", "id": 1, "c": "questions", "q": {"__proto__": {}}, "o": {}}');
      expect(TestEnvironment.isRejected(raw)).toBe(true);
    });

    it.each([
      ['a non-empty o', { o: { db: 'other' } }],
      ['r that is not an array', { r: { [QUESTION_ID]: 1 } }],
      ['r that is null', { r: null }],
      ['an r entry of one element', { r: [[QUESTION_ID]] }],
      ['an r entry of three elements', { r: [[QUESTION_ID, 1, 2]] }],
      ['an r entry with a negative version', { r: [[QUESTION_ID, -1]] }],
      ['an r entry with a numeric id', { r: [[1, 1]] }],
      ['an r entry with an empty id', { r: [['', 1]] }],
      ['an r entry with a forbidden id', { r: [['__proto__', 1]] }],
      ['an r entry that is an object', { r: [{ id: QUESTION_ID, v: 1 }] }],
      ['an extra key', { extra: 1 }]
    ])('rejects a query subscribe with %s', (_name: string, change: Record<string, unknown>) => {
      let raw: Record<string, unknown> = { a: 'qs', id: 1, c: 'questions', q: resultsQuery, o: {}, r: [] };
      for (const [key, value] of Object.entries(change)) {
        raw = TestEnvironment.withField(raw, key, value);
      }
      expect(TestEnvironment.isRejected(raw)).toBe(true);
    });

    it('bounds the length of r', () => {
      const knownResults: [string, number][] = Array.from(
        { length: MAX_QUERY_KNOWN_RESULTS + 1 },
        (_value: unknown, index: number): [string, number] => [`${PROJECT_ID}:q${index}`, 1]
      );
      const raw: Record<string, unknown> = { a: 'qs', id: 1, c: 'questions', q: resultsQuery, r: knownResults };

      // SUT
      expect(TestEnvironment.isRejected(raw)).toBe(true);
      expect(TestEnvironment.isRejected({ ...raw, r: knownResults.slice(1) })).toBe(false);
    });

    it('rejects a query unsubscribe with an extra key or a bad id', () => {
      expect(TestEnvironment.isRejected({ a: 'qu', id: 1, c: 'questions' })).toBe(true);
      expect(TestEnvironment.isRejected({ a: 'qu', id: 0 })).toBe(true);
      expect(TestEnvironment.isRejected({ a: 'qu' })).toBe(true);
    });
  });

  describe('nf', () => {
    it('accepts a snapshot fetch by version of a note thread', () => {
      expect(TestEnvironment.accept({ a: 'nf', id: 1, c: 'note_threads', d: NOTE_THREAD_ID, v: 4 })).toEqual({
        kind: 'snapshot-fetch',
        requestId: 1,
        collection: 'note_threads',
        docId: NOTE_THREAD_ID,
        version: 4
      });
    });

    it.each([
      ['a collection the client does not fetch versions of', { c: 'questions' }],
      ['a null version', { v: null }],
      ['no version', { v: undefined }],
      ['a negative version', { v: -1 }],
      ['id 0', { id: 0 }],
      ['a timestamp', { ts: 1000 }]
    ])('rejects a snapshot fetch with %s', (_name: string, change: Record<string, unknown>) => {
      let raw: Record<string, unknown> = { a: 'nf', id: 1, c: 'note_threads', d: NOTE_THREAD_ID, v: 4 };
      for (const [key, value] of Object.entries(change)) {
        raw = TestEnvironment.withField(raw, key, value);
      }
      expect(TestEnvironment.isRejected(raw)).toBe(true);
    });
  });

  describe('presence', () => {
    it('accepts ps and pu on both channel forms', () => {
      for (const action of ['ps', 'pu']) {
        const kind: string = action === 'ps' ? 'presence-subscribe' : 'presence-unsubscribe';
        expect(TestEnvironment.accept({ a: action, ch: `texts:${TEXT_ID}`, seq: 1 })).toEqual({
          kind: kind,
          channel: { form: 'plain', name: `texts:${TEXT_ID}`, collection: 'texts', docId: TEXT_ID },
          seq: 1
        });
        expect(TestEnvironment.accept({ a: action, ch: `texts.${TEXT_ID}`, seq: 2 })).toEqual({
          kind: kind,
          channel: { form: 'doc', name: `texts.${TEXT_ID}`, collection: 'texts', docId: TEXT_ID },
          seq: 2
        });
      }
    });

    it('accepts pr on a doc channel', () => {
      expect(TestEnvironment.accept({ a: 'pr', ch: `texts.${TEXT_ID}` })).toEqual({
        kind: 'presence-request',
        channel: { form: 'doc', name: `texts.${TEXT_ID}`, collection: 'texts', docId: TEXT_ID }
      });
    });

    it('accepts channel presence with a viewer or null', () => {
      expect(TestEnvironment.accept(CHANNEL_PRESENCE)).toEqual({
        kind: 'channel-presence',
        channel: { form: 'plain', name: `texts:${TEXT_ID}`, collection: 'texts', docId: TEXT_ID },
        presenceId: PRESENCE_ID,
        viewer: VIEWER,
        presenceVersion: 0
      });
      expect(TestEnvironment.accept({ ...CHANNEL_PRESENCE, p: null, pv: 3 })).toMatchObject({
        viewer: null,
        presenceVersion: 3
      });
    });

    it('accepts doc presence with a range or null', () => {
      expect(TestEnvironment.accept(DOC_PRESENCE)).toEqual({
        kind: 'doc-presence',
        collection: 'texts',
        docId: TEXT_ID,
        channel: { form: 'doc', name: `texts.${TEXT_ID}`, collection: 'texts', docId: TEXT_ID },
        presenceId: PRESENCE_ID,
        range: { index: 5, length: 2 },
        presenceVersion: 1,
        version: 10
      });
      expect(TestEnvironment.accept({ ...DOC_PRESENCE, p: null })).toMatchObject({ range: null });
    });

    it.each([
      ['a collection without presence', 'questions:abc'],
      ['an unknown collection', `projects:${TEXT_ID}`],
      ['no separator', 'texts'],
      ['another separator', `texts/${TEXT_ID}`],
      ['an empty doc id', 'texts:'],
      ['a forbidden doc id', 'texts:__proto__'],
      ['a too long doc id', `texts:${'x'.repeat(MAX_DOC_ID_LENGTH + 1)}`],
      ['a number', 5]
    ])('rejects a presence subscribe on %s', (_name: string, channel: unknown) => {
      expect(TestEnvironment.isRejected({ a: 'ps', ch: channel, seq: 1 })).toBe(true);
    });

    it('rejects a presence subscribe with a bad seq or extra key', () => {
      expect(TestEnvironment.isRejected({ a: 'ps', ch: `texts:${TEXT_ID}`, seq: 0 })).toBe(true);
      expect(TestEnvironment.isRejected({ a: 'pu', ch: `texts:${TEXT_ID}` })).toBe(true);
      expect(TestEnvironment.isRejected({ a: 'ps', ch: `texts:${TEXT_ID}`, seq: 1, id: PRESENCE_ID })).toBe(true);
    });

    it('rejects pr on a plain channel or with an extra key', () => {
      expect(TestEnvironment.isRejected({ a: 'pr', ch: `texts:${TEXT_ID}` })).toBe(true);
      expect(TestEnvironment.isRejected({ a: 'pr', ch: `texts.${TEXT_ID}`, seq: 1 })).toBe(true);
    });

    it('rejects a channel that more than one collection name fits', () => {
      const config: GatewayProtocolConfig = {
        collections: new Map<string, CollectionProtocol>([
          ['texts', { ...JSON0_COLLECTION, otType: 'rich-text', presence: true }],
          ['texts.x', { ...JSON0_COLLECTION, otType: 'rich-text', presence: true }]
        ])
      };
      expect(TestEnvironment.isRejected({ a: 'ps', ch: 'texts.x:abc', seq: 1 }, config)).toBe(true);
      expect(TestEnvironment.isRejected({ a: 'ps', ch: 'texts:abc', seq: 1 }, config)).toBe(false);
    });

    it.each([
      ['a doc key', { c: 'texts' }],
      ['a doc channel', { ch: `texts.${TEXT_ID}` }],
      ['an uppercase presence id', { id: PRESENCE_ID.toUpperCase() }],
      ['a short presence id', { id: PRESENCE_ID.slice(1) }],
      ['a numeric presence id', { id: 5 }],
      ['a negative pv', { pv: -1 }],
      ['no pv', { pv: undefined }],
      ['no p', { p: undefined }],
      ['a range value', { p: { index: 0, length: 0 } }],
      ['an extra viewer key', { p: { viewer: { ...VIEWER, email: 'a@example.org' } } }],
      ['an extra key beside viewer', { p: { viewer: VIEWER, other: 1 } }],
      ['a missing viewer key', { p: { viewer: { ...VIEWER, cursorColor: undefined } } }],
      ['activeInEditor as a string', { p: { viewer: { ...VIEWER, activeInEditor: 'yes' } } }],
      ['a numeric display name', { p: { viewer: { ...VIEWER, displayName: 5 } } }],
      ['a viewer that is null', { p: { viewer: null } }],
      ['an extra key', { extra: 1 }]
    ])('rejects channel presence with %s', (_name: string, change: Record<string, unknown>) => {
      let raw: Record<string, unknown> = CHANNEL_PRESENCE;
      for (const [key, value] of Object.entries(change)) {
        raw = TestEnvironment.withField(raw, key, value);
      }
      expect(TestEnvironment.isRejected(JSON.parse(JSON.stringify(raw)))).toBe(true);
    });

    it.each([
      ['no t', { t: undefined }],
      ['the json0 type', { t: JSON0_TYPE_URI }],
      ['no c', { c: undefined }],
      ['a collection that does not match the channel', { c: 'questions' }],
      ['a doc id that does not match the channel', { d: `${PROJECT_ID}:MAT:2:target` }],
      ['a null version', { v: null }],
      ['a plain channel', { ch: `texts:${TEXT_ID}` }],
      ['a viewer value', { p: { viewer: VIEWER } }],
      ['a negative index', { p: { index: -1, length: 0 } }],
      ['a fractional length', { p: { index: 0, length: 0.5 } }],
      ['an extra range key', { p: { index: 0, length: 0, extra: 1 } }],
      ['a missing range key', { p: { index: 0 } }],
      ['an extra key', { extra: 1 }]
    ])('rejects doc presence with %s', (_name: string, change: Record<string, unknown>) => {
      let raw: Record<string, unknown> = DOC_PRESENCE;
      for (const [key, value] of Object.entries(change)) {
        raw = TestEnvironment.withField(raw, key, value);
      }
      expect(TestEnvironment.isRejected(raw)).toBe(true);
    });
  });

  describe('anything else', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['a string', 'hs'],
      ['a number', 1],
      ['an array', [{ a: 'hs', id: null, protocol: 1, protocolMinor: 2 }]],
      ['an object with no action', { c: 'users', d: 'user01' }],
      ['a numeric action', { a: 1 }],
      ['a ping', { a: 'pp' }],
      ['a snapshot fetch by timestamp', { a: 'nt', id: 1, c: 'note_threads', d: NOTE_THREAD_ID, ts: 1000 }],
      ['an init', { a: 'init', protocol: 1, protocolMinor: 2, id: 'x', type: JSON0_TYPE_URI }],
      ['a query diff', { a: 'q', id: 1, diff: [] }],
      ['an unknown action', { a: 'x' }],
      ['an action with different case', { a: 'HS', id: null, protocol: 1, protocolMinor: 2 }]
    ])('rejects %s', (_name: string, raw: unknown) => {
      expect(TestEnvironment.isRejected(raw)).toBe(true);
    });

    it('rejects own __proto__ and constructor keys at the top level', () => {
      expect(TestEnvironment.isRejected(JSON.parse('{"a": "u", "c": "users", "d": "user01", "__proto__": {}}'))).toBe(
        true
      );
      expect(TestEnvironment.isRejected(JSON.parse('{"a": "u", "c": "users", "d": "user01", "constructor": 1}'))).toBe(
        true
      );
    });

    it('rejects messages whose properties are inherited rather than own', () => {
      const inheritedEverything: unknown = Object.create({ a: 'u', c: 'users', d: 'user01' });
      expect(TestEnvironment.isRejected(inheritedEverything)).toBe(true);
      const inheritedDocId: unknown = Object.assign(Object.create({ d: 'user01' }), { a: 'u', c: 'users' });
      expect(TestEnvironment.isRejected(inheritedDocId)).toBe(true);
    });

    it('rejects a message with an accessor property', () => {
      const raw: Record<string, unknown> = { a: 'u', c: 'users' };
      Object.defineProperty(raw, 'd', { get: () => 'user01', enumerable: true });
      expect(TestEnvironment.isRejected(raw)).toBe(true);
      const accessorAction: Record<string, unknown> = { c: 'users', d: 'user01' };
      Object.defineProperty(accessorAction, 'a', { get: () => 'u', enumerable: true });
      expect(TestEnvironment.isRejected(accessorAction)).toBe(true);
    });

    it('rejects an instance of a class', () => {
      class Message {
        a = 'u';
        c = 'users';
        d = 'user01';
      }
      expect(TestEnvironment.isRejected(new Message())).toBe(true);
    });

    it('says where the problem is', () => {
      expect(decodeInboundMessage({ a: 'f', c: 'users', d: 'user01', v: -1 }, TEST_CONFIG)).toEqual({
        ok: false,
        path: '$.v',
        message: `expected an integer from 0 to ${Number.MAX_SAFE_INTEGER}`
      });
    });
  });
});
