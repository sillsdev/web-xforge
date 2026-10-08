import { GatewaySession, QueryAuthorization } from '../../../common/gateway/authorization';
import {
  arrayOf,
  DecodeResult,
  Decoder,
  exactFields,
  failure,
  Fields,
  integerValue,
  literal,
  nullable,
  oneOf,
  ROOT_PATH,
  stringValue,
  success
} from '../../../common/gateway/decoder';
import { GatewayDataSource } from '../../../common/gateway/gateway-data-source';
import { ProjectDataPolicy } from '../policies/project-data-policy';
import { EpochRecordingProjectSource, epochsAreCurrent, ProjectAccessCache } from '../project-access';
import { READ_GRANT_TTL_MS } from '../read-grants';
import { PolicyDecision } from '../sf-collection-policy';
import { SFAccessContext } from '../sf-access-context';
import { isDataId, isHexId } from '../sf-doc-ids';
import { UserProfileCache } from '../user-profile-cache';

/**
 * Pieces shared by Scripture Forge's query registry entries: the services the entries decide with, decoders for the
 * values that several query shapes contain, and helpers that turn policy decisions into query authorizations without
 * ever rejecting.
 */

/** The process-wide services the query registry decides with. */
export interface SFQueryServices {
  readonly projects: ProjectAccessCache;
  readonly profiles: UserProfileCache;
  readonly data: GatewayDataSource;
}

/** The access context of one session, for asking the collection policies. */
export function accessContext(services: SFQueryServices, session: GatewaySession): SFAccessContext {
  return { session: session, projects: services.projects, profiles: services.profiles, data: services.data };
}

/**
 * The id no doc has: ShareDB refuses to create a doc with an empty id. A built query that must match nothing (because
 * the session may not see what the client asked for) matches this id.
 */
export const NO_DOC_ID = '';

// Authorization

export const AUTHORIZED: QueryAuthorization = { kind: 'authorized' };

export function refused(reason: string): QueryAuthorization {
  return { kind: 'refused', reason: reason };
}

export function fromPolicyDecision(decision: PolicyDecision): QueryAuthorization {
  return decision.allowed ? AUTHORIZED : refused(decision.reason);
}

/**
 * How long a query's authorization that read a project holds before the query is authorized again, in case a change
 * of the project's membership or permissions was missed (as for read decisions, see READ_GRANT_TTL_MS).
 */
export const QUERY_AUTHORIZATION_TTL_MS = READ_GRANT_TTL_MS;

/**
 * Runs a policy check with the session's access context and gives its outcome as a query authorization. A check that
 * rejects (for example because the project could not be read from the database) is a refusal, so that the gateway
 * never sees a rejected promise. An authorization stops being current when a project the check read moves to a new
 * read epoch (its membership or permissions may have changed), or, if it read one, once QUERY_AUTHORIZATION_TTL_MS
 * has passed.
 */
export async function authorizeSafely(
  services: SFQueryServices,
  session: GatewaySession,
  decide: (context: SFAccessContext) => Promise<PolicyDecision>,
  now: () => number = Date.now
): Promise<QueryAuthorization> {
  const recorder = new EpochRecordingProjectSource(services.projects);
  const decidedAtMs: number = now();
  let decision: PolicyDecision;
  try {
    decision = await decide({ ...accessContext(services, session), projects: recorder });
  } catch {
    return refused('access could not be decided');
  }
  if (!decision.allowed) {
    return refused(decision.reason);
  }
  const epochs: ReadonlyMap<string, number> = recorder.epochs;
  if (epochs.size === 0) {
    return AUTHORIZED;
  }
  return {
    kind: 'authorized',
    isCurrent: (): boolean =>
      now() - decidedAtMs < QUERY_AUTHORIZATION_TTL_MS && epochsAreCurrent(services.projects, epochs)
  };
}

/** A data id no doc needs to have, for asking a policy about a project data id where no doc is. */
const ANY_DATA_ID = 'any';

/**
 * Whether the session may read every doc that `policy`'s collection could hold in the project. A project data policy's
 * readById decides from the project alone, without looking for a doc, whether the session could read any doc at an id
 * in the project (see ProjectDataPolicy.mayReadAnyDoc), so it is asked about an id in the project.
 */
export function mayReadEveryDocInProject(
  policy: ProjectDataPolicy,
  projectId: string,
  context: SFAccessContext
): Promise<PolicyDecision> {
  return policy.readById(`${projectId}:${ANY_DATA_ID}`, context);
}

// Decoding

/** The value `decoder` accepts, or undefined when it does not accept `input`. */
export function accept<T>(decoder: Decoder<T>, input: unknown): T | undefined {
  const result: DecodeResult<T> = decoder(input, ROOT_PATH);
  return result.ok ? result.value : undefined;
}

/** The fields of an object with exactly these keys (see exactFields), or undefined when it has other keys. */
export function fieldsOf<const Required extends string, const Optional extends string = never>(
  input: unknown,
  required: readonly Required[],
  optional: readonly Optional[] = []
): Fields<Required, Optional> | undefined {
  return accept(
    (value: unknown, path: string): DecodeResult<Fields<Required, Optional>> =>
      exactFields(value, path, required, optional),
    input
  );
}

/** The value of the only field of `{ [key]: value }`, if `decoder` accepts it. */
export function singleField<T>(input: unknown, key: string, decoder: Decoder<T>): T | undefined {
  const fields: Fields<string, never> | undefined = fieldsOf(input, [key]);
  return fields == null ? undefined : accept(decoder, fields.required(key));
}

/** Accepts any value, for reading a part of a query that is checked afterwards. */
export const anyValue: Decoder<unknown> = (input: unknown): DecodeResult<unknown> => success(input);

/** Accepts the empty object `{}`. */
export function isEmptyObject(input: unknown): boolean {
  return fieldsOf(input, []) != null;
}

/** Accepts a project id, as `projectRef` holds it. */
export const projectIdValue: Decoder<string> = idValue(isHexId, 'a project id');

/** Accepts a user id. */
export const userIdValue: Decoder<string> = idValue(isHexId, 'a user id');

/** Accepts the data id part of a project data doc's id, such as a question's `dataId`. */
export const dataIdValue: Decoder<string> = idValue(isDataId, 'a data id');

function idValue(isId: (id: string) => boolean, description: string): Decoder<string> {
  return (input: unknown, path: string): DecodeResult<string> =>
    typeof input === 'string' && isId(input) ? success(input) : failure(path, `expected ${description}`);
}

/** The largest book, chapter or verse number accepted. A BBBCCCVVV reference has three digits for each. */
const MAX_REFERENCE_PART = 999;

/**
 * Accepts a book number. 0 is accepted because the checking page sends the number of the book in its route, which is
 * 0 for a book id it does not know.
 */
export const bookNumValue: Decoder<number> = integerValue({ min: 0, max: MAX_REFERENCE_PART });

/** Accepts a chapter number. */
export const chapterNumValue: Decoder<number> = integerValue({ min: 0, max: MAX_REFERENCE_PART });

/**
 * Accepts a chapter number, or null. The checking page sends the chapter number in its route, parsed with parseInt,
 * which gives NaN for a route that is not a number; JSON turns NaN into null.
 */
export const routeChapterNumValue: Decoder<number | null> = nullable(chapterNumValue);

/** Accepts a verse number. */
export const verseNumValue: Decoder<number> = integerValue({ min: 0, max: MAX_REFERENCE_PART });

/** The direction of a sort: ascending (1) or descending (-1). */
export type SortDirection = 1 | -1;

/** The page sizes the administration pages offer (their mat-paginator pageSizeOptions). */
export const pageSizeValue: Decoder<5 | 10 | 20 | 50 | 100> = oneOf([5, 10, 20, 50, 100]);

/** The largest `$skip` accepted: far more docs than any page of results could reach. */
const MAX_SKIP = 10_000_000;

/** Accepts the number of results a page skips. */
export const skipValue: Decoder<number> = integerValue({ min: 0, max: MAX_SKIP });

/**
 * The `$count` of the count query a client sends alongside a paged query. sharedb-mongo runs `$count` as
 * `cursor.count()` whatever its value, which never applies `$skip` or `$limit`, so the count is of every match anyway.
 */
export const unpagedCountValue: Decoder<{ applySkipLimit: false }> = (
  input: unknown,
  path: string
): DecodeResult<{ applySkipLimit: false }> => {
  const applySkipLimit: false | undefined = singleField(input, 'applySkipLimit', literal(false));
  return applySkipLimit === false ? success({ applySkipLimit: false }) : failure(path, 'expected an unpaged count');
};

/** The `$count` the built query of an unpaged count query carries. */
export function unpagedCount(): { applySkipLimit: false } {
  return { applySkipLimit: false };
}

/** The longest search pattern accepted, as the client sends it (after escaping). */
export const MAX_SEARCH_PATTERN_LENGTH = 256;

/** The characters lodash's escapeRegExp puts a backslash in front of. */
const REGEXP_METACHARACTERS = '\\^$.*+?()[]{}|';

/**
 * Whether `pattern` is what lodash's escapeRegExp gives for some text: every regular expression metacharacter in it is
 * escaped with a backslash, and every backslash escapes a metacharacter. Such a pattern matches only its text.
 */
export function isEscapedRegExpLiteral(pattern: string): boolean {
  for (let index = 0; index < pattern.length; index++) {
    const character: string = pattern[index];
    if (character === '\\') {
      const escaped: string | undefined = pattern[index + 1];
      if (escaped == null || !REGEXP_METACHARACTERS.includes(escaped)) {
        return false;
      }
      index++;
    } else if (REGEXP_METACHARACTERS.includes(character)) {
      return false;
    }
  }
  return true;
}

/**
 * Accepts the search text the administration pages send: a non-empty term they trimmed and then escaped with
 * escapeRegExp, so that it matches only its literal text.
 */
export const searchTermValue: Decoder<string> = (input: unknown, path: string): DecodeResult<string> => {
  const pattern: string | undefined = accept(
    stringValue({ minLength: 1, maxLength: MAX_SEARCH_PATTERN_LENGTH }),
    input
  );
  if (pattern == null || pattern.trim() !== pattern || !isEscapedRegExpLiteral(pattern)) {
    return failure(path, 'expected an escaped search term');
  }
  return success(pattern);
};

/**
 * The search term of `{ [field]: { $regex: pattern, $options: 'i' } }`, where `pattern` is the term wrapped in
 * `prefix` and `suffix`, or undefined when the condition does not have that form.
 */
export function caseInsensitiveSearchTerm(
  input: unknown,
  field: string,
  prefix: string = '',
  suffix: string = ''
): string | undefined {
  const condition: Fields<string, never> | undefined = fieldsOf(input, [field]);
  const regex: Fields<'$regex' | '$options', never> | undefined =
    condition == null ? undefined : fieldsOf(condition.required(field), ['$regex', '$options']);
  if (regex == null || regex.required('$options') !== 'i') {
    return undefined;
  }
  const pattern: unknown = regex.required('$regex');
  if (
    typeof pattern !== 'string' ||
    pattern.length < prefix.length + suffix.length ||
    !pattern.startsWith(prefix) ||
    !pattern.endsWith(suffix)
  ) {
    return undefined;
  }
  return accept(searchTermValue, pattern.slice(prefix.length, pattern.length - suffix.length));
}

/** The search term every condition of a search's `$or` has, or undefined when they are not all the same search. */
export function searchTermOf(
  input: unknown,
  fields: readonly string[],
  prefix: string = '',
  suffix: string = ''
): string | undefined {
  const conditions: readonly unknown[] | undefined = accept(
    arrayOf(anyValue, { minLength: fields.length, maxLength: fields.length }),
    input
  );
  if (conditions == null) {
    return undefined;
  }
  let term: string | undefined;
  for (let index = 0; index < fields.length; index++) {
    const fieldTerm: string | undefined = caseInsensitiveSearchTerm(conditions[index], fields[index], prefix, suffix);
    if (fieldTerm == null || (term != null && fieldTerm !== term)) {
      return undefined;
    }
    term = fieldTerm;
  }
  return term;
}

/** The `$or` that searches each of `fields` for `pattern`, ignoring case, as the client builds it. */
export function searchConditions(
  fields: readonly string[],
  pattern: string
): { [key: string]: { $regex: string; $options: 'i' } }[] {
  return fields.map((field: string) => ({ [field]: { $regex: pattern, $options: 'i' } }));
}
