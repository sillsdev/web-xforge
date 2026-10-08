import { decode, DecodeResult } from './decoder';
import { DeltaOp, Json0Component, OpEdit } from './inbound-messages';
import {
  encodeDeltaOp,
  encodeJson0Component,
  encodeOpEdit,
  json0OpDecoder,
  MAX_JSON0_OP_COMPONENTS,
  MAX_JSON0_PATH_KEY_LENGTH,
  MAX_JSON0_PATH_LENGTH,
  opEditDecoder,
  richTextOpDecoder
} from './op-content-decoders';

const clientJson0 = json0OpDecoder({ allowListReplace: false });
const transformedJson0 = json0OpDecoder({ allowListReplace: true });

/** Decodes a json0 op as the client decoder does, and gives the components or fails the test. */
function decodeJson0(input: unknown): readonly Json0Component[] {
  const result: DecodeResult<readonly Json0Component[]> = decode(clientJson0, input);
  if (!result.ok) {
    throw new Error(`expected the op to be accepted, but: ${result.path}: ${result.message}`);
  }
  return result.value;
}

function decodeDelta(input: unknown): readonly DeltaOp[] {
  const result: DecodeResult<readonly DeltaOp[]> = decode(richTextOpDecoder, input);
  if (!result.ok) {
    throw new Error(`expected the delta to be accepted, but: ${result.path}: ${result.message}`);
  }
  return result.value;
}

describe('json0OpDecoder', () => {
  it('accepts every component kind the client produces', () => {
    const op = [
      { p: ['answers', 0], li: { dataId: 'a1', text: 'An answer' } },
      { p: ['answers', 1, 'likes', 0], ld: { ownerRef: 'user01' } },
      { p: ['status'], oi: 'resolved', od: 'todo' },
      { p: ['sites', 'sf', 'currentProjectId'], oi: 'project01' },
      { p: ['audioUrl'], od: 'https://example.org/audio.mp3' }
    ];
    expect(decodeJson0(op)).toEqual([
      { kind: 'list-insert', path: ['answers', 0], inserted: { dataId: 'a1', text: 'An answer' } },
      { kind: 'list-delete', path: ['answers', 1, 'likes', 0], deleted: { ownerRef: 'user01' } },
      { kind: 'object-replace', path: ['status'], inserted: 'resolved', deleted: 'todo' },
      { kind: 'object-insert', path: ['sites', 'sf', 'currentProjectId'], inserted: 'project01' },
      { kind: 'object-delete', path: ['audioUrl'], deleted: 'https://example.org/audio.mp3' }
    ]);
  });

  it('accepts an empty op', () => {
    expect(decodeJson0([])).toEqual([]);
  });

  it('accepts null, boolean, number and nested values', () => {
    const op = [
      { p: ['a'], oi: null },
      { p: ['b'], oi: false },
      { p: ['c'], oi: -1.5 },
      { p: ['d', 0], li: [1, 'two', { three: [3] }] }
    ];
    expect(decodeJson0(op).length).toBe(4);
  });

  it('copies values, so that later changes to the input do not reach the decoded op', () => {
    const inserted = { text: 'original' };
    const components: readonly Json0Component[] = decodeJson0([{ p: ['answers', 0], li: inserted }]);
    inserted.text = 'changed';
    expect(components[0]).toEqual({ kind: 'list-insert', path: ['answers', 0], inserted: { text: 'original' } });
  });

  it('accepts a list replace only when allowed', () => {
    const op = [{ p: ['answers', 0], li: 'new', ld: 'old' }];
    expect(decode(clientJson0, op).ok).toBe(false);
    expect(decode(transformedJson0, op)).toEqual({
      ok: true,
      value: [{ kind: 'list-replace', path: ['answers', 0], inserted: 'new', deleted: 'old' }]
    });
  });

  it.each([
    ['number add', { p: ['count'], na: 1 }],
    ['string insert', { p: ['text', 0], si: 'a' }],
    ['string delete', { p: ['text', 0], sd: 'a' }],
    ['list move', { p: ['answers', 0], lm: 1 }],
    ['subtype op', { p: ['text'], t: 'text0', o: [{ p: 0, i: 'a' }] }],
    ['component with no change', { p: ['a'] }],
    ['empty object', {}],
    ['missing path', { oi: 1 }],
    ['list and object keys together', { p: ['a', 0], li: 1, oi: 1 }],
    ['list insert with object delete', { p: ['a'], li: 1, od: 1 }],
    ['extra key', { p: ['a'], oi: 1, extra: true }],
    ['empty path', { p: [], oi: 1 }],
    ['path not an array', { p: 'a', oi: 1 }],
    ['path with a negative index', { p: ['a', -1], li: 1 }],
    ['path with a fractional index', { p: ['a', 1.5], li: 1 }],
    ['path with an unsafe integer', { p: ['a', Number.MAX_SAFE_INTEGER + 1], li: 1 }],
    ['path with NaN', { p: ['a', NaN], li: 1 }],
    ['path with null', { p: ['a', null], oi: 1 }],
    ['path with a boolean', { p: [true], oi: 1 }],
    ['path with __proto__', { p: ['__proto__', 'polluted'], oi: 1 }],
    ['path with constructor', { p: ['constructor', 'prototype'], oi: 1 }],
    ['path with prototype', { p: ['a', 'prototype'], oi: 1 }],
    ['value with an undefined', { p: ['a'], oi: undefined }],
    ['value that is a function', { p: ['a'], oi: () => 1 }],
    ['value that is infinite', { p: ['a'], oi: Infinity }],
    ['value that is a Date', { p: ['a'], oi: new Date() }],
    ['component that is an array', [['a'], 1]],
    ['component that is null', null],
    ['component that is a string', 'oi']
  ])('rejects a component that is a %s', (_name: string, component: unknown) => {
    expect(decode(clientJson0, [component]).ok).toBe(false);
    expect(decode(transformedJson0, [component]).ok).toBe(false);
  });

  it('rejects a value holding a __proto__ key that JSON.parse made an own property', () => {
    const op: unknown = JSON.parse('[{"p": ["a"], "oi": {"__proto__": {"admin": true}}}]');
    expect(decode(clientJson0, op)).toEqual({ ok: false, path: '$[0].oi.__proto__', message: 'forbidden key' });
  });

  it('rejects a value holding a constructor key', () => {
    const op: unknown = JSON.parse('[{"p": ["a"], "li": {"constructor": {"prototype": {}}}}]');
    expect(decode(clientJson0, op).ok).toBe(false);
  });

  it('rejects a component whose keys are only inherited', () => {
    const component: unknown = Object.create({ p: ['a'], oi: 1 });
    expect(decode(clientJson0, [component]).ok).toBe(false);
  });

  it('rejects an op that is not an array', () => {
    expect(decode(clientJson0, { p: ['a'], oi: 1 }).ok).toBe(false);
    expect(decode(clientJson0, { ops: [] }).ok).toBe(false);
    expect(decode(clientJson0, null).ok).toBe(false);
    expect(decode(clientJson0, 'op').ok).toBe(false);
  });

  it('bounds the number of components, the path length and path key length', () => {
    const tooManyComponents: unknown[] = Array.from({ length: MAX_JSON0_OP_COMPONENTS + 1 }, () => ({
      p: ['a'],
      oi: 1
    }));
    expect(decode(clientJson0, tooManyComponents).ok).toBe(false);
    expect(decode(clientJson0, tooManyComponents.slice(1)).ok).toBe(true);

    const longPath: string[] = Array.from({ length: MAX_JSON0_PATH_LENGTH }, () => 'a');
    expect(decode(clientJson0, [{ p: longPath, oi: 1 }]).ok).toBe(true);
    expect(decode(clientJson0, [{ p: [...longPath, 'a'], oi: 1 }]).ok).toBe(false);

    const longKey: string = 'k'.repeat(MAX_JSON0_PATH_KEY_LENGTH);
    expect(decode(clientJson0, [{ p: [longKey], oi: 1 }]).ok).toBe(true);
    expect(decode(clientJson0, [{ p: [longKey + 'k'], oi: 1 }]).ok).toBe(false);
  });
});

describe('richTextOpDecoder', () => {
  it('accepts every op kind the client produces', () => {
    const delta = {
      ops: [
        { retain: 5 },
        { retain: 3, attributes: { segment: 'verse_1_1', bold: null } },
        { insert: 'In the beginning' },
        { insert: 'God', attributes: { segment: 'verse_1_1' } },
        { insert: { verse: { number: '2', style: 'v' } } },
        { insert: { blank: true }, attributes: { segment: 'verse_1_2' } },
        { delete: 4 }
      ]
    };
    expect(decodeDelta(delta)).toEqual([
      { kind: 'retain', length: 5, attributes: null },
      { kind: 'retain', length: 3, attributes: { segment: 'verse_1_1', bold: null } },
      { kind: 'insert-text', text: 'In the beginning', attributes: null },
      { kind: 'insert-text', text: 'God', attributes: { segment: 'verse_1_1' } },
      { kind: 'insert-embed', embed: { verse: { number: '2', style: 'v' } }, attributes: null },
      { kind: 'insert-embed', embed: { blank: true }, attributes: { segment: 'verse_1_2' } },
      { kind: 'delete', length: 4 }
    ]);
  });

  it('accepts an empty delta', () => {
    expect(decodeDelta({ ops: [] })).toEqual([]);
  });

  it('accepts an empty text insert', () => {
    expect(decodeDelta({ ops: [{ insert: '' }] })).toEqual([{ kind: 'insert-text', text: '', attributes: null }]);
  });

  it.each([
    ['retain of an embed', { retain: { verse: true } }],
    ['retain of zero', { retain: 0 }],
    ['negative retain', { retain: -1 }],
    ['fractional retain', { retain: 1.5 }],
    ['delete of zero', { delete: 0 }],
    ['delete with attributes', { delete: 1, attributes: { bold: true } }],
    ['delete given as a string', { delete: '1' }],
    ['insert of a number', { insert: 5 }],
    ['insert of null', { insert: null }],
    ['insert of an array', { insert: ['a'] }],
    ['insert and retain together', { insert: 'a', retain: 1 }],
    ['retain and delete together', { retain: 1, delete: 1 }],
    ['op with no action', { attributes: { bold: true } }],
    ['empty op', {}],
    ['op with an extra key', { insert: 'a', extra: 1 }],
    ['attributes that are not an object', { insert: 'a', attributes: 'bold' }],
    ['attributes that are null', { insert: 'a', attributes: null }],
    ['attributes that are an array', { retain: 1, attributes: ['bold'] }],
    ['op that is a string', 'insert'],
    ['op that is null', null]
  ])('rejects an op that is a %s', (_name: string, op: unknown) => {
    expect(decode(richTextOpDecoder, { ops: [op] }).ok).toBe(false);
  });

  it('rejects an embed or attributes holding a forbidden key', () => {
    expect(decode(richTextOpDecoder, JSON.parse('{"ops": [{"insert": {"__proto__": {}}}]}')).ok).toBe(false);
    expect(decode(richTextOpDecoder, JSON.parse('{"ops": [{"retain": 1, "attributes": {"constructor": 1}}]}')).ok).toBe(
      false
    );
  });

  it('rejects anything other than an object with exactly the key ops', () => {
    expect(decode(richTextOpDecoder, [{ insert: 'a' }]).ok).toBe(false);
    expect(decode(richTextOpDecoder, { ops: [], extra: 1 }).ok).toBe(false);
    expect(decode(richTextOpDecoder, {}).ok).toBe(false);
    expect(decode(richTextOpDecoder, { ops: { insert: 'a' } }).ok).toBe(false);
    expect(decode(richTextOpDecoder, Object.create({ ops: [] })).ok).toBe(false);
    expect(decode(richTextOpDecoder, null).ok).toBe(false);
  });
});

describe('opEditDecoder', () => {
  it('decodes json0 and rich-text edits by the collection OT type', () => {
    const json0: DecodeResult<OpEdit> = decode(opEditDecoder('json0', { allowListReplace: false }), [
      { p: ['a'], oi: 1 }
    ]);
    expect(json0).toEqual({
      ok: true,
      value: { otType: 'json0', components: [{ kind: 'object-insert', path: ['a'], inserted: 1 }] }
    });
    const richText: DecodeResult<OpEdit> = decode(opEditDecoder('rich-text', { allowListReplace: false }), {
      ops: [{ insert: 'a' }]
    });
    expect(richText).toEqual({
      ok: true,
      value: { otType: 'rich-text', ops: [{ kind: 'insert-text', text: 'a', attributes: null }] }
    });
  });

  it('rejects an edit in the form of the other OT type', () => {
    expect(decode(opEditDecoder('json0', { allowListReplace: false }), { ops: [] }).ok).toBe(false);
    expect(decode(opEditDecoder('rich-text', { allowListReplace: false }), []).ok).toBe(false);
  });

  it('passes allowListReplace on to the json0 decoder', () => {
    const op = [{ p: ['a', 0], li: 1, ld: 2 }];
    expect(decode(opEditDecoder('json0', { allowListReplace: false }), op).ok).toBe(false);
    expect(decode(opEditDecoder('json0', { allowListReplace: true }), op).ok).toBe(true);
  });
});

describe('encoders', () => {
  it('encode a json0 op into exactly what was decoded', () => {
    const op = [
      { p: ['answers', 0], li: { text: 'a' } },
      { p: ['answers', 1], ld: { text: 'b' } },
      { p: ['status'], oi: 'resolved', od: 'todo' },
      { p: ['a'], oi: null },
      { p: ['b'], od: 3 }
    ];
    expect(encodeOpEdit({ otType: 'json0', components: decodeJson0(op) })).toEqual(op);
    expect(encodeOpEdit({ otType: 'json0', components: [] })).toEqual([]);
  });

  it('encode a list replace', () => {
    expect(encodeJson0Component({ kind: 'list-replace', path: ['a', 0], inserted: 1, deleted: 2 })).toEqual({
      p: ['a', 0],
      li: 1,
      ld: 2
    });
  });

  it('encode a delta into exactly what was decoded', () => {
    const delta = {
      ops: [
        { retain: 2 },
        { retain: 1, attributes: { bold: null } },
        { insert: 'text' },
        { insert: 'more', attributes: { segment: 's' } },
        { insert: { verse: { number: '1' } } },
        { insert: { blank: true }, attributes: { segment: 's' } },
        { delete: 3 }
      ]
    };
    expect(encodeOpEdit({ otType: 'rich-text', ops: decodeDelta(delta) })).toEqual(delta);
    expect(encodeOpEdit({ otType: 'rich-text', ops: [] })).toEqual({ ops: [] });
  });

  it('leave out attributes when an op has none', () => {
    expect(Object.keys(encodeDeltaOp({ kind: 'insert-text', text: 'a', attributes: null }))).toEqual(['insert']);
    expect(Object.keys(encodeDeltaOp({ kind: 'retain', length: 1, attributes: null }))).toEqual(['retain']);
  });

  it('do not share the path array with the decoded component', () => {
    const component: Json0Component = { kind: 'object-insert', path: ['a'], inserted: 1 };
    expect(encodeJson0Component(component).p).not.toBe(component.path);
  });
});
