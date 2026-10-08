import {
  GatewaySession,
  QueryAuthorization,
  QueryRegistryEntry,
  registerQuery,
  RegisteredQuery
} from '../../../common/gateway/authorization';
import { Decoder, Fields, literal, oneOf, stringValue } from '../../../common/gateway/decoder';
import { JsonObject, JsonValue } from '../../../common/gateway/json';
import { QUESTIONS_COLLECTION } from '../../models/question';
import { QuestionsPolicy } from '../policies/project-data-policies';
import { PolicyDecision } from '../sf-collection-policy';
import { SFAccessContext } from '../sf-access-context';
import {
  accept,
  anyValue,
  authorizeSafely,
  bookNumValue,
  dataIdValue,
  fieldsOf,
  isEmptyObject,
  mayReadEveryDocInProject,
  projectIdValue,
  routeChapterNumValue,
  SFQueryServices,
  singleField,
  SortDirection,
  unpagedCount,
  unpagedCountValue,
  userIdValue,
  verseNumValue
} from './query-support';

/**
 * The questions queries of the checking pages (CheckingQuestionsService): Q1 (questions of a project, book or chapter),
 * Q2 (the question before or after a question or verse) and Q3/Q3c (the first question the user has not answered, and
 * its count). All are subscribed (`qs`).
 *
 * They are allowed to project members who may view questions, answers, answer comments, answer statuses and likes,
 * which is what reading any question needs (QuestionsPolicy). Such a member may read every question of the project
 * whatever its owner, so every doc a built query can match is readable and its count reveals nothing more.
 */

const QUESTIONS_POLICY: QuestionsPolicy = new QuestionsPolicy();

/** The fields the checking pages sort questions by, in order. */
const QUESTION_SORT_FIELDS: readonly string[] = [
  'verseRef.bookNum',
  'verseRef.chapterNum',
  'verseRef.verseNum',
  'dateCreated'
];

/** The longest `dateCreated` accepted. Questions store an ISO 8601 date, such as `2026-10-08T12:00:00.000Z`. */
const MAX_DATE_LENGTH = 64;

/** The arguments of Q1, a project's questions, optionally only those of a book or chapter, or active ones. */
interface ProjectQuestionsArgs {
  readonly projectRef: string;
  /** Undefined when the query is not limited to a book. */
  readonly bookNum: number | undefined;
  /** Undefined when the query is not limited to a chapter; null when the client sent null for the chapter. */
  readonly chapterNum: number | null | undefined;
  /** Whether only questions that are not archived are wanted. */
  readonly activeOnly: boolean;
  /** Whether the results are sorted in reading order. */
  readonly sorted: boolean;
}

/** The question an adjacent questions query (Q2) is relative to, when it is relative to a question and not a verse. */
interface RelativeQuestion {
  readonly dataId: string;
  readonly dateCreated: string;
}

/** The arguments of Q2, the questions before (`$lt`) or after (`$gt`) a question or verse, in reading order. */
interface AdjacentQuestionsArgs {
  readonly projectRef: string;
  readonly comparison: '$lt' | '$gt';
  /** Null when the query is relative to a verse. */
  readonly relativeTo: RelativeQuestion | null;
  readonly bookNum: number;
  readonly chapterNum: number | null;
  readonly verseNum: number;
}

/** The arguments of Q3 and Q3c, the first active question the user has not answered. */
interface UnansweredQuestionArgs {
  readonly projectRef: string;
  /** The user whose answers are looked at. Only the session's own user is allowed. */
  readonly ownerRef: string;
}

export function questionQueries(services: SFQueryServices): RegisteredQuery[] {
  return [
    registerQuery(projectQuestionsQuery(services)),
    registerQuery(adjacentQuestionsQuery(services)),
    registerQuery(unansweredQuestionQuery(services, false)),
    registerQuery(unansweredQuestionQuery(services, true))
  ];
}

function mayReadQuestions(
  services: SFQueryServices,
  projectRef: string,
  session: GatewaySession
): Promise<QueryAuthorization> {
  return authorizeSafely(services, session, (context: SFAccessContext): Promise<PolicyDecision> =>
    mayReadEveryDocInProject(QUESTIONS_POLICY, projectRef, context)
  );
}

/** Q1: `{ projectRef, ['verseRef.bookNum'], ['verseRef.chapterNum'], [isArchived: false], [$sort] }`. */
function projectQuestionsQuery(services: SFQueryServices): QueryRegistryEntry<ProjectQuestionsArgs> {
  return {
    name: 'questions-of-project',
    collection: QUESTIONS_COLLECTION,
    actions: ['query-subscribe'],
    extraIsSafe: true,
    match: (query: JsonObject): ProjectQuestionsArgs | undefined => {
      const fields:
        Fields<'projectRef', 'verseRef.bookNum' | 'verseRef.chapterNum' | 'isArchived' | '$sort'> | undefined =
        fieldsOf(query, ['projectRef'], ['verseRef.bookNum', 'verseRef.chapterNum', 'isArchived', '$sort']);
      if (fields == null) {
        return undefined;
      }
      const projectRef: string | undefined = accept(projectIdValue, fields.required('projectRef'));
      const bookNum: number | undefined = accept(bookNumValue, fields.optional('verseRef.bookNum'));
      const chapterNum: number | null | undefined = accept(
        routeChapterNumValue,
        fields.optional('verseRef.chapterNum')
      );
      if (
        projectRef == null ||
        (fields.has('verseRef.bookNum') && bookNum == null) ||
        (fields.has('verseRef.chapterNum') && chapterNum === undefined) ||
        (fields.has('isArchived') && fields.optional('isArchived') !== false) ||
        (fields.has('$sort') && !isQuestionSort(fields.optional('$sort'), 1))
      ) {
        return undefined;
      }
      return {
        projectRef: projectRef,
        bookNum: bookNum,
        chapterNum: chapterNum,
        activeOnly: fields.has('isArchived'),
        sorted: fields.has('$sort')
      };
    },
    authorize: (args: ProjectQuestionsArgs, session: GatewaySession): Promise<QueryAuthorization> =>
      mayReadQuestions(services, args.projectRef, session),
    build: async (args: ProjectQuestionsArgs): Promise<JsonObject> => {
      const query: { [key: string]: JsonValue } = { projectRef: args.projectRef };
      if (args.bookNum !== undefined) {
        query['verseRef.bookNum'] = args.bookNum;
      }
      if (args.chapterNum !== undefined) {
        query['verseRef.chapterNum'] = args.chapterNum;
      }
      if (args.activeOnly) {
        query.isArchived = false;
      }
      if (args.sorted) {
        query.$sort = questionSort(1);
      }
      return query;
    }
  };
}

/**
 * Q2: the active questions before or after a point in reading order: in an earlier or later book, chapter or verse, or
 * in the same verse but created earlier or later than the question it is relative to (which is itself left out).
 *
 * ```
 * { projectRef, isArchived: false,
 *   $and: [ {} | { dataId: { $ne } },
 *           { $or: [ { $and: [ {book}, {chapter}, {verse}, {} | { dateCreated: { op } } ] },
 *                    { $and: [ {book}, {chapter}, { verse: { op } } ] },
 *                    { $and: [ {book}, { chapter: { op } } ] },
 *                    { book: { op } } ] } ],
 *   $sort }
 * ```
 * where `op` is `$lt` with every sort direction -1, or `$gt` with every sort direction 1.
 */
function adjacentQuestionsQuery(services: SFQueryServices): QueryRegistryEntry<AdjacentQuestionsArgs> {
  return {
    name: 'adjacent-questions',
    collection: QUESTIONS_COLLECTION,
    actions: ['query-subscribe'],
    extraIsSafe: true,
    match: matchAdjacentQuestions,
    authorize: (args: AdjacentQuestionsArgs, session: GatewaySession): Promise<QueryAuthorization> =>
      mayReadQuestions(services, args.projectRef, session),
    build: async (args: AdjacentQuestionsArgs): Promise<JsonObject> => {
      const op: '$lt' | '$gt' = args.comparison;
      const sameBook: JsonObject = { 'verseRef.bookNum': args.bookNum };
      const sameChapter: JsonObject = { 'verseRef.chapterNum': args.chapterNum };
      const sameVerse: JsonObject = { 'verseRef.verseNum': args.verseNum };
      const notRelativeQuestion: JsonObject =
        args.relativeTo == null ? {} : { dataId: { $ne: args.relativeTo.dataId } };
      const createdBeforeOrAfter: JsonObject =
        args.relativeTo == null ? {} : { dateCreated: { [op]: args.relativeTo.dateCreated } };
      return {
        projectRef: args.projectRef,
        isArchived: false,
        $and: [
          notRelativeQuestion,
          {
            $or: [
              { $and: [sameBook, sameChapter, sameVerse, createdBeforeOrAfter] },
              { $and: [sameBook, sameChapter, { 'verseRef.verseNum': { [op]: args.verseNum } }] },
              { $and: [sameBook, { 'verseRef.chapterNum': { [op]: args.chapterNum } }] },
              { 'verseRef.bookNum': { [op]: args.bookNum } }
            ]
          }
        ],
        $sort: questionSort(op === '$gt' ? 1 : -1)
      };
    }
  };
}

function matchAdjacentQuestions(query: JsonObject): AdjacentQuestionsArgs | undefined {
  const fields: Fields<'projectRef' | 'isArchived' | '$and' | '$sort', never> | undefined = fieldsOf(query, [
    'projectRef',
    'isArchived',
    '$and',
    '$sort'
  ]);
  const projectRef: string | undefined = accept(projectIdValue, fields?.required('projectRef'));
  const and: unknown[] | undefined = arrayOfLength(fields?.required('$and'), 2);
  const or: unknown[] | undefined = arrayOfLength(singleField(and?.[1], '$or', anyValue), 4);
  if (fields == null || projectRef == null || fields.required('isArchived') !== false || and == null || or == null) {
    return undefined;
  }

  // The last branch, `{ 'verseRef.bookNum': { op: bookNum } }`, says which comparison every branch uses.
  const laterBook: Comparison<number> | undefined = comparisonOf(
    singleField(or[3], 'verseRef.bookNum', anyValue),
    bookNumValue
  );
  if (laterBook == null) {
    return undefined;
  }
  const op: '$lt' | '$gt' = laterBook.op;
  const bookNum: number = laterBook.value;
  if (!isQuestionSort(fields.required('$sort'), op === '$gt' ? 1 : -1)) {
    return undefined;
  }

  // `{ $and: [ {book}, { 'verseRef.chapterNum': { op: chapterNum } } ] }`
  const laterChapterBranch: unknown[] | undefined = arrayOfLength(singleField(or[2], '$and', anyValue), 2);
  const laterChapter: Comparison<number | null> | undefined = comparisonOf(
    singleField(laterChapterBranch?.[1], 'verseRef.chapterNum', anyValue),
    routeChapterNumValue
  );
  if (laterChapterBranch == null || laterChapter == null || laterChapter.op !== op) {
    return undefined;
  }
  const chapterNum: number | null = laterChapter.value;

  // `{ $and: [ {book}, {chapter}, { 'verseRef.verseNum': { op: verseNum } } ] }`
  const laterVerseBranch: unknown[] | undefined = arrayOfLength(singleField(or[1], '$and', anyValue), 3);
  const laterVerse: Comparison<number> | undefined = comparisonOf(
    singleField(laterVerseBranch?.[2], 'verseRef.verseNum', anyValue),
    verseNumValue
  );
  if (laterVerseBranch == null || laterVerse == null || laterVerse.op !== op) {
    return undefined;
  }
  const verseNum: number = laterVerse.value;

  // `{ $and: [ {book}, {chapter}, {verse}, {} | { dateCreated: { op: date } } ] }`
  const sameVerseBranch: unknown[] | undefined = arrayOfLength(singleField(or[0], '$and', anyValue), 4);
  if (
    sameVerseBranch == null ||
    !isEquality(laterChapterBranch[0], 'verseRef.bookNum', bookNum) ||
    !isEquality(laterVerseBranch[0], 'verseRef.bookNum', bookNum) ||
    !isEquality(laterVerseBranch[1], 'verseRef.chapterNum', chapterNum) ||
    !isEquality(sameVerseBranch[0], 'verseRef.bookNum', bookNum) ||
    !isEquality(sameVerseBranch[1], 'verseRef.chapterNum', chapterNum) ||
    !isEquality(sameVerseBranch[2], 'verseRef.verseNum', verseNum)
  ) {
    return undefined;
  }

  // Relative to a question, the question itself is left out and questions of the same verse compare by date created;
  // relative to a verse, both conditions are `{}`.
  let relativeTo: RelativeQuestion | null;
  if (isEmptyObject(and[0]) && isEmptyObject(sameVerseBranch[3])) {
    relativeTo = null;
  } else {
    const dataId: string | undefined = singleField(singleField(and[0], 'dataId', anyValue), '$ne', dataIdValue);
    const created: Comparison<string> | undefined = comparisonOf(
      singleField(sameVerseBranch[3], 'dateCreated', anyValue),
      stringValue({ minLength: 1, maxLength: MAX_DATE_LENGTH })
    );
    if (dataId == null || created == null || created.op !== op) {
      return undefined;
    }
    relativeTo = { dataId: dataId, dateCreated: created.value };
  }

  return {
    projectRef: projectRef,
    comparison: op,
    relativeTo: relativeTo,
    bookNum: bookNum,
    chapterNum: chapterNum,
    verseNum: verseNum
  };
}

/**
 * Q3: `{ projectRef, isArchived: false, answers: { $not: { $elemMatch: { ownerRef, deleted: false } } }, $sort,
 * $limit: 1 }`, and Q3c, its count: the same with `$count: { applySkipLimit: false }`. A subscribed count keeps the
 * `$limit`, but sharedb-mongo's count ignores it (see unpagedCountValue), so the count is of every unanswered question.
 */
function unansweredQuestionQuery(
  services: SFQueryServices,
  isCount: boolean
): QueryRegistryEntry<UnansweredQuestionArgs> {
  const required: ('projectRef' | 'isArchived' | 'answers' | '$sort' | '$limit' | '$count')[] = [
    'projectRef',
    'isArchived',
    'answers',
    '$sort',
    '$limit'
  ];
  if (isCount) {
    required.push('$count');
  }
  return {
    name: isCount ? 'first-unanswered-question-count' : 'first-unanswered-question',
    collection: QUESTIONS_COLLECTION,
    actions: ['query-subscribe'],
    extraIsSafe: true,
    match: (query: JsonObject): UnansweredQuestionArgs | undefined => {
      const fields: Fields<(typeof required)[number], never> | undefined = fieldsOf(query, required);
      if (fields == null) {
        return undefined;
      }
      const projectRef: string | undefined = accept(projectIdValue, fields.required('projectRef'));
      const unanswered: Fields<'ownerRef' | 'deleted', never> | undefined = fieldsOf(
        singleField(singleField(fields.required('answers'), '$not', anyValue), '$elemMatch', anyValue),
        ['ownerRef', 'deleted']
      );
      const ownerRef: string | undefined = accept(userIdValue, unanswered?.required('ownerRef'));
      if (
        projectRef == null ||
        unanswered == null ||
        ownerRef == null ||
        unanswered.required('deleted') !== false ||
        fields.required('isArchived') !== false ||
        !isQuestionSort(fields.required('$sort'), 1) ||
        fields.required('$limit') !== 1 ||
        (isCount && accept(unpagedCountValue, fields.required('$count')) == null)
      ) {
        return undefined;
      }
      return { projectRef: projectRef, ownerRef: ownerRef };
    },
    authorize: async (args: UnansweredQuestionArgs, session: GatewaySession): Promise<QueryAuthorization> => {
      if (args.ownerRef !== session.userId) {
        return { kind: 'refused', reason: "the query looks at another user's answers" };
      }
      return mayReadQuestions(services, args.projectRef, session);
    },
    build: async (args: UnansweredQuestionArgs): Promise<JsonObject> => {
      const query: { [key: string]: JsonValue } = {
        projectRef: args.projectRef,
        isArchived: false,
        answers: { $not: { $elemMatch: { ownerRef: args.ownerRef, deleted: false } } },
        $sort: questionSort(1),
        $limit: 1
      };
      if (isCount) {
        query.$count = unpagedCount();
      }
      return query;
    }
  };
}

/** The sort of questions in reading order (1) or the reverse (-1). */
function questionSort(direction: SortDirection): JsonObject {
  const sort: { [key: string]: JsonValue } = {};
  for (const field of QUESTION_SORT_FIELDS) {
    sort[field] = direction;
  }
  return sort;
}

/** Whether `input` is exactly the sort of questions in this direction. */
function isQuestionSort(input: unknown, direction: SortDirection): boolean {
  const fields: Fields<string, never> | undefined = fieldsOf(input, QUESTION_SORT_FIELDS);
  return fields != null && QUESTION_SORT_FIELDS.every((field: string) => fields.required(field) === direction);
}

/** A comparison with the value it compares against: `{ $lt: value }` or `{ $gt: value }`. */
interface Comparison<T> {
  readonly op: '$lt' | '$gt';
  readonly value: T;
}

const COMPARISON_OPERATORS: readonly ('$lt' | '$gt')[] = ['$lt', '$gt'];

/** The comparison of `{ $lt: value }` or `{ $gt: value }`, if `decoder` accepts the value. */
function comparisonOf<T>(input: unknown, decoder: Decoder<T>): Comparison<T> | undefined {
  const fields: Fields<never, '$lt' | '$gt'> | undefined = fieldsOf(input, [], COMPARISON_OPERATORS);
  if (fields == null) {
    return undefined;
  }
  const present: ('$lt' | '$gt')[] = COMPARISON_OPERATORS.filter((op: '$lt' | '$gt') => fields.has(op));
  const op: '$lt' | '$gt' | undefined = accept(oneOf(COMPARISON_OPERATORS), present.length === 1 ? present[0] : null);
  if (op == null) {
    return undefined;
  }
  const value: T | undefined = accept(decoder, fields.optional(op));
  return value === undefined ? undefined : { op: op, value: value };
}

/** Whether `input` is `{ [field]: value }`. */
function isEquality(input: unknown, field: string, value: number | null): boolean {
  return singleField(input, field, literal(value)) !== undefined;
}

/** The elements of an array of exactly `length` elements, or undefined when `input` is not one. */
function arrayOfLength(input: unknown, length: number): unknown[] | undefined {
  return Array.isArray(input) && input.length === length ? Array.from(input) : undefined;
}
