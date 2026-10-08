import 'jest-expect-message';
import * as OTJson0 from 'ot-json0';
import * as RichText from 'rich-text';
import ShareDB from 'sharedb';
import ShareDBMingo from 'sharedb-mingo-memory';
import { Connection, Doc } from 'sharedb/lib/client';
import { Duplex } from 'stream';
import { DecodeResult } from './decoder';
import { decodeOutboundMessage } from './outbound-decoders';
import { OutboundMessage } from './outbound-messages';
import { JSON0_TYPE_URI, RICH_TEXT_TYPE_URI } from './protocol-config';

ShareDB.types.register(RichText.type);
ShareDB.types.register(OTJson0.type);

/** Decodes a message, failing the test with the decoder's reason if it is refused. */
function decoded(raw: unknown): OutboundMessage {
  const result: DecodeResult<OutboundMessage> = decodeOutboundMessage(raw);
  if (!result.ok) {
    throw new Error(`refused at ${result.path}: ${result.message}: ${JSON.stringify(raw)}`);
  }
  return result.value;
}

const SRC = 'nonce.mac';
const ERROR = { code: 'ERR_X', message: 'nope' };

describe('decodeOutboundMessage', () => {
  describe('accepts', () => {
    it.each<[string, unknown, OutboundMessage['kind']]>([
      ['init', { a: 'init', protocol: 1, protocolMinor: 2, id: 'abc', type: JSON0_TYPE_URI }, 'init'],
      ['hs reply', { a: 'hs', protocol: 1, protocolMinor: 2, id: SRC, type: JSON0_TYPE_URI }, 'handshake-reply'],
      ['f reply with json0 data', { a: 'f', c: 'c1', d: 'd1', data: { v: 3, data: { x: 1 } } }, 'fetch-reply'],
      ['f reply without data', { a: 'f', c: 'c1', d: 'd1' }, 'fetch-reply'],
      ['s reply for a missing doc', { a: 's', c: 'c1', d: 'd1', data: { v: 0, type: null } }, 'subscribe-reply'],
      ['u reply', { a: 'u', c: 'c1', d: 'd1' }, 'unsubscribe-reply'],
      [
        'bf reply with a snapshot map',
        { a: 'bf', c: 'c1', data: { d1: { v: 1, data: {} }, d2: { error: { message: 'm' } } } },
        'bulk-fetch-reply'
      ],
      ['bs reply with a snapshot map', { a: 'bs', c: 'c1', data: {} }, 'bulk-subscribe-reply'],
      ['bf reply with versions', { a: 'bf', c: 'c1', b: { d1: 0, d2: 4 } }, 'bulk-fetch-versions-reply'],
      ['bs reply with versions', { a: 'bs', c: 'c1', b: { d1: 0 } }, 'bulk-subscribe-versions-reply'],
      ['bu reply', { a: 'bu', c: 'c1', b: ['d1', 'd2'] }, 'bulk-unsubscribe-reply'],
      ['qf reply', { a: 'qf', id: 1, data: [{ v: 1, data: {}, d: 'd1' }] }, 'query-fetch-reply'],
      ['qf reply with extra', { a: 'qf', id: 1, data: [], extra: 7 }, 'query-fetch-reply'],
      ['qs reply with results', { a: 'qs', id: 1, data: [], extra: { n: 1 } }, 'query-subscribe-reply'],
      ['qs reply with a snapshot map', { a: 'qs', id: 1, data: { d1: { v: 0, type: null } } }, 'query-subscribe-reply'],
      ['qs reply with nothing', { a: 'qs', id: 1 }, 'query-subscribe-reply'],
      ['qu reply', { a: 'qu', id: 1 }, 'query-unsubscribe-reply'],
      ['q diff', { a: 'q', id: 1, diff: [] }, 'query-diff'],
      ['q extra', { a: 'q', id: 1, extra: 3 }, 'query-extra'],
      ['q with no extra', { a: 'q', id: 1 }, 'query-extra'],
      ['op edit push', { a: 'op', c: 'c1', d: 'd1', v: 1, src: SRC, seq: 2, op: [{ p: ['x'], oi: 1 }] }, 'op'],
      ['op push of a legacy op', { a: 'op', c: 'c1', d: 'd1', v: 1, op: [] }, 'op'],
      ['op ack', { a: 'op', c: 'c1', d: 'd1', src: SRC, seq: 2, v: 5 }, 'op'],
      ['op ack with fixup', { a: 'op', c: 'c1', d: 'd1', src: SRC, seq: 2, v: 5, fixup: [{ op: [] }] }, 'op'],
      ['nf reply', { a: 'nf', id: 1, v: 2, type: JSON0_TYPE_URI, data: {}, m: null }, 'snapshot-fetch-reply'],
      ['nf reply for a missing doc', { a: 'nf', id: 1, v: 0, type: null, m: null }, 'snapshot-fetch-reply'],
      ['plain presence', { a: 'p', ch: 'texts:t', src: SRC, id: 'p1', p: { viewer: {} }, pv: 0 }, 'presence'],
      [
        'doc presence',
        { a: 'p', ch: 'texts.t', src: SRC, id: 'p1', p: null, pv: 1, c: 'texts', d: 't', v: 3, t: RICH_TEXT_TYPE_URI },
        'presence'
      ],
      [
        'presence after its subscription ended',
        { a: 'p', ch: 'x', src: SRC, id: 'p1', p: null, pv: 1, seq: null },
        'presence'
      ],
      ['presence relay error', { a: 'p', ch: 'texts:t', id: 'p1', error: ERROR }, 'presence-error'],
      ['pr relay', { a: 'pr', ch: 'texts.t' }, 'presence-request-relay'],
      ['pr reply', { a: 'pr' }, 'presence-request-reply'],
      ['ps reply', { a: 'ps', ch: 'texts:t', seq: 1 }, 'presence-subscribe-reply'],
      ['pu reply', { a: 'pu', ch: 'texts:t', seq: 2 }, 'presence-unsubscribe-reply'],
      ['error reply', { a: 'f', c: 'c1', d: 'd1', error: ERROR }, 'error-reply']
    ])('%s', (_description: string, raw: unknown, kind: OutboundMessage['kind']) => {
      expect(decoded(raw).kind).toBe(kind);
    });

    it('fills in the json0 type for snapshots without one', () => {
      expect(decoded({ a: 'f', c: 'c1', d: 'd1', data: { v: 3, data: { x: 1 } } })).toEqual({
        kind: 'fetch-reply',
        collection: 'c1',
        docId: 'd1',
        snapshot: { exists: true, version: 3, type: JSON0_TYPE_URI, data: { x: 1 } }
      });
    });

    it('keeps a rich-text snapshot type, and normalizes type names to URIs', () => {
      expect(
        decoded({ a: 's', c: 'texts', d: 't', data: { v: 1, data: { ops: [] }, type: RICH_TEXT_TYPE_URI } })
      ).toEqual({
        kind: 'subscribe-reply',
        collection: 'texts',
        docId: 't',
        snapshot: { exists: true, version: 1, type: RICH_TEXT_TYPE_URI, data: { ops: [] } }
      });
      expect(decoded({ a: 'op', c: 'c', d: 'd', v: 0, src: SRC, seq: 1, create: { type: 'json0', data: {} } })).toEqual(
        expect.objectContaining({ content: { kind: 'create', type: JSON0_TYPE_URI, data: {} } })
      );
    });

    it('decodes a missing doc as not existing', () => {
      expect(decoded({ a: 'f', c: 'c1', d: 'd1', data: { v: 2, type: null } })).toEqual(
        expect.objectContaining({ snapshot: { exists: false, version: 2 } })
      );
    });

    it('decodes snapshot maps and their errors', () => {
      const message: OutboundMessage = decoded({
        a: 'bf',
        c: 'c1',
        data: { d1: { v: 1, data: { y: 2 } }, d2: { error: { code: 403, message: 'no' } }, d3: { error: {} } }
      });
      expect(message).toEqual({
        kind: 'bulk-fetch-reply',
        collection: 'c1',
        snapshots: new Map([
          ['d1', { kind: 'snapshot', snapshot: { exists: true, version: 1, type: JSON0_TYPE_URI, data: { y: 2 } } }],
          ['d2', { kind: 'error', error: { code: 403, message: 'no' } }],
          ['d3', { kind: 'error', error: { code: null, message: null } }]
        ])
      });
    });

    it('tells the three qs reply forms apart', () => {
      expect(decoded({ a: 'qs', id: 2, data: [{ v: 1, data: {}, d: 'd1' }] })).toEqual({
        kind: 'query-subscribe-reply',
        queryId: 2,
        data: { form: 'results', results: [{ exists: true, version: 1, type: JSON0_TYPE_URI, data: {}, docId: 'd1' }] },
        hasExtra: false,
        extra: undefined
      });
      expect(decoded({ a: 'qs', id: 2, data: { d1: { v: 0, type: null } } })).toEqual({
        kind: 'query-subscribe-reply',
        queryId: 2,
        data: {
          form: 'snapshot-map',
          snapshots: new Map([['d1', { kind: 'snapshot', snapshot: { exists: false, version: 0 } }]])
        },
        hasExtra: false,
        extra: undefined
      });
      expect(decoded({ a: 'qs', id: 2 })).toEqual({
        kind: 'query-subscribe-reply',
        queryId: 2,
        data: { form: 'none' },
        hasExtra: false,
        extra: undefined
      });
    });

    it('keeps query extra, including a falsy one', () => {
      expect(decoded({ a: 'qf', id: 1, data: [], extra: 0 })).toEqual(
        expect.objectContaining({ hasExtra: true, extra: 0 })
      );
      expect(decoded({ a: 'q', id: 1, extra: null })).toEqual({
        kind: 'query-extra',
        queryId: 1,
        hasExtra: true,
        extra: null
      });
      expect(decoded({ a: 'q', id: 1 })).toEqual({
        kind: 'query-extra',
        queryId: 1,
        hasExtra: false,
        extra: undefined
      });
    });

    it('decodes each kind of query diff', () => {
      expect(
        decoded({
          a: 'q',
          id: 4,
          diff: [
            { type: 'insert', index: 0, values: [{ v: 1, data: {}, d: 'd1' }] },
            { type: 'remove', index: 2, howMany: 1 },
            { type: 'move', from: 3, to: 0, howMany: 2 }
          ]
        })
      ).toEqual({
        kind: 'query-diff',
        queryId: 4,
        diff: [
          {
            kind: 'insert',
            index: 0,
            values: [{ exists: true, version: 1, type: JSON0_TYPE_URI, data: {}, docId: 'd1' }]
          },
          { kind: 'remove', index: 2, howMany: 1 },
          { kind: 'move', from: 3, to: 0, howMany: 2 }
        ]
      });
    });

    it('decodes each kind of op content', () => {
      const base = { a: 'op', c: 'c1', d: 'd1', v: 4, src: SRC, seq: 9 };
      expect(decoded({ ...base, op: [{ p: ['x'], oi: 1 }] })).toEqual({
        kind: 'op',
        collection: 'c1',
        docId: 'd1',
        version: 4,
        src: SRC,
        seq: 9,
        content: { kind: 'edit', op: [{ p: ['x'], oi: 1 }] },
        fixup: []
      });
      expect(decoded({ ...base, create: { type: RICH_TEXT_TYPE_URI, data: { ops: [] } } })).toEqual(
        expect.objectContaining({ content: { kind: 'create', type: RICH_TEXT_TYPE_URI, data: { ops: [] } } })
      );
      expect(decoded({ ...base, create: { type: JSON0_TYPE_URI } })).toEqual(
        expect.objectContaining({ content: { kind: 'create', type: JSON0_TYPE_URI, data: undefined } })
      );
      expect(decoded({ ...base, del: true })).toEqual(expect.objectContaining({ content: { kind: 'delete' } }));
      expect(decoded(base)).toEqual(expect.objectContaining({ content: { kind: 'none' }, fixup: [] }));
      expect(decoded({ ...base, fixup: [1] })).toEqual(
        expect.objectContaining({ content: { kind: 'none' }, fixup: [1] })
      );
      expect(decoded({ a: 'op', c: 'c1', d: 'd1', v: 4, op: [] })).toEqual(
        expect.objectContaining({ src: null, seq: null })
      );
    });

    it('decodes an nf reply', () => {
      expect(decoded({ a: 'nf', id: 3, v: 2, type: RICH_TEXT_TYPE_URI, data: { ops: [] }, m: { mtime: 1 } })).toEqual({
        kind: 'snapshot-fetch-reply',
        requestId: 3,
        snapshot: { exists: true, version: 2, type: RICH_TEXT_TYPE_URI, data: { ops: [] } }
      });
      expect(decoded({ a: 'nf', id: 3, v: 0, type: null, m: null })).toEqual({
        kind: 'snapshot-fetch-reply',
        requestId: 3,
        snapshot: { exists: false, version: 0 }
      });
    });

    it('decodes plain and doc presence', () => {
      expect(decoded({ a: 'p', ch: 'texts:t', src: SRC, id: 'p1', p: { viewer: 'v' }, pv: 0 })).toEqual({
        kind: 'presence',
        channel: 'texts:t',
        src: SRC,
        presenceId: 'p1',
        value: { viewer: 'v' },
        presenceVersion: 0,
        doc: null
      });
      expect(
        decoded({
          a: 'p',
          ch: 'texts.t',
          src: SRC,
          id: 'p1',
          p: { index: 1, length: 0 },
          pv: 2,
          c: 'texts',
          d: 't',
          v: 3,
          t: RICH_TEXT_TYPE_URI
        })
      ).toEqual(
        expect.objectContaining({ doc: { collection: 'texts', docId: 't', version: 3, type: RICH_TEXT_TYPE_URI } })
      );
    });

    it('decodes the identifying fields of error replies', () => {
      expect(decoded({ a: 'op', c: 'c1', d: 'd1', v: 2, src: SRC, seq: 3, x: {}, op: [], error: ERROR })).toEqual({
        kind: 'error-reply',
        action: 'op',
        error: { code: 'ERR_X', message: 'nope' },
        collection: 'c1',
        docId: 'd1',
        bulkIds: null,
        id: null,
        src: SRC,
        seq: 3,
        channel: null
      });
      expect(decoded({ a: 'bs', c: 'c1', b: { d1: 1, d2: 0 }, error: { code: 4000, message: 'm' } })).toEqual(
        expect.objectContaining({ action: 'bs', bulkIds: ['d1', 'd2'], error: { code: 4000, message: 'm' } })
      );
      expect(decoded({ a: 'qs', id: 5, c: 'c1', q: {}, r: [['d1', null]], error: {} })).toEqual(
        expect.objectContaining({ action: 'qs', id: 5, collection: 'c1', error: { code: null, message: null } })
      );
      expect(decoded({ a: 'hs', id: null, protocol: 1, protocolMinor: 2, error: ERROR })).toEqual(
        expect.objectContaining({ action: 'hs', id: null })
      );
      expect(
        decoded({ a: 'p', ch: 'texts.t', id: 'p1', p: null, pv: 1, c: 'texts', d: 't', v: 0, t: 'x', error: ERROR })
      ).toEqual(expect.objectContaining({ kind: 'error-reply', action: 'p', id: 'p1', channel: 'texts.t' }));
    });

    it.each<[string, Record<string, unknown>]>([
      ['hs', { id: SRC, protocol: 1, protocolMinor: 2 }],
      ['f', { c: 'c', d: 'd', v: 1 }],
      ['s', { c: 'c', d: 'd' }],
      ['u', { c: 'c', d: 'd' }],
      ['bf', { c: 'c', b: ['d1', 'd2'] }],
      ['bs', { c: 'c', b: { d1: 1 } }],
      ['bu', { c: 'c', b: ['d1', 'd2'] }],
      ['op', { c: 'c', d: 'd', v: null, seq: 1, x: {}, create: { type: JSON0_TYPE_URI, data: {} } }],
      ['qf', { id: 1, c: 'c', q: {} }],
      ['qs', { id: 1, c: 'c', q: {} }],
      ['qu', { id: 1 }],
      ['nf', { id: 1, c: 'c', d: 'd', v: 1 }],
      ['ps', { ch: 'texts:t', seq: 1 }],
      ['pu', { ch: 'texts:t', seq: 1 }],
      ['pr', { ch: 'texts.t' }],
      ['p', { ch: 'texts:t', id: 'p1', p: null, pv: 0 }]
    ])('an error reply to %s', (action: string, request: Record<string, unknown>) => {
      expect(decoded({ a: action, ...request, error: ERROR })).toEqual(
        expect.objectContaining({ kind: 'error-reply', action: action })
      );
    });
  });

  describe('refuses', () => {
    it.each<[string, unknown]>([
      ['a non-object', 'hello'],
      ['an array', [{ a: 'qu', id: 1 }]],
      ['null', null],
      ['a message without an action', { id: 1 }],
      ['an unknown action', { a: 'zz', id: 1 }],
      ['pp, which the gateway never forwards', { a: 'pp' }],
      ['nt, which the gateway never forwards', { a: 'nt', id: 1, v: 0, type: null, m: null }],
      ['init with another protocol', { a: 'init', protocol: 1, protocolMinor: 1, id: 'abc', type: JSON0_TYPE_URI }],
      ['init with another default type', { a: 'init', protocol: 1, protocolMinor: 2, id: 'abc', type: 'x' }],
      ['hs reply with an extra key', { a: 'hs', protocol: 1, protocolMinor: 2, id: SRC, type: JSON0_TYPE_URI, x: 1 }],
      ['f reply with an extra key', { a: 'f', c: 'c1', d: 'd1', b: 1 }],
      ['f reply with a numeric doc id', { a: 'f', c: 'c1', d: 7 }],
      ['f reply with an empty collection', { a: 'f', c: '', d: 'd1' }],
      ['data with type null', { a: 'f', c: 'c1', d: 'd1', data: { v: 0, type: null, data: {} } }],
      ['a snapshot without data or type', { a: 'f', c: 'c1', d: 'd1', data: { v: 0 } }],
      ['a typed snapshot without data', { a: 'f', c: 'c1', d: 'd1', data: { v: 0, type: RICH_TEXT_TYPE_URI } }],
      ['an unknown snapshot type', { a: 'f', c: 'c1', d: 'd1', data: { v: 0, type: 'text', data: '' } }],
      ['a snapshot with metadata', { a: 'f', c: 'c1', d: 'd1', data: { v: 0, data: {}, m: null } }],
      ['a negative version', { a: 'f', c: 'c1', d: 'd1', data: { v: -1, data: {} } }],
      ['a fractional version', { a: 'f', c: 'c1', d: 'd1', data: { v: 1.5, data: {} } }],
      ['u reply with data', { a: 'u', c: 'c1', d: 'd1', data: { v: 0, type: null } }],
      ['bf reply with both data and b', { a: 'bf', c: 'c1', data: {}, b: {} }],
      ['bf reply with neither data nor b', { a: 'bf', c: 'c1' }],
      ['bf reply echoing an id list', { a: 'bf', c: 'c1', b: ['d1'] }],
      ['bf reply with a bad map entry', { a: 'bf', c: 'c1', data: { d1: { v: 0, type: null, error: ERROR } } }],
      ['bf reply with a forbidden id', { a: 'bf', c: 'c1', b: JSON.parse('{"__proto__": 1}') }],
      ['bs reply with a negative version', { a: 'bs', c: 'c1', b: { d1: -1 } }],
      ['bu reply with a versions map', { a: 'bu', c: 'c1', b: { d1: 0 } }],
      ['qf reply without data', { a: 'qf', id: 1 }],
      ['qf reply with a string id', { a: 'qf', id: '1', data: [] }],
      ['qf result without a doc id', { a: 'qf', id: 1, data: [{ v: 0, data: {} }] }],
      ['qs reply with a map and extra', { a: 'qs', id: 1, data: {}, extra: 1 }],
      ['qs reply with extra and no data', { a: 'qs', id: 1, extra: 1 }],
      ['qu reply with a collection', { a: 'qu', id: 1, c: 'c1' }],
      ['q with both diff and extra', { a: 'q', id: 1, diff: [], extra: 1 }],
      ['q diff of an unknown type', { a: 'q', id: 1, diff: [{ type: 'replace', index: 0 }] }],
      ['q diff with an extra key', { a: 'q', id: 1, diff: [{ type: 'remove', index: 0, howMany: 1, values: [] }] }],
      ['q remove of nothing', { a: 'q', id: 1, diff: [{ type: 'remove', index: 0, howMany: 0 }] }],
      ['q move without from', { a: 'q', id: 1, diff: [{ type: 'move', to: 0, howMany: 1 }] }],
      ['op without a version', { a: 'op', c: 'c1', d: 'd1', src: SRC, seq: 1 }],
      ['op with both op and create', { a: 'op', c: 'c1', d: 'd1', v: 0, op: [], create: { type: JSON0_TYPE_URI } }],
      ['op with del false', { a: 'op', c: 'c1', d: 'd1', v: 0, del: false }],
      ['op with mv', { a: 'op', c: 'c1', d: 'd1', v: 0, op: [], mv: 1 }],
      ['op with m', { a: 'op', c: 'c1', d: 'd1', v: 0, op: [], m: {} }],
      ['op with seq 0', { a: 'op', c: 'c1', d: 'd1', v: 0, src: SRC, seq: 0, op: [] }],
      ['create of an unknown type', { a: 'op', c: 'c1', d: 'd1', v: 0, create: { type: 'text', data: '' } }],
      ['create with an extra key', { a: 'op', c: 'c1', d: 'd1', v: 0, create: { type: JSON0_TYPE_URI, x: 1 } }],
      ['fixup on an op push', { a: 'op', c: 'c1', d: 'd1', v: 0, src: SRC, seq: 1, op: [], fixup: [1] }],
      ['fixup without src', { a: 'op', c: 'c1', d: 'd1', v: 0, seq: 1, fixup: [1] }],
      ['empty fixup', { a: 'op', c: 'c1', d: 'd1', v: 0, src: SRC, seq: 1, fixup: [] }],
      ['nf reply without m', { a: 'nf', id: 1, v: 0, type: null }],
      ['nf reply without type', { a: 'nf', id: 1, v: 1, data: {}, m: null }],
      ['nf reply with data and type null', { a: 'nf', id: 1, v: 1, type: null, data: {}, m: null }],
      ['nf reply with a doc id', { a: 'nf', id: 1, v: 0, type: null, m: null, c: 'c', d: 'd' }],
      ['nf reply with m an array', { a: 'nf', id: 1, v: 0, type: null, m: [] }],
      ['presence with only c and d', { a: 'p', ch: 'x', src: SRC, id: 'p1', p: null, pv: 0, c: 'texts', d: 't' }],
      ['presence with only v', { a: 'p', ch: 'x', src: SRC, id: 'p1', p: null, pv: 0, v: 1 }],
      ['presence without p', { a: 'p', ch: 'x', src: SRC, id: 'p1', pv: 0 }],
      ['presence without src', { a: 'p', ch: 'x', id: 'p1', p: null, pv: 0 }],
      ['presence with a numeric seq', { a: 'p', ch: 'x', src: SRC, id: 'p1', p: null, pv: 0, seq: 1 }],
      ['presence with a negative pv', { a: 'p', ch: 'x', src: SRC, id: 'p1', p: null, pv: -1 }],
      [
        'presence with an unknown type',
        { a: 'p', ch: 'x', src: SRC, id: 'p1', p: null, pv: 0, c: 'c', d: 'd', v: 0, t: 'x' }
      ],
      ['pr with a seq', { a: 'pr', ch: 'x', seq: 1 }],
      ['ps reply without seq', { a: 'ps', ch: 'x' }],
      ['ps reply with seq 0', { a: 'ps', ch: 'x', seq: 0 }],
      ['an error reply with an unknown action', { a: 'pp', error: ERROR }],
      ['an error reply to nt', { a: 'nt', id: 1, c: 'c', d: 'd', ts: 1, error: ERROR }],
      ['an error reply with a key its request cannot have', { a: 'f', c: 'c1', d: 'd1', q: {}, error: ERROR }],
      ['an error reply without its doc id', { a: 'f', c: 'c1', error: ERROR }],
      ['an error reply to qs with o', { a: 'qs', id: 1, c: 'c1', q: {}, o: {}, error: ERROR }],
      [
        'an error reply to an op with mv',
        { a: 'op', c: 'c', d: 'd', v: 0, seq: 1, x: {}, op: [], mv: 1, error: ERROR }
      ],
      ['an error reply to an op with del', { a: 'op', c: 'c', d: 'd', v: 0, seq: 1, x: {}, del: true, error: ERROR }],
      ['an error reply to an op with neither op nor create', { a: 'op', c: 'c', d: 'd', v: 0, seq: 1, error: ERROR }],
      ['an error reply to an op with a string seq', { a: 'op', c: 'c', d: 'd', seq: '1', op: [], error: ERROR }],
      ['an error reply to bu with a versions map', { a: 'bu', c: 'c', b: { d1: 0 }, error: ERROR }],
      ['an error reply to qf with a string id', { a: 'qf', id: '1', c: 'c', q: {}, error: ERROR }],
      ['an error reply to p with a numeric id', { a: 'p', ch: 'x', id: 1, p: null, pv: 0, error: ERROR }],
      ['a presence relay error with an extra key', { a: 'p', ch: 'x', id: 'p1', src: SRC, error: ERROR }],
      ['an error with an extra key', { a: 'f', c: 'c1', d: 'd1', error: { code: 'X', message: 'm', stack: 's' } }],
      ['an error with a boolean code', { a: 'f', c: 'c1', d: 'd1', error: { code: true, message: 'm' } }],
      ['an error with a fractional code', { a: 'f', c: 'c1', d: 'd1', error: { code: 1.5, message: 'm' } }],
      ['an error with an object message', { a: 'f', c: 'c1', d: 'd1', error: { message: {} } }],
      ['an error that is a string', { a: 'f', c: 'c1', d: 'd1', error: 'nope' }]
    ])('%s', (_description: string, raw: unknown) => {
      expect(decodeOutboundMessage(raw).ok).toBe(false);
    });

    it('a message with an inherited action', () => {
      const raw: object = Object.create({ a: 'qu' });
      Object.defineProperty(raw, 'id', { value: 1, enumerable: true });
      expect(decodeOutboundMessage(raw).ok).toBe(false);
    });

    it('a message whose action is a getter', () => {
      const raw: object = { id: 1 };
      Object.defineProperty(raw, 'a', { get: () => 'qu', enumerable: true });
      expect(decodeOutboundMessage(raw).ok).toBe(false);
    });
  });
});

/**
 * The real ShareDB server, with the options and OT types the realtime server uses, talking to raw protocol clients.
 * Every message the server writes is captured after a JSON round trip, which is what the gateway decodes.
 */
describe('decodeOutboundMessage on real ShareDB output', () => {
  it('decodes init and handshake replies', async () => {
    const env = new TestEnvironment();
    const client: RawClient = env.connect();

    client.send({ a: 'hs', id: null, protocol: 1, protocolMinor: 2 });
    client.send({ a: 'hs', id: SRC, protocol: 1, protocolMinor: 2 });
    await client.waitForCount(3);

    expect(client.kinds()).toEqual(['init', 'handshake-reply', 'handshake-reply']);
    expect(client.decodedMessages()[2]).toEqual({ kind: 'handshake-reply', id: SRC });
    env.expectEveryMessageDecodes();
  });

  it('decodes fetch, subscribe and unsubscribe replies', async () => {
    const env = new TestEnvironment();
    await env.seed();
    const client: RawClient = env.connect();

    // SUT
    client.send({ a: 'f', c: 'items', d: 'item1' });
    client.send({ a: 'f', c: 'items', d: 'missing' });
    client.send({ a: 'f', c: 'texts', d: 'text1' });
    client.send({ a: 'f', c: 'items', d: 'item1', v: 0 });
    client.send({ a: 's', c: 'texts', d: 'text1' });
    client.send({ a: 's', c: 'items', d: 'item1', v: 1 });
    client.send({ a: 's', c: 'items', d: 'missing' });
    client.send({ a: 'u', c: 'items', d: 'item1' });
    await client.waitFor((message: OutboundMessage) => message.kind === 'unsubscribe-reply');
    await env.settle();

    const replies: OutboundMessage[] = client.decodedMessages().filter((m: OutboundMessage) => m.kind !== 'init');
    expect(replies).toContainEqual({
      kind: 'fetch-reply',
      collection: 'items',
      docId: 'item1',
      snapshot: { exists: true, version: 2, type: JSON0_TYPE_URI, data: { n: 2, title: 'one' } }
    });
    expect(replies).toContainEqual({
      kind: 'fetch-reply',
      collection: 'items',
      docId: 'missing',
      snapshot: { exists: false, version: 0 }
    });
    expect(replies).toContainEqual(
      expect.objectContaining({
        kind: 'fetch-reply',
        docId: 'text1',
        snapshot: expect.objectContaining({ exists: true, type: RICH_TEXT_TYPE_URI })
      })
    );
    // f with a version: the ops since then, then a reply without a snapshot.
    expect(replies).toContainEqual(
      expect.objectContaining({
        kind: 'op',
        docId: 'item1',
        version: 0,
        content: expect.objectContaining({ kind: 'create' })
      })
    );
    expect(replies).toContainEqual({ kind: 'fetch-reply', collection: 'items', docId: 'item1', snapshot: null });
    expect(replies).toContainEqual({ kind: 'subscribe-reply', collection: 'items', docId: 'item1', snapshot: null });
    expect(replies).toContainEqual({
      kind: 'subscribe-reply',
      collection: 'items',
      docId: 'missing',
      snapshot: { exists: false, version: 0 }
    });
    expect(replies).toContainEqual({ kind: 'unsubscribe-reply', collection: 'items', docId: 'item1' });
    env.expectEveryMessageDecodes();
  });

  it('decodes bulk replies', async () => {
    const env = new TestEnvironment();
    await env.seed();
    const client: RawClient = env.connect();

    // SUT
    client.send({ a: 'bf', c: 'items', b: ['item1', 'item2', 'missing'] });
    client.send({ a: 'bs', c: 'items', b: ['item1', 'item2'] });
    client.send({ a: 'bf', c: 'items', b: { item1: 0, item2: 1 } });
    client.send({ a: 'bs', c: 'items', b: { item1: 1, item2: 1 } });
    client.send({ a: 'bu', c: 'items', b: ['item1', 'item2'] });
    await client.waitFor((message: OutboundMessage) => message.kind === 'bulk-unsubscribe-reply');
    await env.settle();

    const messages: OutboundMessage[] = client.decodedMessages();
    expect(messages).toContainEqual({
      kind: 'bulk-fetch-reply',
      collection: 'items',
      snapshots: new Map([
        [
          'item1',
          {
            kind: 'snapshot',
            snapshot: { exists: true, version: 2, type: JSON0_TYPE_URI, data: { n: 2, title: 'one' } }
          }
        ],
        [
          'item2',
          {
            kind: 'snapshot',
            snapshot: { exists: true, version: 1, type: JSON0_TYPE_URI, data: { n: 1, title: 'two' } }
          }
        ],
        ['missing', { kind: 'snapshot', snapshot: { exists: false, version: 0 } }]
      ])
    });
    expect(messages).toContainEqual(expect.objectContaining({ kind: 'bulk-subscribe-reply', collection: 'items' }));
    expect(messages).toContainEqual({
      kind: 'bulk-fetch-versions-reply',
      collection: 'items',
      versions: new Map([
        ['item1', 0],
        ['item2', 1]
      ])
    });
    expect(messages).toContainEqual(expect.objectContaining({ kind: 'bulk-subscribe-versions-reply' }));
    expect(messages).toContainEqual({ kind: 'bulk-unsubscribe-reply', collection: 'items', ids: ['item1', 'item2'] });
    env.expectEveryMessageDecodes();
  });

  it('decodes op acks and op pushes to another subscriber', async () => {
    const env = new TestEnvironment();
    await env.seed();
    const subscriber: RawClient = env.connect();
    const submitter: RawClient = env.connect();
    subscriber.send({ a: 's', c: 'items', d: 'item1' });
    subscriber.send({ a: 's', c: 'texts', d: 'text1' });
    subscriber.send({ a: 's', c: 'items', d: 'new1' });
    await subscriber.waitForCount(4);
    submitter.send({ a: 'hs', id: SRC, protocol: 1, protocolMinor: 2 });
    await submitter.waitForCount(2);

    // SUT
    submitter.send({ a: 'op', c: 'items', d: 'item1', v: 2, src: SRC, seq: 1, x: {}, op: [{ p: ['n'], na: 1 }] });
    submitter.send({ a: 'op', c: 'texts', d: 'text1', v: 1, src: SRC, seq: 2, x: {}, op: { ops: [{ insert: 'A' }] } });
    submitter.send({
      a: 'op',
      c: 'items',
      d: 'new1',
      v: null,
      src: SRC,
      seq: 3,
      x: {},
      create: { type: 'json0', data: { n: 0, title: 'new' } }
    });
    await submitter.waitForCount(5);
    await subscriber.waitForCount(7);

    expect(submitter.decodedMessages().slice(2)).toEqual([
      expectedAck('items', 'item1', 1, 2),
      expectedAck('texts', 'text1', 2, 1),
      expectedAck('items', 'new1', 3, 0)
    ]);
    const pushes: OutboundMessage[] = subscriber.decodedMessages().slice(4);
    expect(pushes).toContainEqual(
      expect.objectContaining({
        kind: 'op',
        docId: 'item1',
        version: 2,
        src: SRC,
        seq: 1,
        content: { kind: 'edit', op: [{ p: ['n'], na: 1 }] }
      })
    );
    expect(pushes).toContainEqual(
      expect.objectContaining({ kind: 'op', docId: 'text1', content: { kind: 'edit', op: { ops: [{ insert: 'A' }] } } })
    );
    expect(pushes).toContainEqual(
      expect.objectContaining({
        kind: 'op',
        docId: 'new1',
        version: 0,
        content: { kind: 'create', type: JSON0_TYPE_URI, data: { n: 0, title: 'new' } }
      })
    );
    env.expectEveryMessageDecodes();
  });

  it('decodes a delete pushed to a subscriber, and the ops sent before the ack of a stale op', async () => {
    const env = new TestEnvironment();
    await env.seed();
    const subscriber: RawClient = env.connect();
    const submitter: RawClient = env.connect();
    subscriber.send({ a: 's', c: 'items', d: 'item2' });
    await subscriber.waitForCount(2);

    // SUT
    submitter.send({ a: 'op', c: 'items', d: 'item1', v: 1, src: SRC, seq: 1, x: {}, op: [{ p: ['n'], na: 1 }] });
    await submitter.waitFor((message: OutboundMessage) => message.kind === 'op' && message.seq === 1);
    await env.deleteDoc('items', 'item2');
    await subscriber.waitForCount(3);

    // The op was made at version 1, so the op that made version 2 comes first.
    expect(submitter.decodedMessages().slice(1)).toEqual([
      expect.objectContaining({
        kind: 'op',
        docId: 'item1',
        version: 1,
        content: expect.objectContaining({ kind: 'edit' })
      }),
      expectedAck('items', 'item1', 1, 2)
    ]);
    expect(subscriber.decodedMessages()[2]).toEqual(
      expect.objectContaining({ kind: 'op', docId: 'item2', version: 1, content: { kind: 'delete' } })
    );
    env.expectEveryMessageDecodes();
  });

  it('decodes the acks of resubmitted ops', async () => {
    const env = new TestEnvironment();
    await env.seed();
    const client: RawClient = env.connect();
    const edit: Record<string, unknown> = { a: 'op', c: 'items', d: 'item1', v: 2, src: SRC, seq: 1, x: {}, op: [] };
    const create: Record<string, unknown> = {
      a: 'op',
      c: 'items',
      d: 'new1',
      v: null,
      src: SRC,
      seq: 2,
      x: {},
      create: { type: JSON0_TYPE_URI, data: {} }
    };
    client.send(edit);
    client.send(create);
    await client.waitForCount(3);

    // SUT
    // As a client does after a reconnect: the same ops again, with the same src and seq.
    client.send(edit);
    client.send(create);
    await client.waitForCount(5);

    const acks: OutboundMessage[] = client.decodedMessages().slice(3);
    expect(acks.length).toBe(2);
    expect(acks).toEqual(
      expect.arrayContaining([expectedAck('items', 'item1', 1, 2), expectedAck('items', 'new1', 2, 0)])
    );
    env.expectEveryMessageDecodes();
  });

  it('decodes a presence relay error', async () => {
    const env = new TestEnvironment({ forwardPresenceErrors: true });
    await env.seed();
    const viewer: RawClient = env.connect();
    const sender: RawClient = env.connect();
    viewer.send({ a: 'ps', ch: 'texts:text1', seq: 1 });
    await viewer.waitForCount(2);

    // SUT
    sender.send({ a: 'p', ch: 'texts:text1', id: 'eeeeeeeeeeeeeeeeeeeeeeee', p: { viewer: {} }, pv: 0 });
    await viewer.waitFor((message: OutboundMessage) => message.kind === 'presence-error');

    expect(viewer.decodedMessages()).toContainEqual({
      kind: 'presence-error',
      channel: 'texts:text1',
      presenceId: 'eeeeeeeeeeeeeeeeeeeeeeee',
      error: { code: 'ERR_UNKNOWN_ERROR', message: 'not relayed' }
    });
    env.expectEveryMessageDecodes();
  });

  it('decodes query fetch and subscribe replies, with and without extra', async () => {
    const env = new TestEnvironment();
    await env.seed();
    const client: RawClient = env.connect();

    // SUT
    client.send({ a: 'qf', id: 1, c: 'items', q: { $sort: { n: 1 } } });
    client.send({ a: 'qf', id: 2, c: 'items', q: { $count: { applySkipLimit: true } } });
    client.send({ a: 'qs', id: 3, c: 'items', q: { n: { $gte: 0 } } });
    client.send({ a: 'qs', id: 4, c: 'items', q: { $count: { applySkipLimit: true } } });
    client.send({
      a: 'qs',
      id: 5,
      c: 'items',
      q: {},
      r: [
        ['item1', null],
        ['item2', 1]
      ]
    });
    client.send({
      a: 'qs',
      id: 6,
      c: 'items',
      q: {},
      r: [
        ['item1', 1],
        ['item2', 1]
      ]
    });
    client.send({ a: 'qu', id: 3 });
    await client.waitFor((message: OutboundMessage) => message.kind === 'query-unsubscribe-reply');
    await client.waitFor(
      (message: OutboundMessage) => message.kind === 'query-subscribe-reply' && message.queryId === 6
    );
    await env.settle();

    const messages: OutboundMessage[] = client.decodedMessages();
    expect(messages).toContainEqual(
      expect.objectContaining({
        kind: 'query-fetch-reply',
        queryId: 1,
        results: [expect.objectContaining({ docId: 'item2' }), expect.objectContaining({ docId: 'item1' })],
        hasExtra: false
      })
    );
    expect(messages).toContainEqual({ kind: 'query-fetch-reply', queryId: 2, results: [], hasExtra: true, extra: 2 });
    expect(messages).toContainEqual(
      expect.objectContaining({
        kind: 'query-subscribe-reply',
        queryId: 3,
        data: expect.objectContaining({ form: 'results' })
      })
    );
    expect(messages).toContainEqual({
      kind: 'query-subscribe-reply',
      queryId: 4,
      data: { form: 'results', results: [] },
      hasExtra: true,
      extra: 2
    });
    expect(messages).toContainEqual(
      expect.objectContaining({
        kind: 'query-subscribe-reply',
        queryId: 5,
        data: { form: 'snapshot-map', snapshots: new Map([['item1', expect.objectContaining({ kind: 'snapshot' })]]) }
      })
    );
    expect(messages).toContainEqual(
      expect.objectContaining({ kind: 'query-subscribe-reply', queryId: 6, data: { form: 'none' } })
    );
    // The ops since version 1 of item1, sent for the `r` entries.
    expect(messages).toContainEqual(expect.objectContaining({ kind: 'op', docId: 'item1', version: 1 }));
    expect(messages).toContainEqual({ kind: 'query-unsubscribe-reply', queryId: 3 });
    env.expectEveryMessageDecodes();
  });

  it('decodes query diffs and extra updates caused by later ops', async () => {
    const env = new TestEnvironment();
    await env.seed();
    const client: RawClient = env.connect();
    client.send({ a: 'qs', id: 1, c: 'items', q: { n: { $lt: 10 }, $sort: { n: 1 } } });
    client.send({ a: 'qs', id: 2, c: 'items', q: { n: { $lt: 10 }, $count: { applySkipLimit: true } } });
    await client.waitForCount(3);

    // SUT
    await env.submitOp('items', 'item1', [{ p: ['n'], na: -5 }]);
    await client.waitFor((message: OutboundMessage) => hasDiff(message, 'move'));
    await env.createDoc('items', 'item3', { n: 5, title: 'three' });
    await client.waitFor((message: OutboundMessage) => hasDiff(message, 'insert'));
    await env.submitOp('items', 'item2', [{ p: ['n'], na: 100 }]);
    await client.waitFor((message: OutboundMessage) => hasDiff(message, 'remove'));
    await env.settle();

    const messages: OutboundMessage[] = client.decodedMessages();
    expect(messages).toContainEqual({
      kind: 'query-diff',
      queryId: 1,
      diff: [{ kind: 'move', from: 1, to: 0, howMany: 1 }]
    });
    expect(messages).toContainEqual({
      kind: 'query-diff',
      queryId: 1,
      diff: [
        {
          kind: 'insert',
          index: 2,
          values: [{ exists: true, version: 1, type: JSON0_TYPE_URI, data: { n: 5, title: 'three' }, docId: 'item3' }]
        }
      ]
    });
    expect(messages).toContainEqual({
      kind: 'query-diff',
      queryId: 1,
      diff: [{ kind: 'remove', index: 1, howMany: 1 }]
    });
    expect(messages).toContainEqual({ kind: 'query-extra', queryId: 2, hasExtra: true, extra: 3 });
    expect(messages).toContainEqual({ kind: 'query-extra', queryId: 2, hasExtra: true, extra: 2 });
    env.expectEveryMessageDecodes();
  });

  it('decodes snapshot fetch replies', async () => {
    const env = new TestEnvironment();
    await env.seed();
    const client: RawClient = env.connect();

    client.send({ a: 'nf', id: 1, c: 'items', d: 'item1', v: 1 });
    client.send({ a: 'nf', id: 2, c: 'items', d: 'item1', v: 0 });
    client.send({ a: 'nf', id: 3, c: 'texts', d: 'text1', v: 1 });
    await client.waitForCount(4);

    expect(client.decodedMessages().slice(1)).toEqual(
      expect.arrayContaining([
        {
          kind: 'snapshot-fetch-reply',
          requestId: 1,
          snapshot: { exists: true, version: 1, type: JSON0_TYPE_URI, data: { n: 1, title: 'one' } }
        },
        { kind: 'snapshot-fetch-reply', requestId: 2, snapshot: { exists: false, version: 0 } },
        {
          kind: 'snapshot-fetch-reply',
          requestId: 3,
          snapshot: expect.objectContaining({ exists: true, version: 1, type: RICH_TEXT_TYPE_URI })
        }
      ])
    );
    env.expectEveryMessageDecodes();
  });

  it('decodes plain presence between two connections', async () => {
    const env = new TestEnvironment();
    await env.seed();
    const viewer: RawClient = env.connect();
    const sender: RawClient = env.connect();
    sender.send({ a: 'hs', id: SRC, protocol: 1, protocolMinor: 2 });
    viewer.send({ a: 'ps', ch: 'texts:text1', seq: 1 });
    await viewer.waitForCount(2);
    sender.send({ a: 'ps', ch: 'texts:text1', seq: 1 });
    await viewer.waitFor((message: OutboundMessage) => message.kind === 'presence-request-relay');

    // SUT
    sender.send({ a: 'p', ch: 'texts:text1', id: 'aaaaaaaaaaaaaaaaaaaaaaaa', p: { viewer: { name: 'A' } }, pv: 0 });
    await viewer.waitFor((message: OutboundMessage) => message.kind === 'presence');
    sender.send({ a: 'pr', ch: 'texts:text1' });
    await sender.waitFor((message: OutboundMessage) => message.kind === 'presence-request-reply');
    sender.send({ a: 'pu', ch: 'texts:text1', seq: 2 });
    await sender.waitFor((message: OutboundMessage) => message.kind === 'presence-unsubscribe-reply');
    await viewer.waitFor((message: OutboundMessage) => message.kind === 'presence' && message.value === null);

    const expectedPresence: OutboundMessage = {
      kind: 'presence',
      channel: 'texts:text1',
      src: SRC,
      presenceId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      value: { viewer: { name: 'A' } },
      presenceVersion: 0,
      doc: null
    };
    expect(viewer.decodedMessages()).toContainEqual(expectedPresence);
    expect(sender.decodedMessages()).toContainEqual(expectedPresence);
    expect(viewer.decodedMessages()).toContainEqual({ ...expectedPresence, value: null });
    expect(sender.decodedMessages()).toEqual(
      expect.arrayContaining([
        { kind: 'presence-subscribe-reply', channel: 'texts:text1', seq: 1 },
        { kind: 'presence-unsubscribe-reply', channel: 'texts:text1', seq: 2 },
        { kind: 'presence-request-reply' }
      ])
    );
    // The presence relayed when the subscription ended carries the NaN seq that ShareDB gives it.
    expect(viewer.rawMessages()).toContainEqual(expect.objectContaining({ a: 'p', p: null, seq: null }));
    env.expectEveryMessageDecodes();
  });

  it('decodes doc presence, transformed by a later op, and the relay when the sender disconnects', async () => {
    const env = new TestEnvironment();
    await env.seed();
    const viewer: RawClient = env.connect();
    const sender: RawClient = env.connect();
    viewer.send({ a: 'ps', ch: 'texts.text1', seq: 1 });
    sender.send({ a: 'ps', ch: 'texts.text1', seq: 1 });
    await sender.waitFor((message: OutboundMessage) => message.kind === 'presence-subscribe-reply');
    await env.submitOp('texts', 'text1', { ops: [{ insert: 'xy' }] });

    // SUT
    sender.send({
      a: 'p',
      ch: 'texts.text1',
      id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      p: { index: 0, length: 1 },
      pv: 0,
      c: 'texts',
      d: 'text1',
      v: 1,
      t: RICH_TEXT_TYPE_URI
    });
    await viewer.waitFor((message: OutboundMessage) => message.kind === 'presence');
    sender.close();
    await viewer.waitFor((message: OutboundMessage) => message.kind === 'presence' && message.value === null);

    // The presence was made at version 1, so it was transformed by the op that made version 2.
    const docPresence: OutboundMessage = {
      kind: 'presence',
      channel: 'texts.text1',
      src: expect.any(String),
      presenceId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      value: { index: 0, length: 3 },
      presenceVersion: 0,
      doc: { collection: 'texts', docId: 'text1', version: 2, type: RICH_TEXT_TYPE_URI }
    };
    expect(viewer.decodedMessages()).toContainEqual(docPresence);
    expect(sender.decodedMessages()).toContainEqual(docPresence);
    expect(viewer.decodedMessages()).toContainEqual({ ...docPresence, value: null });
    expect(viewer.rawMessages()).toContainEqual(expect.objectContaining({ a: 'p', p: null, seq: null }));
    env.expectEveryMessageDecodes();
  });

  it('decodes error replies to every forwarded action', async () => {
    const env = new TestEnvironment();
    await env.seed();
    const client: RawClient = env.connect();
    const refusedRequests: Record<string, unknown>[] = [
      { a: 'hs', id: 'refused', protocol: 1, protocolMinor: 2 },
      { a: 'f', c: 'refused', d: 'd1' },
      { a: 's', c: 'refused', d: 'd1', v: 0 },
      { a: 'u', c: 'refused', d: 'd1' },
      { a: 'bf', c: 'refused', b: ['d1', 'd2'] },
      { a: 'bs', c: 'refused', b: { d1: 0, d2: 0 } },
      { a: 'bu', c: 'refused', b: ['d1', 'd2'] },
      { a: 'op', c: 'refused', d: 'd1', v: 0, src: SRC, seq: 1, x: {}, op: [] },
      { a: 'qf', id: 1, c: 'refused', q: {} },
      { a: 'qs', id: 2, c: 'refused', q: {}, r: [['d1', null]] },
      { a: 'qu', id: 999 },
      { a: 'nf', id: 3, c: 'refused', d: 'd1', v: 0 },
      { a: 'ps', ch: 'refused', seq: 1 },
      { a: 'pu', ch: 'refused', seq: 2 },
      { a: 'pr', ch: 'refused' },
      { a: 'p', ch: 'refused', id: 'cccccccccccccccccccccccc', p: null, pv: 0 }
    ];

    // SUT
    for (const request of refusedRequests) {
      client.send(request);
    }
    await client.waitForCount(refusedRequests.length + 1);

    const errorReplies: OutboundMessage[] = client.decodedMessages().slice(1);
    expect(
      errorReplies.map((message: OutboundMessage) => (message.kind === 'error-reply' ? message.action : null))
    ).toEqual(refusedRequests.map((request: Record<string, unknown>) => request.a));
    env.expectEveryMessageDecodes();
  });

  it('decodes error replies that ShareDB itself produces', async () => {
    const env = new TestEnvironment();
    await env.seed();
    const client: RawClient = env.connect();

    // SUT
    // An op made at a version the doc has not reached.
    client.send({ a: 'op', c: 'items', d: 'item1', v: 9, src: SRC, seq: 1, x: {}, op: [{ p: ['n'], na: 1 }] });
    // A create of a doc that exists.
    client.send({ a: 'op', c: 'items', d: 'item1', v: null, seq: 2, x: {}, create: { type: 'json0', data: {} } });
    // A past version the doc has not reached.
    client.send({ a: 'nf', id: 1, c: 'items', d: 'item1', v: 9 });
    // A doc whose read the readSnapshots middleware refuses, alone and in bulk.
    client.send({ a: 'f', c: 'items', d: 'unreadable' });
    client.send({ a: 'bf', c: 'items', b: ['item1', 'unreadable'] });
    client.send({ a: 'bs', c: 'items', b: ['item1', 'unreadable'] });
    // A doc presence of a type without presence.
    client.send({
      a: 'p',
      ch: 'items.item1',
      id: 'dddddddddddddddddddddddd',
      p: { index: 0, length: 0 },
      pv: 0,
      c: 'items',
      d: 'item1',
      v: 2,
      t: JSON0_TYPE_URI
    });
    await client.waitForCount(8);

    const messages: OutboundMessage[] = client.decodedMessages();
    expect(messages).toContainEqual(
      expect.objectContaining({
        kind: 'error-reply',
        action: 'op',
        seq: 1,
        error: expect.objectContaining({ code: 'ERR_OP_VERSION_NEWER_THAN_CURRENT_SNAPSHOT' })
      })
    );
    expect(messages).toContainEqual(
      expect.objectContaining({
        kind: 'error-reply',
        action: 'op',
        seq: 2,
        src: null,
        error: expect.objectContaining({ code: 'ERR_DOC_ALREADY_CREATED' })
      })
    );
    // This error has no code.
    expect(messages).toContainEqual(
      expect.objectContaining({
        kind: 'error-reply',
        action: 'nf',
        id: 1,
        error: { code: null, message: 'Missing ops' }
      })
    );
    expect(messages).toContainEqual(expect.objectContaining({ kind: 'error-reply', action: 'f', docId: 'unreadable' }));
    expect(messages).toContainEqual(
      expect.objectContaining({
        kind: 'error-reply',
        action: 'p',
        channel: 'items.item1',
        error: expect.objectContaining({ code: 'ERR_TYPE_DOES_NOT_SUPPORT_PRESENCE' })
      })
    );
    const bulkReplies: OutboundMessage[] = messages.filter(
      (message: OutboundMessage) => message.kind === 'bulk-fetch-reply' || message.kind === 'bulk-subscribe-reply'
    );
    expect(bulkReplies.length).toBe(2);
    for (const reply of bulkReplies) {
      expect(reply).toEqual(
        expect.objectContaining({
          snapshots: new Map([
            ['item1', expect.objectContaining({ kind: 'snapshot' })],
            ['unreadable', { kind: 'error', error: { code: 'ERR_UNKNOWN_ERROR', message: 'unreadable' } }]
          ])
        })
      );
    }
    env.expectEveryMessageDecodes();
  });
});

function hasDiff(message: OutboundMessage, kind: 'insert' | 'remove' | 'move'): boolean {
  return message.kind === 'query-diff' && message.diff.some(item => item.kind === kind);
}

function expectedAck(collection: string, docId: string, seq: number, version: number): OutboundMessage {
  return {
    kind: 'op',
    collection: collection,
    docId: docId,
    version: version,
    src: SRC,
    seq: seq,
    content: { kind: 'none' },
    fixup: []
  };
}

/**
 * A client of the ShareDB protocol with no ShareDB client library: it writes raw messages into the stream ShareDB
 * listens on and keeps every message ShareDB writes back, after a JSON round trip as the gateway would see it.
 */
class RawClient {
  private readonly received: unknown[] = [];
  private readonly stream: Duplex;

  constructor(backend: ShareDB) {
    this.stream = new Duplex({
      objectMode: true,
      read: () => {},
      write: (message: unknown, _encoding: string, callback: () => void) => {
        this.received.push(JSON.parse(JSON.stringify(message)));
        callback();
      }
    });
    backend.listen(this.stream);
  }

  send(message: Record<string, unknown>): void {
    // ShareDB adds `error` to the request object it replies to, so each message is a fresh copy.
    this.stream.push(JSON.parse(JSON.stringify(message)));
  }

  close(): void {
    this.stream.push(null);
    this.stream.emit('close');
  }

  rawMessages(): unknown[] {
    return this.received;
  }

  decodedMessages(): OutboundMessage[] {
    return this.received.map((message: unknown) => decoded(message));
  }

  kinds(): OutboundMessage['kind'][] {
    return this.decodedMessages().map((message: OutboundMessage) => message.kind);
  }

  async waitForCount(count: number): Promise<void> {
    await this.until(() => this.received.length >= count, `${count} messages`);
  }

  async waitFor(predicate: (message: OutboundMessage) => boolean): Promise<void> {
    await this.until(() => this.decodedMessages().some(predicate), predicate.toString());
  }

  private async until(condition: () => boolean, description: string): Promise<void> {
    const timeoutMs = 2000;
    const start: number = Date.now();
    while (!condition()) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`timed out waiting for ${description}; received ${JSON.stringify(this.received)}`);
      }
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  }
}

/** A ShareDB backend configured as the realtime server configures it, with an in-memory database. */
class TestEnvironment {
  readonly backend: ShareDB;
  private readonly clients: RawClient[] = [];
  private readonly serverConnection: Connection;

  constructor({ forwardPresenceErrors = false }: { forwardPresenceErrors?: boolean } = {}) {
    const ShareDBMingoType = ShareDBMingo.extendMemoryDB(ShareDB.MemoryDB);
    this.backend = new ShareDB({
      db: new ShareDBMingoType(),
      presence: true,
      disableDocAction: true,
      disableSpaceDelimitedActions: true,
      doNotForwardSendPresenceErrorsToClient: !forwardPresenceErrors
    });
    if (forwardPresenceErrors) {
      (this.backend as any).use('sendPresence', (_context: unknown, next: (err?: string) => void) =>
        next('not relayed')
      );
    }
    // Refuses every request that names the collection or channel 'refused', the query id 999 or the connection id
    // 'refused', as the realtime server's receive middleware refuses requests.
    this.backend.use('receive', (context, next) => {
      const data: Record<string, unknown> = context.data as Record<string, unknown>;
      if (data.c === 'refused' || data.ch === 'refused' || data.id === 999 || data.id === 'refused') {
        next('refused by the test');
        return;
      }
      next();
    });
    this.backend.use('readSnapshots', (context, next) => {
      for (const snapshot of context.snapshots) {
        if (snapshot.id === 'unreadable') {
          (context as any).rejectSnapshotRead(snapshot, 'unreadable');
        }
      }
      next();
    });
    this.serverConnection = this.backend.connect();
  }

  connect(): RawClient {
    const client = new RawClient(this.backend);
    this.clients.push(client);
    return client;
  }

  /** Creates items/item1 (version 2), items/item2 (version 1) and the rich-text texts/text1 (version 1). */
  async seed(): Promise<void> {
    await this.createDoc('items', 'item1', { n: 1, title: 'one' });
    await this.submitOp('items', 'item1', [{ p: ['n'], na: 1 }]);
    await this.createDoc('items', 'item2', { n: 1, title: 'two' });
    await this.createDoc('texts', 'text1', { ops: [{ insert: 'text\n' }] }, RICH_TEXT_TYPE_URI);
  }

  async createDoc(collection: string, id: string, data: unknown, type: string = JSON0_TYPE_URI): Promise<void> {
    const doc: Doc = this.serverConnection.get(collection, id);
    await new Promise<void>((resolve, reject) =>
      doc.create(data, type as any, err => (err == null ? resolve() : reject(err)))
    );
  }

  async submitOp(collection: string, id: string, op: any): Promise<void> {
    const doc: Doc = this.serverConnection.get(collection, id);
    await new Promise<void>((resolve, reject) => doc.fetch(err => (err == null ? resolve() : reject(err))));
    await new Promise<void>((resolve, reject) =>
      doc.submitOp(op, {}, (err: unknown) => (err == null ? resolve() : reject(err)))
    );
  }

  async deleteDoc(collection: string, id: string): Promise<void> {
    const doc: Doc = this.serverConnection.get(collection, id);
    await new Promise<void>((resolve, reject) => doc.fetch(err => (err == null ? resolve() : reject(err))));
    await new Promise<void>((resolve, reject) =>
      doc.del({}, (err: unknown) => (err == null ? resolve() : reject(err)))
    );
  }

  /** Waits long enough for messages already on their way to arrive. */
  async settle(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  /** Every message every client received decodes. */
  expectEveryMessageDecodes(): void {
    for (const client of this.clients) {
      for (const message of client.rawMessages()) {
        const result: DecodeResult<OutboundMessage> = decodeOutboundMessage(message);
        expect(result, JSON.stringify(message)).toEqual(expect.objectContaining({ ok: true }));
      }
    }
  }
}

describe('decodeOutboundMessage, ops stored without src or seq', () => {
  it('reads null src and seq, which MongoDB can store for missing values, as absent', () => {
    const result = decodeOutboundMessage({
      a: 'op',
      c: 'texts',
      d: 'p1:MAT:1:target',
      v: 3,
      src: null,
      seq: null,
      op: { ops: [] }
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.kind === 'op' ? [result.value.src, result.value.seq] : undefined).toEqual([
      null,
      null
    ]);
  });
});
