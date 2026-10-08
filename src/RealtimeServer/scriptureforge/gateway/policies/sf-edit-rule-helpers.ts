import {
  DecodeFailure,
  DecodeResult,
  Decoder,
  exactFields,
  failure,
  Fields,
  integerValue,
  literal,
  stringValue,
  success
} from '../../../common/gateway/decoder';
import { ComponentCheck } from '../../../common/gateway/json0-edit-rules';
import { Operation } from '../../../common/models/project-rights';
import { hasOwnProp, isPlainObject } from '../../../common/utils/type-utils';
import { SFProjectDomain } from '../../models/sf-project-rights';
import { isDataId } from '../sf-doc-ids';
import { SFEditRuleContext } from './policy-helpers';

/**
 * Value decoders and rule helpers shared by the json0 edit rules and create checks of Scripture Forge collections.
 * The value domains follow what the client sends (see each decoder), bounded so that no value is unreasonably large.
 */

/** What the edit rules of Scripture Forge collections are given to decide a component. */
export type SFComponentCheck = ComponentCheck<SFEditRuleContext>;

/** The longest free text accepted, such as a question, answer, comment or note. */
export const MAX_TEXT_LENGTH = 100_000;
/** The longest short string accepted, such as a title, a term id or a category name. */
export const MAX_SHORT_STRING_LENGTH = 1_000;
/** The longest audio or file URL accepted. */
const MAX_URL_LENGTH = 2_000;
/** The most entities of one kind a created doc may hold, such as the answers of a question. */
export const MAX_CREATED_ENTITIES = 1_000;

/** Free text, which may be empty. */
export const textValue: Decoder<string> = stringValue({ maxLength: MAX_TEXT_LENGTH });

/** A short string, which may be empty. */
export const shortString: Decoder<string> = stringValue({ maxLength: MAX_SHORT_STRING_LENGTH });

/** A date as the client writes it with `new Date().toJSON()`. */
export const isoDate: Decoder<string> = stringValue({
  maxLength: 24,
  pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/
});

/** A new id, as the client's `objectId()` makes them: 24 lowercase hex characters. */
export const objectIdValue: Decoder<string> = stringValue({ minLength: 24, maxLength: 24, pattern: /^[0-9a-f]{24}$/ });

/** The data id of an existing entity, such as an answer the user has read. Data ids made in the past may not be hex. */
export const dataIdValue: Decoder<string> = (input: unknown, path: string): DecodeResult<string> =>
  typeof input === 'string' && input.length > 0 && isDataId(input)
    ? success(input)
    : failure(path, 'expected a data id');

/**
 * An audio URL as the client stores it: the server path of an uploaded file (`/{projectId}/{userId}_{dataId}.mp3?t=…`),
 * or a `blob:` URL of a recording kept offline until it can be uploaded. Empty is accepted too, as the client can leave
 * an empty URL on an answer whose recording was removed. Other URLs, such as those of other sites, are refused.
 */
export const audioUrlValue: Decoder<string> = stringValue({
  maxLength: MAX_URL_LENGTH,
  pattern: /^(?:\/[^/\\\s][^\\\s]*|blob:\S+)?$/
});

/** Accepts a finite number from `min` to `max`, such as a confidence threshold. */
export function numberInRange(min: number, max: number): Decoder<number> {
  return (input: unknown, path: string): DecodeResult<number> =>
    typeof input === 'number' && Number.isFinite(input) && input >= min && input <= max
      ? success(input)
      : failure(path, `expected a number from ${min} to ${max}`);
}

/** The largest book, chapter and verse number accepted in a verse reference. */
const MAX_VERSE_REF_NUMBER = 999;

/** A VerseRefData: book, chapter and verse numbers, and the verse as text (such as `3-5`) when it is not just a number. */
export interface VerseRefValue {
  readonly bookNum: number;
  readonly chapterNum: number;
  readonly verseNum: number;
  readonly verse?: string;
}

export const verseRefValue: Decoder<VerseRefValue> = (input: unknown, path: string): DecodeResult<VerseRefValue> => {
  const fields: DecodeResult<Fields<'bookNum' | 'chapterNum' | 'verseNum', 'verse'>> = exactFields(
    input,
    path,
    ['bookNum', 'chapterNum', 'verseNum'],
    ['verse']
  );
  if (!fields.ok) {
    return fields;
  }
  const f: Fields<'bookNum' | 'chapterNum' | 'verseNum', 'verse'> = fields.value;
  const number: Decoder<number> = integerValue({ min: 0, max: MAX_VERSE_REF_NUMBER });
  const bookNum: DecodeResult<number> = number(f.required('bookNum'), f.path('bookNum'));
  const chapterNum: DecodeResult<number> = number(f.required('chapterNum'), f.path('chapterNum'));
  const verseNum: DecodeResult<number> = number(f.required('verseNum'), f.path('verseNum'));
  if (!bookNum.ok) return bookNum;
  if (!chapterNum.ok) return chapterNum;
  if (!verseNum.ok) return verseNum;
  if (!f.has('verse')) {
    return success({ bookNum: bookNum.value, chapterNum: chapterNum.value, verseNum: verseNum.value });
  }
  const verse: DecodeResult<string> = stringValue({ maxLength: 100 })(f.optional('verse'), f.path('verse'));
  if (!verse.ok) return verse;
  return success({
    bookNum: bookNum.value,
    chapterNum: chapterNum.value,
    verseNum: verseNum.value,
    verse: verse.value
  });
};

/** A note thread's position in its verse's text: `{ start, length }`, both non-negative. */
export interface TextAnchorValue {
  readonly start: number;
  readonly length: number;
}

export const textAnchorValue: Decoder<TextAnchorValue> = (
  input: unknown,
  path: string
): DecodeResult<TextAnchorValue> => {
  const fields: DecodeResult<Fields<'start' | 'length', never>> = exactFields(input, path, ['start', 'length']);
  if (!fields.ok) {
    return fields;
  }
  const offset: Decoder<number> = integerValue({ min: 0, max: Number.MAX_SAFE_INTEGER });
  const start: DecodeResult<number> = offset(fields.value.required('start'), fields.value.path('start'));
  const length: DecodeResult<number> = offset(fields.value.required('length'), fields.value.path('length'));
  if (!start.ok) return start;
  if (!length.ok) return length;
  return success({ start: start.value, length: length.value });
};

/** Accepts `true` only: entities are marked deleted, never undeleted. */
export const trueValue: Decoder<true> = literal(true);

/**
 * Decodes an optional field with `decoder`. Gives success(undefined) when the field is absent, so callers can tell
 * "absent" from "present and accepted" by the value.
 */
export function optionalField<K extends string, T>(
  fields: Fields<never, K>,
  key: K,
  decoder: Decoder<T>
): DecodeResult<T | undefined> {
  return fields.has(key) ? decoder(fields.optional(key), fields.path(key)) : success(undefined);
}

/** The session user's id. */
export function userIdOf(check: SFComponentCheck): string {
  return check.context.session.userId;
}

/** Whether the session user has a right in the doc's project (see ProjectAccess.hasRight). */
export function hasProjectRight(
  check: SFComponentCheck,
  domain: SFProjectDomain,
  operation: Operation,
  ownerRef: string | null
): boolean {
  return check.context.project?.hasRight(userIdOf(check), domain, operation, ownerRef) ?? false;
}

/** The `ownerRef` of a value, or null when it has none that is a string. */
export function ownerRefOfValue(value: unknown): string | null {
  return hasOwnProp(value, 'ownerRef') && typeof value.ownerRef === 'string' ? value.ownerRef : null;
}

/** The `ownerRef` of the entity at the first `depth` elements of the component's path, in the doc. */
export function ownerAt(check: SFComponentCheck, depth: number): string | null {
  return ownerRefOfValue(check.valueAt(depth));
}

/** Whether the value inserted by the component is an entity owned by the session user. */
export function insertsOwnEntity(check: SFComponentCheck): boolean {
  return ownerRefOfValue(check.inserted) === userIdOf(check);
}

/**
 * Whether the inserted entity's `dataId` is new to the list it is inserted into. The client and the backend find
 * answers, comments and notes by `dataId`, so an entity that copied another's would catch edits meant for that one.
 */
export function insertsNewDataId(check: SFComponentCheck): boolean {
  const inserted: unknown = check.inserted;
  const dataId: unknown = hasOwnProp(inserted, 'dataId') ? inserted.dataId : undefined;
  if (typeof dataId !== 'string' || !Array.isArray(check.valueAt(check.path.length - 1))) {
    return false;
  }
  return check.countInList(check.path.length - 1, 'dataId', dataId) === 0;
}

/**
 * Whether a list insert's index is at most the list's length in the doc. json0 would append an item inserted further
 * on, but the client inserts only within the list (or at its end), so anything further is refused.
 */
export function insertsWithinList(check: SFComponentCheck): boolean {
  const index: string | number | undefined = check.path[check.path.length - 1];
  const list: unknown = check.valueAt(check.path.length - 1);
  return typeof index === 'number' && Array.isArray(list) && index <= list.length;
}

/**
 * Whether the component leaves the doc as it is: a `set` of the value already there, or an `unset` of a field that is
 * absent. ShareDB can turn a client's change into one when it transforms the op against a concurrent op that made the
 * same change.
 */
export function changesNothing(check: SFComponentCheck): boolean {
  const current: unknown = check.valueAt(check.path.length);
  if (check.action === 'set') {
    return check.inserted !== undefined && jsonEquals(check.inserted, current);
  }
  if (check.action === 'unset') {
    return current === undefined;
  }
  return false;
}

/** Whether two JSON values are equal: the same primitives, or arrays and plain objects with equal contents. */
export function jsonEquals(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((element: unknown, index: number) => jsonEquals(element, b[index]))
    );
  }
  if (!isPlainObject(a) || !isPlainObject(b)) {
    return false;
  }
  const aKeys: string[] = Object.keys(a);
  const bKeys: string[] = Object.keys(b);
  return (
    aKeys.length === bKeys.length &&
    aKeys.every((key: string) => Object.prototype.hasOwnProperty.call(b, key) && jsonEquals(a[key], b[key]))
  );
}

/**
 * Whether no two of the values are the same, such as the data ids of the answers in a created question. Values that
 * are undefined are not compared.
 */
export function allDistinct(values: Iterable<string | undefined>): boolean {
  const seen = new Set<string>();
  for (const value of values) {
    if (value === undefined) {
      continue;
    }
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
  }
  return true;
}

/** The first failure among the results, or undefined when all of them succeeded. */
export function firstFailure(results: readonly DecodeResult<unknown>[]): DecodeFailure | undefined {
  for (const result of results) {
    if (!result.ok) {
      return result;
    }
  }
  return undefined;
}
