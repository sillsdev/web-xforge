import 'jest-expect-message';
import { MatchedQuery, QueryAction, QueryAuthorization, QueryRegistry } from '../../common/gateway/authorization';
import { JsonObject } from '../../common/gateway/json';
import { findDisallowedQueryOperator, isDocIdExistenceQuery } from '../../common/realtime-server';
import { USERS_COLLECTION } from '../../common/models/user';
import { SF_PROJECTS_COLLECTION } from '../models/sf-project';
import { PROJECT_ID, OTHER_PROJECT_ID, testProjectData, TestUserName, TestWorld, USERS } from './test-gateway-world';
import { isEscapedRegExpLiteral } from './queries/query-support';
import { SF_COLLECTION_POLICIES } from './sf-collection-policies';
import { createSFQueryRegistry } from './sf-query-registry';

/** A query as a client sends it, with the entry it should match and a user who may run it. */
interface WireQuery {
  readonly id: string;
  readonly action: QueryAction;
  readonly collection: string;
  readonly query: JsonObject;
  readonly entryName: string;
  readonly user: TestUserName;
}

/** The outcome of matching, authorizing and building a query. */
interface QueryOutcome {
  readonly authorization: QueryAuthorization;
  /** The built query, when the query was authorized. */
  readonly built: JsonObject | undefined;
}

const SORT_ASCENDING: JsonObject = {
  'verseRef.bookNum': 1,
  'verseRef.chapterNum': 1,
  'verseRef.verseNum': 1,
  dateCreated: 1
};
const SORT_DESCENDING: JsonObject = {
  'verseRef.bookNum': -1,
  'verseRef.chapterNum': -1,
  'verseRef.verseNum': -1,
  dateCreated: -1
};
const UNPAGED_COUNT: JsonObject = { applySkipLimit: false };
const EXISTS_COUNT: JsonObject = { applySkipLimit: true };
const QUESTION_ID = `${PROJECT_ID}:q01`;

class TestEnvironment {
  readonly world: TestWorld;
  readonly registry: QueryRegistry;

  constructor({ projectData = testProjectData() }: { projectData?: Record<string, unknown> } = {}) {
    this.world = new TestWorld(projectData);
    this.registry = createSFQueryRegistry({
      projects: this.world.projects,
      profiles: this.world.profiles,
      data: this.world.data
    });
  }

  /** The adjacent questions query (Q2), as CheckingQuestionsService.queryAdjacentQuestions builds it. */
  static adjacentQuery({
    op,
    bookNum = 40,
    chapterNum = 1,
    verseNum = 3,
    question
  }: {
    op: '$lt' | '$gt';
    bookNum?: number;
    chapterNum?: number | null;
    verseNum?: number;
    question?: { dataId: string; dateCreated: string };
  }): JsonObject {
    return {
      projectRef: PROJECT_ID,
      isArchived: false,
      $and: [
        question != null ? { dataId: { $ne: question.dataId } } : {},
        {
          $or: [
            {
              $and: [
                { 'verseRef.bookNum': bookNum },
                { 'verseRef.chapterNum': chapterNum },
                { 'verseRef.verseNum': verseNum },
                question != null ? { dateCreated: { [op]: question.dateCreated } } : {}
              ]
            },
            {
              $and: [
                { 'verseRef.bookNum': bookNum },
                { 'verseRef.chapterNum': chapterNum },
                { 'verseRef.verseNum': { [op]: verseNum } }
              ]
            },
            { $and: [{ 'verseRef.bookNum': bookNum }, { 'verseRef.chapterNum': { [op]: chapterNum } }] },
            { 'verseRef.bookNum': { [op]: bookNum } }
          ]
        }
      ],
      $sort: op === '$gt' ? SORT_ASCENDING : SORT_DESCENDING
    };
  }

  /** Every query shape of the query inventory, as the client sends it. E1 is covered by its own tests. */
  static inventory(): WireQuery[] {
    const qs: QueryAction = 'query-subscribe';
    const qf: QueryAction = 'query-fetch';
    const projectSearch: JsonObject[] = [
      { name: { $regex: 'Eng\\(US\\)', $options: 'i' } },
      { shortName: { $regex: 'Eng\\(US\\)', $options: 'i' } }
    ];
    const userSearch: JsonObject[] = [
      { name: { $regex: '.*bob\\.smith.*', $options: 'i' } },
      { email: { $regex: '.*bob\\.smith.*', $options: 'i' } },
      { displayName: { $regex: '.*bob\\.smith.*', $options: 'i' } }
    ];
    const servalConfig: JsonObject = { $ne: null };
    return [
      // Q1a, `?scope=all`, `?scope=chapter`, `?scope=book`, and route values that are not numbers or books
      {
        id: 'Q1a all',
        action: qs,
        collection: 'questions',
        query: { projectRef: PROJECT_ID, isArchived: false, $sort: SORT_ASCENDING },
        entryName: 'questions-of-project',
        user: 'checker'
      },
      {
        id: 'Q1a chapter',
        action: qs,
        collection: 'questions',
        query: {
          projectRef: PROJECT_ID,
          'verseRef.bookNum': 40,
          'verseRef.chapterNum': 1,
          isArchived: false,
          $sort: SORT_ASCENDING
        },
        entryName: 'questions-of-project',
        user: 'checker'
      },
      {
        id: 'Q1a book',
        action: qs,
        collection: 'questions',
        query: { projectRef: PROJECT_ID, 'verseRef.bookNum': 40, isArchived: false, $sort: SORT_ASCENDING },
        entryName: 'questions-of-project',
        user: 'checker'
      },
      {
        id: 'Q1a NaN chapter, unknown book',
        action: qs,
        collection: 'questions',
        query: {
          projectRef: PROJECT_ID,
          'verseRef.bookNum': 0,
          'verseRef.chapterNum': null,
          isArchived: false,
          $sort: SORT_ASCENDING
        },
        entryName: 'questions-of-project',
        user: 'checker'
      },
      {
        id: 'Q1b',
        action: qs,
        collection: 'questions',
        query: { projectRef: PROJECT_ID, $sort: SORT_ASCENDING },
        entryName: 'questions-of-project',
        user: 'admin'
      },
      {
        id: 'Q1c',
        action: qs,
        collection: 'questions',
        query: { projectRef: PROJECT_ID, isArchived: false },
        entryName: 'questions-of-project',
        user: 'checker'
      },
      {
        id: 'Q1d',
        action: qs,
        collection: 'questions',
        query: { projectRef: PROJECT_ID },
        entryName: 'questions-of-project',
        user: 'admin'
      },
      {
        id: 'Q2 next, relative to a verse',
        action: qs,
        collection: 'questions',
        query: {
          projectRef: PROJECT_ID,
          isArchived: false,
          $and: [
            {},
            {
              $or: [
                {
                  $and: [{ 'verseRef.bookNum': 1 }, { 'verseRef.chapterNum': 1 }, { 'verseRef.verseNum': 0 }, {}]
                },
                {
                  $and: [{ 'verseRef.bookNum': 1 }, { 'verseRef.chapterNum': 1 }, { 'verseRef.verseNum': { $gt: 0 } }]
                },
                { $and: [{ 'verseRef.bookNum': 1 }, { 'verseRef.chapterNum': { $gt: 1 } }] },
                { 'verseRef.bookNum': { $gt: 1 } }
              ]
            }
          ],
          $sort: SORT_ASCENDING
        },
        entryName: 'adjacent-questions',
        user: 'checker'
      },
      {
        id: 'Q2 prev, relative to a question',
        action: qs,
        collection: 'questions',
        query: {
          projectRef: PROJECT_ID,
          isArchived: false,
          $and: [
            { dataId: { $ne: 'q01' } },
            {
              $or: [
                {
                  $and: [
                    { 'verseRef.bookNum': 40 },
                    { 'verseRef.chapterNum': 2 },
                    { 'verseRef.verseNum': 5 },
                    { dateCreated: { $lt: '2026-10-08T12:00:00.000Z' } }
                  ]
                },
                {
                  $and: [{ 'verseRef.bookNum': 40 }, { 'verseRef.chapterNum': 2 }, { 'verseRef.verseNum': { $lt: 5 } }]
                },
                { $and: [{ 'verseRef.bookNum': 40 }, { 'verseRef.chapterNum': { $lt: 2 } }] },
                { 'verseRef.bookNum': { $lt: 40 } }
              ]
            }
          ],
          $sort: SORT_DESCENDING
        },
        entryName: 'adjacent-questions',
        user: 'checker'
      },
      {
        id: 'Q3',
        action: qs,
        collection: 'questions',
        query: {
          projectRef: PROJECT_ID,
          isArchived: false,
          answers: { $not: { $elemMatch: { ownerRef: USERS.checker, deleted: false } } },
          $sort: SORT_ASCENDING,
          $limit: 1
        },
        entryName: 'first-unanswered-question',
        user: 'checker'
      },
      {
        id: 'Q3c',
        action: qs,
        collection: 'questions',
        query: {
          projectRef: PROJECT_ID,
          isArchived: false,
          answers: { $not: { $elemMatch: { ownerRef: USERS.checker, deleted: false } } },
          $sort: SORT_ASCENDING,
          $limit: 1,
          $count: UNPAGED_COUNT
        },
        entryName: 'first-unanswered-question-count',
        user: 'checker'
      },
      {
        id: 'N1',
        action: qs,
        collection: 'note_threads',
        query: { projectRef: PROJECT_ID, status: 'todo', 'verseRef.bookNum': 40, 'verseRef.chapterNum': 1 },
        entryName: 'open-note-threads-of-chapter',
        user: 'translator'
      },
      {
        id: 'N2',
        action: qs,
        collection: 'note_threads',
        query: { projectRef: PROJECT_ID, biblicalTermId: { $ne: null } },
        entryName: 'biblical-term-note-threads',
        user: 'translator'
      },
      {
        id: 'B1',
        action: qs,
        collection: 'biblical_terms',
        query: { projectRef: PROJECT_ID, references: { $elemMatch: { $gte: 40_000_000, $lt: 41_000_000 } } },
        entryName: 'biblical-terms-of-book',
        user: 'consultant'
      },
      {
        id: 'A1',
        action: qs,
        collection: 'text_audio',
        query: { projectRef: PROJECT_ID },
        entryName: 'text-audio-of-project',
        user: 'checker'
      },
      {
        id: 'T1',
        action: qs,
        collection: 'training_data',
        query: { projectRef: PROJECT_ID, deleted: false },
        entryName: 'training-data-of-project',
        user: 'translator'
      },
      {
        id: 'T2',
        action: qs,
        collection: 'training_data',
        query: { projectRef: PROJECT_ID },
        entryName: 'training-data-of-project-with-deleted',
        user: 'translator'
      },
      {
        id: 'P1 page load',
        action: qf,
        collection: 'sf_projects',
        query: { $sort: { name: 1 }, $skip: 0, $limit: 50 },
        entryName: 'projects-list',
        user: 'systemAdmin'
      },
      {
        id: 'P1 search',
        action: qf,
        collection: 'sf_projects',
        query: { $or: projectSearch, $sort: { name: 1 }, $skip: 20, $limit: 10 },
        entryName: 'projects-list',
        user: 'systemAdmin'
      },
      {
        id: 'P1c page load',
        action: qf,
        collection: 'sf_projects',
        query: { $sort: { name: 1 }, $count: UNPAGED_COUNT },
        entryName: 'projects-list-count',
        user: 'systemAdmin'
      },
      {
        id: 'P1c search',
        action: qf,
        collection: 'sf_projects',
        query: { $or: projectSearch, $sort: { name: 1 }, $count: UNPAGED_COUNT },
        entryName: 'projects-list-count',
        user: 'systemAdmin'
      },
      {
        id: 'P2',
        action: qf,
        collection: 'sf_projects',
        query: { _id: { $in: [PROJECT_ID, OTHER_PROJECT_ID, PROJECT_ID] } },
        entryName: 'projects-by-id',
        user: 'systemAdmin'
      },
      {
        id: 'U1 page load',
        action: qf,
        collection: 'users',
        query: { $sort: { name: 1 }, $skip: 0, $limit: 50 },
        entryName: 'users-list',
        user: 'systemAdmin'
      },
      {
        id: 'U1 search',
        action: qf,
        collection: 'users',
        query: { $or: userSearch, $sort: { name: 1 }, $skip: 100, $limit: 100 },
        entryName: 'users-list',
        user: 'systemAdmin'
      },
      {
        id: 'U1c search',
        action: qf,
        collection: 'users',
        query: { $or: userSearch, $sort: { name: 1 }, $count: UNPAGED_COUNT },
        entryName: 'users-list-count',
        user: 'systemAdmin'
      },
      {
        id: 'S1 page load',
        action: qf,
        collection: 'sf_projects_profile',
        query: { resourceConfig: null, $sort: { name: 1 }, $skip: 0, $limit: 50 },
        entryName: 'serval-projects-list',
        user: 'servalAdmin'
      },
      {
        id: 'S1 search with the custom Serval config toggle',
        action: qf,
        collection: 'sf_projects_profile',
        query: {
          $or: projectSearch,
          resourceConfig: null,
          $sort: { name: 1 },
          $skip: 0,
          $limit: 5,
          'translateConfig.draftConfig.servalConfig': servalConfig
        },
        entryName: 'serval-projects-list',
        user: 'servalAdmin'
      },
      {
        id: 'S1c page load',
        action: qf,
        collection: 'sf_projects_profile',
        query: { resourceConfig: null, $sort: { name: 1 }, $count: UNPAGED_COUNT },
        entryName: 'serval-projects-list-count',
        user: 'servalAdmin'
      },
      {
        id: 'S1c search with the custom Serval config toggle',
        action: qf,
        collection: 'sf_projects_profile',
        query: {
          $or: projectSearch,
          resourceConfig: null,
          $sort: { name: 1 },
          'translateConfig.draftConfig.servalConfig': servalConfig,
          $count: UNPAGED_COUNT
        },
        entryName: 'serval-projects-list-count',
        user: 'servalAdmin'
      },
      {
        id: 'S2',
        action: qf,
        collection: 'sf_projects_profile',
        query: { paratextId: '94f48e5b710ec9b9a9f8d5c3c7c6a41d4d3f2e1a' },
        entryName: 'project-profile-by-paratext-id',
        user: 'servalAdmin'
      }
    ];
  }

  /** The inventory query with this id. */
  static wire(id: string): WireQuery {
    const found: WireQuery | undefined = TestEnvironment.inventory().find((query: WireQuery) => query.id === id);
    if (found == null) {
      throw new Error(`no inventory query ${id}`);
    }
    return found;
  }

  /** A copy of a JSON value, so that a test can change it without changing the original. */
  static copy(value: JsonObject): any {
    return JSON.parse(JSON.stringify(value));
  }

  match(action: QueryAction, collection: string, query: JsonObject): MatchedQuery | undefined {
    return this.registry.match(action, collection, query);
  }

  /** Matches, authorizes and (if authorized) builds the query as the user. Fails the test if no entry matches. */
  async run(user: TestUserName, action: QueryAction, collection: string, query: JsonObject): Promise<QueryOutcome> {
    const matched: MatchedQuery | undefined = this.match(action, collection, query);
    if (matched == null) {
      throw new Error(`no entry matches the ${collection} query ${JSON.stringify(query)}`);
    }
    const session = this.world.contextFor(user).session;
    const authorization: QueryAuthorization = await matched.authorize(session);
    const built: JsonObject | undefined =
      authorization.kind === 'authorized' ? await matched.build(session) : undefined;
    return { authorization: authorization, built: built };
  }

  /** Runs an inventory query as another user. */
  runAs(user: TestUserName, id: string): Promise<QueryOutcome> {
    const wire: WireQuery = TestEnvironment.wire(id);
    return this.run(user, wire.action, wire.collection, wire.query);
  }

  /** The query an existence check (E1) of the doc builds for the user. */
  async buildExistence(user: TestUserName, collection: string, docId: string): Promise<JsonObject> {
    const outcome: QueryOutcome = await this.run(user, 'query-fetch', collection, {
      _id: docId,
      $limit: 1,
      $count: EXISTS_COUNT
    });
    expect(outcome.authorization.kind).toEqual('authorized');
    return outcome.built!;
  }

  putQuestion(): void {
    this.world.data.put('questions', QUESTION_ID, {
      projectRef: PROJECT_ID,
      ownerRef: USERS.admin,
      dataId: 'q01',
      isArchived: false
    });
  }
}

describe('createSFQueryRegistry', () => {
  describe('the inventoried queries', () => {
    it('each match exactly one entry, the expected one, and only with the action the client uses', () => {
      const env = new TestEnvironment();
      for (const wire of TestEnvironment.inventory()) {
        const other: QueryAction = wire.action === 'query-fetch' ? 'query-subscribe' : 'query-fetch';

        expect(env.match(wire.action, wire.collection, wire.query)?.entryName, wire.id).toEqual(wire.entryName);
        expect(env.match(other, wire.collection, wire.query), wire.id).toBeUndefined();
      }
    });

    it('build the query the client sent, as a new object, for a user who may run it', async () => {
      const env = new TestEnvironment();
      for (const wire of TestEnvironment.inventory()) {
        // SUT
        const outcome: QueryOutcome = await env.run(wire.user, wire.action, wire.collection, wire.query);

        expect(outcome.authorization.kind, wire.id).toEqual('authorized');
        expect(outcome.built, wire.id).toEqual(wire.query);
        expect(outcome.built, wire.id).not.toBe(wire.query);
      }
    });

    it('build queries that the server query middleware accepts', async () => {
      const env = new TestEnvironment();
      for (const wire of TestEnvironment.inventory()) {
        const outcome: QueryOutcome = await env.run(wire.user, wire.action, wire.collection, wire.query);

        expect(findDisallowedQueryOperator(outcome.built), wire.id).toBeUndefined();
        if (!['sf_projects', 'sf_projects_profile', 'users'].includes(wire.collection)) {
          expect(typeof outcome.built?.projectRef, wire.id).toEqual('string');
        }
      }
    });

    it('do not keep the client objects', async () => {
      const env = new TestEnvironment();
      const p2: any = TestEnvironment.copy(TestEnvironment.wire('P2').query);
      const q1: any = TestEnvironment.copy(TestEnvironment.wire('Q1a chapter').query);
      const matchedP2: MatchedQuery = env.match('query-fetch', 'sf_projects', p2)!;
      const matchedQ1: MatchedQuery = env.match('query-subscribe', 'questions', q1)!;
      p2._id.$in.push('cccccccccccccccccccccccc');
      q1.$sort.dateCreated = -1;

      expect(await matchedP2.build(env.world.contextFor('systemAdmin').session)).toEqual(
        TestEnvironment.wire('P2').query
      );
      expect(await matchedQ1.build(env.world.contextFor('checker').session)).toEqual(
        TestEnvironment.wire('Q1a chapter').query
      );
    });
  });

  describe('near misses', () => {
    it('do not match any entry', () => {
      const env = new TestEnvironment();
      const nearMisses: { description: string; action: QueryAction; collection: string; query: any }[] = [];
      const add = (description: string, id: string, change: (query: any) => void): void => {
        const wire: WireQuery = TestEnvironment.wire(id);
        const query: any = TestEnvironment.copy(wire.query);
        // The unchanged copy matches, so a near miss fails to match only because of its change.
        expect(env.match(wire.action, wire.collection, query), description).toBeDefined();
        change(query);
        nearMisses.push({ description: description, action: wire.action, collection: wire.collection, query: query });
      };

      add('Q1 extra key', 'Q1a chapter', q => (q.ownerRef = USERS.checker));
      add('Q1 project id that is not hex', 'Q1d', q => (q.projectRef = 'not-a-project'));
      add('Q1 project id as an object', 'Q1d', q => (q.projectRef = { $ne: null }));
      add('Q1 book number out of range', 'Q1a book', q => (q['verseRef.bookNum'] = 1000));
      add('Q1 book number not an integer', 'Q1a book', q => (q['verseRef.bookNum'] = 1.5));
      add('Q1 negative chapter', 'Q1a chapter', q => (q['verseRef.chapterNum'] = -1));
      add('Q1 chapter as a string', 'Q1a chapter', q => (q['verseRef.chapterNum'] = '1'));
      add('Q1 archived questions', 'Q1c', q => (q.isArchived = true));
      add('Q1 descending sort', 'Q1b', q => (q.$sort = SORT_DESCENDING));
      add('Q1 sort with a key missing', 'Q1b', q => delete q.$sort.dateCreated);
      add('Q1 sort with an extra key', 'Q1b', q => (q.$sort.text = 1));
      add('Q1 with a limit', 'Q1b', q => (q.$limit = 1));
      add('Q2 another book in one branch', 'Q2 prev, relative to a question', q => {
        q.$and[1].$or[1].$and[0]['verseRef.bookNum'] = 41;
      });
      add('Q2 another chapter in one branch', 'Q2 next, relative to a verse', q => {
        q.$and[1].$or[0].$and[1]['verseRef.chapterNum'] = 2;
      });
      add('Q2 another verse in one branch', 'Q2 next, relative to a verse', q => {
        q.$and[1].$or[1].$and[2]['verseRef.verseNum'] = { $gt: 1 };
      });
      add('Q2 mixed comparisons', 'Q2 next, relative to a verse', q => {
        q.$and[1].$or[2].$and[1]['verseRef.chapterNum'] = { $lt: 1 };
      });
      add('Q2 date compared the other way', 'Q2 prev, relative to a question', q => {
        q.$and[1].$or[0].$and[3] = { dateCreated: { $gt: '2026-10-08T12:00:00.000Z' } };
      });
      add('Q2 sort in the other direction', 'Q2 next, relative to a verse', q => (q.$sort = SORT_DESCENDING));
      add('Q2 two comparisons in one condition', 'Q2 next, relative to a verse', q => {
        q.$and[1].$or[3]['verseRef.bookNum'] = { $gt: 1, $lt: 5 };
      });
      add('Q2 a question left out without a date', 'Q2 prev, relative to a question', q => {
        q.$and[1].$or[0].$and[3] = {};
      });
      add('Q2 a date without leaving out the question', 'Q2 prev, relative to a question', q => (q.$and[0] = {}));
      add('Q2 branches in another order', 'Q2 next, relative to a verse', q => q.$and[1].$or.reverse());
      add('Q2 an extra branch', 'Q2 next, relative to a verse', q => q.$and[1].$or.push({}));
      add('Q2 a data id that is not a string', 'Q2 prev, relative to a question', q => {
        q.$and[0].dataId.$ne = { $gt: '' };
      });
      add('Q3 deleted answers', 'Q3', q => (q.answers.$not.$elemMatch.deleted = true));
      add('Q3 owner that is not an id', 'Q3', q => (q.answers.$not.$elemMatch.ownerRef = { $ne: null }));
      add('Q3 bigger limit', 'Q3', q => (q.$limit = 2));
      add('Q3c count that applies the limit', 'Q3c', q => (q.$count = EXISTS_COUNT));
      add('N1 resolved threads', 'N1', q => (q.status = 'resolved'));
      add('N1 no chapter', 'N1', q => delete q['verseRef.chapterNum']);
      add('N1 published only', 'N1', q => (q.publishedToSF = false));
      add('N2 threads of a term', 'N2', q => (q.biblicalTermId = { $ne: 'term01' }));
      add('B1 start that is not a book', 'B1', q => (q.references.$elemMatch.$gte = 40_000_001));
      add('B1 range of two books', 'B1', q => (q.references.$elemMatch.$lt = 42_000_000));
      add('B1 range before book 1', 'B1', q => {
        q.references.$elemMatch = { $gte: 0, $lt: 1_000_000 };
      });
      add('T1 deleted only', 'T1', q => (q.deleted = true));
      add('A1 extra key', 'A1', q => (q.deleted = false));
      add('P1 page size not offered', 'P1 page load', q => (q.$limit = 7));
      add('P1 page size too big', 'P1 page load', q => (q.$limit = 1000));
      add('P1 negative skip', 'P1 page load', q => (q.$skip = -1));
      add('P1 skip too big', 'P1 page load', q => (q.$skip = 10_000_001));
      add('P1 skip not an integer', 'P1 page load', q => (q.$skip = 1.5));
      add('P1 descending sort', 'P1 page load', q => (q.$sort = { name: -1 }));
      add('P1 sort by another field', 'P1 page load', q => (q.$sort = { shortName: 1 }));
      add('P1 search with an unescaped dot', 'P1 search', q => {
        q.$or[0].name.$regex = 'a.b';
        q.$or[1].shortName.$regex = 'a.b';
      });
      add('P1 search ending in a lone backslash', 'P1 search', q => {
        q.$or[0].name.$regex = 'ab\\';
        q.$or[1].shortName.$regex = 'ab\\';
      });
      add('P1 search with an escape that escapeRegExp never makes', 'P1 search', q => {
        q.$or[0].name.$regex = '\\d+';
        q.$or[1].shortName.$regex = '\\d+';
      });
      add('P1 search too long', 'P1 search', q => {
        q.$or[0].name.$regex = 'a'.repeat(257);
        q.$or[1].shortName.$regex = 'a'.repeat(257);
      });
      add('P1 search that was not trimmed', 'P1 search', q => {
        q.$or[0].name.$regex = ' a';
        q.$or[1].shortName.$regex = ' a';
      });
      add('P1 empty search', 'P1 search', q => {
        q.$or[0].name.$regex = '';
        q.$or[1].shortName.$regex = '';
      });
      add('P1 search with other options', 'P1 search', q => (q.$or[0].name.$options = 'im'));
      add('P1 search for two different terms', 'P1 search', q => (q.$or[1].shortName.$regex = 'other'));
      add('P1 search of one field', 'P1 search', q => q.$or.pop());
      add('P1 search of another field', 'P1 search', q => (q.$or[1] = { paratextId: q.$or[1].shortName }));
      add('P1 page with a count', 'P1 page load', q => (q.$count = UNPAGED_COUNT));
      add('P1c count with a page', 'P1c page load', q => (q.$skip = 0));
      add('P1c count that applies the page', 'P1c page load', q => (q.$count = EXISTS_COUNT));
      add('P2 no ids', 'P2', q => (q._id.$in = []));
      add('P2 too many ids', 'P2', q => (q._id.$in = new Array(10_001).fill(PROJECT_ID)));
      add('P2 id that is not hex', 'P2', q => (q._id.$in = ['zz']));
      add('P2 id as an object', 'P2', q => (q._id.$in = [{ $gt: '' }]));
      add('P2 another operator', 'P2', q => (q._id = { $ne: PROJECT_ID }));
      add('U1 search without the wildcards', 'U1 search', q => {
        for (const condition of q.$or) {
          const field: string = Object.keys(condition)[0];
          condition[field].$regex = 'bob';
        }
      });
      add('U1 search with an unescaped wildcard inside', 'U1 search', q => {
        for (const condition of q.$or) {
          const field: string = Object.keys(condition)[0];
          condition[field].$regex = '.*a.*b.*';
        }
      });
      add('U1 search of project fields', 'U1 search', q => (q.$or = TestEnvironment.wire('P1 search').query.$or));
      add('S1 resources included', 'S1 page load', q => delete q.resourceConfig);
      add('S1 resources only', 'S1 page load', q => (q.resourceConfig = { $ne: null }));
      add('S1 custom Serval config compared with something else', 'S1 page load', q => {
        q['translateConfig.draftConfig.servalConfig'] = { $ne: 'x' };
      });
      add('S1c count with a page', 'S1c page load', q => (q.$limit = 50));
      add('S2 id as an object', 'S2', q => (q.paratextId = { $ne: null }));
      add('S2 empty id', 'S2', q => (q.paratextId = ''));
      add('S2 id too long', 'S2', q => (q.paratextId = 'a'.repeat(129)));

      for (const nearMiss of nearMisses) {
        expect(env.match(nearMiss.action, nearMiss.collection, nearMiss.query), nearMiss.description).toBeUndefined();
      }
    });

    it('include shapes that are no longer sent, and queries on collections without entries', () => {
      const env = new TestEnvironment();

      // H1: projects by Paratext id, before the Serval administration page used the project profiles.
      expect(env.match('query-fetch', 'sf_projects', { paratextId: 'pt01' })).toBeUndefined();
      // H2: all of a project's Biblical Terms, before the panel queried one book at a time.
      expect(env.match('query-subscribe', 'biblical_terms', { projectRef: PROJECT_ID })).toBeUndefined();
      expect(env.match('query-fetch', 'text_documents', { _id: 'x', $limit: 1, $count: EXISTS_COUNT })).toBeUndefined();
      expect(env.match('query-subscribe', 'texts', { projectRef: PROJECT_ID })).toBeUndefined();
    });
  });

  describe('questions', () => {
    it('are allowed to members who may read every question', async () => {
      const env = new TestEnvironment();
      const expected: [TestUserName, boolean][] = [
        ['admin', true],
        ['translator', true],
        ['consultant', true],
        ['ptObserver', true],
        ['checker', true],
        ['commenter', false],
        ['sfObserver', false],
        ['nonMember', false],
        ['systemAdmin', false],
        ['servalAdmin', false]
      ];
      for (const [user, allowed] of expected) {
        for (const id of ['Q1d', 'Q2 next, relative to a verse']) {
          const outcome: QueryOutcome = await env.runAs(user, id);

          expect(outcome.authorization.kind, `${user} ${id}`).toEqual(allowed ? 'authorized' : 'refused');
        }
      }
    });

    it('stop being current when the project moves to a new read epoch, but not for a chapter permission change', async () => {
      const env = new TestEnvironment();
      const outcome: QueryOutcome = await env.runAs('checker', 'Q1d');
      if (outcome.authorization.kind !== 'authorized' || outcome.authorization.isCurrent == null) {
        throw new Error('expected an authorization that can go stale');
      }
      expect(outcome.authorization.isCurrent()).toBe(true);

      env.world.projects.invalidate(PROJECT_ID, false);
      expect(outcome.authorization.isCurrent()).toBe(true);

      env.world.projects.invalidate(PROJECT_ID);
      expect(outcome.authorization.isCurrent()).toBe(false);
    });

    it('are refused for a project that does not exist', async () => {
      const env = new TestEnvironment();
      const query: any = TestEnvironment.copy(TestEnvironment.wire('Q1d').query);
      query.projectRef = OTHER_PROJECT_ID;

      const outcome: QueryOutcome = await env.run('systemAdmin', 'query-subscribe', 'questions', query);

      expect(outcome.authorization.kind).toEqual('refused');
    });

    it("are refused when they look at another user's answers", async () => {
      const env = new TestEnvironment();

      expect((await env.runAs('translator', 'Q3')).authorization.kind).toEqual('refused');
      expect((await env.runAs('translator', 'Q3c')).authorization.kind).toEqual('refused');
      expect((await env.runAs('checker', 'Q3c')).authorization.kind).toEqual('authorized');
    });
  });

  describe('note threads', () => {
    it('are allowed to members who may view threads and notes, limited to the threads they may read', async () => {
      const env = new TestEnvironment();
      const n1: JsonObject = TestEnvironment.wire('N1').query;
      const n2: JsonObject = TestEnvironment.wire('N2').query;
      for (const user of ['admin', 'translator', 'consultant', 'ptObserver'] satisfies TestUserName[]) {
        expect((await env.runAs(user, 'N1')).built, user).toEqual(n1);
        expect((await env.runAs(user, 'N2')).built, user).toEqual(n2);
      }
      for (const user of ['commenter', 'sfObserver'] satisfies TestUserName[]) {
        expect((await env.runAs(user, 'N1')).built, user).toEqual({ ...n1, publishedToSF: true });
        expect((await env.runAs(user, 'N2')).built, user).toEqual({ ...n2, publishedToSF: true });
      }
      for (const user of ['checker', 'nonMember', 'systemAdmin', 'servalAdmin'] satisfies TestUserName[]) {
        expect((await env.runAs(user, 'N1')).authorization.kind, user).toEqual('refused');
        expect((await env.runAs(user, 'N2')).authorization.kind, user).toEqual('refused');
      }
    });

    it('are limited to unpublished threads for a user who may view only Paratext threads', async () => {
      const env = new TestEnvironment({
        projectData: testProjectData({
          userPermissions: { [USERS.checker]: ['pt_note_threads.view', 'notes.view'] }
        })
      });

      const outcome: QueryOutcome = await env.runAs('checker', 'N1');

      expect(outcome.built).toEqual({ ...TestEnvironment.wire('N1').query, publishedToSF: { $ne: true } });
      expect(findDisallowedQueryOperator(outcome.built)).toBeUndefined();
    });

    it('match nothing when the rights cannot be read at build time', async () => {
      const env = new TestEnvironment();
      const matched: MatchedQuery = env.match('query-subscribe', 'note_threads', TestEnvironment.wire('N1').query)!;
      env.world.data.fail();

      const built: JsonObject = await matched.build(env.world.contextFor('translator').session);

      expect(built).toEqual({ ...TestEnvironment.wire('N1').query, _id: '' });
    });
  });

  describe('Biblical Terms, chapter audio and training data', () => {
    it('are allowed to members with the view right', async () => {
      const env = new TestEnvironment();
      const expected: [TestUserName, boolean, boolean, boolean][] = [
        // user, B1, A1, T1/T2
        ['admin', true, true, true],
        ['translator', true, true, true],
        ['consultant', true, true, false],
        ['ptObserver', true, true, false],
        ['checker', false, true, false],
        ['commenter', false, true, false],
        ['sfObserver', false, true, false],
        ['nonMember', false, false, false],
        ['systemAdmin', false, false, false]
      ];
      for (const [user, terms, audio, trainingData] of expected) {
        expect((await env.runAs(user, 'B1')).authorization.kind, `${user} B1`).toEqual(
          terms ? 'authorized' : 'refused'
        );
        expect((await env.runAs(user, 'A1')).authorization.kind, `${user} A1`).toEqual(
          audio ? 'authorized' : 'refused'
        );
        for (const id of ['T1', 'T2']) {
          expect((await env.runAs(user, id)).authorization.kind, `${user} ${id}`).toEqual(
            trainingData ? 'authorized' : 'refused'
          );
        }
      }
    });

    it('allow training data to Serval administrators, of any project', async () => {
      const env = new TestEnvironment();
      const query: any = TestEnvironment.copy(TestEnvironment.wire('T1').query);
      query.projectRef = OTHER_PROJECT_ID;

      expect((await env.runAs('servalAdmin', 'T2')).authorization.kind).toEqual('authorized');
      expect((await env.run('servalAdmin', 'query-subscribe', 'training_data', query)).built).toEqual(query);
      expect((await env.run('translator', 'query-subscribe', 'training_data', query)).authorization.kind).toEqual(
        'refused'
      );
    });

    it('build the range of the book', async () => {
      const env = new TestEnvironment();
      const query: JsonObject = {
        projectRef: PROJECT_ID,
        references: { $elemMatch: { $gte: 1_000_000, $lt: 2_000_000 } }
      };

      expect((await env.run('admin', 'query-subscribe', 'biblical_terms', query)).built).toEqual(query);
    });
  });

  describe('administration queries', () => {
    it('are allowed only to the administrators who may read the whole collection', async () => {
      const env = new TestEnvironment();
      for (const wire of TestEnvironment.inventory()) {
        if (!['sf_projects', 'sf_projects_profile', 'users'].includes(wire.collection)) {
          continue;
        }
        const allowedUser: TestUserName = wire.collection === 'sf_projects_profile' ? 'servalAdmin' : 'systemAdmin';
        for (const user of ['systemAdmin', 'servalAdmin', 'admin', 'nonMember'] satisfies TestUserName[]) {
          const outcome: QueryOutcome = await env.runAs(user, wire.id);

          expect(outcome.authorization.kind, `${user} ${wire.id}`).toEqual(
            user === allowedUser ? 'authorized' : 'refused'
          );
        }
      }
    });

    it('accept every escaped search term', async () => {
      const env = new TestEnvironment();
      // lodash escapeRegExp('a\\b^$.*+?()[]{}|c')
      const escaped = 'a\\\\b\\^\\$\\.\\*\\+\\?\\(\\)\\[\\]\\{\\}\\|c';
      const query: JsonObject = {
        $or: [{ name: { $regex: escaped, $options: 'i' } }, { shortName: { $regex: escaped, $options: 'i' } }],
        $sort: { name: 1 },
        $skip: 0,
        $limit: 50
      };

      expect(isEscapedRegExpLiteral(escaped)).toBe(true);
      expect((await env.run('systemAdmin', 'query-fetch', 'sf_projects', query)).built).toEqual(query);
    });
  });

  describe('existence checks', () => {
    it('have an entry for every collection the client addresses', () => {
      const env = new TestEnvironment();
      const collections: string[] = Array.from(SF_COLLECTION_POLICIES.keys());

      expect(collections.sort()).toEqual(
        [
          'biblical_terms',
          'note_threads',
          'questions',
          'sf_project_user_configs',
          'sf_projects',
          'sf_projects_profile',
          'text_audio',
          'texts',
          'training_data',
          'user_profiles',
          'users'
        ].sort()
      );
      for (const collection of collections) {
        const matched: MatchedQuery | undefined = env.match('query-fetch', collection, {
          _id: 'x',
          $limit: 1,
          $count: EXISTS_COUNT
        });

        expect(matched?.entryName, collection).toEqual(`${collection}-exists`);
        expect(matched?.extraIsSafe, collection).toBe(true);
        expect(env.match('query-subscribe', collection, { _id: 'x', $limit: 1, $count: EXISTS_COUNT })).toBeUndefined();
      }
    });

    it('ask about a doc the user may read', async () => {
      const env = new TestEnvironment();
      env.putQuestion();

      const built: JsonObject = await env.buildExistence('translator', 'questions', QUESTION_ID);

      expect(built).toEqual({ _id: QUESTION_ID, $limit: 1, $count: EXISTS_COUNT });
      expect(isDocIdExistenceQuery(built)).toBe(true);
    });

    it('ask about no doc when the user may not read the doc', async () => {
      const env = new TestEnvironment();
      env.putQuestion();

      const built: JsonObject = await env.buildExistence('nonMember', 'questions', QUESTION_ID);

      expect(built).toEqual({ _id: '', $limit: 1, $count: EXISTS_COUNT });
      expect(isDocIdExistenceQuery(built)).toBe(true);
    });

    it('decide by id where no doc is', async () => {
      const env = new TestEnvironment();

      expect((await env.buildExistence('translator', 'questions', `${PROJECT_ID}:missing`))._id).toEqual(
        `${PROJECT_ID}:missing`
      );
      expect((await env.buildExistence('translator', 'questions', `${OTHER_PROJECT_ID}:missing`))._id).toEqual('');
      expect((await env.buildExistence('translator', 'questions', 'not a question id'))._id).toEqual('');
      expect((await env.buildExistence('translator', USERS_COLLECTION, USERS.translator))._id).toEqual(
        USERS.translator
      );
      expect((await env.buildExistence('translator', USERS_COLLECTION, USERS.admin))._id).toEqual('');
      expect((await env.buildExistence('systemAdmin', SF_PROJECTS_COLLECTION, OTHER_PROJECT_ID))._id).toEqual(
        OTHER_PROJECT_ID
      );
    });

    it('read the doc from the collection behind a projection', async () => {
      const env = new TestEnvironment();

      expect((await env.buildExistence('checker', 'sf_projects_profile', PROJECT_ID))._id).toEqual(PROJECT_ID);
      expect((await env.buildExistence('nonMember', 'sf_projects_profile', PROJECT_ID))._id).toEqual('');
    });

    it('ask about no doc when the database cannot be read', async () => {
      const env = new TestEnvironment();
      env.putQuestion();
      env.world.data.fail();

      const built: JsonObject = await env.buildExistence('translator', 'questions', QUESTION_ID);

      expect(built._id).toEqual('');
    });

    it('do not match ids that are empty or too long', () => {
      const env = new TestEnvironment();

      expect(env.match('query-fetch', 'questions', { _id: '', $limit: 1, $count: EXISTS_COUNT })).toBeUndefined();
      expect(
        env.match('query-fetch', 'questions', { _id: 'a'.repeat(1025), $limit: 1, $count: EXISTS_COUNT })
      ).toBeUndefined();
      expect(
        env.match('query-fetch', 'questions', { _id: { $ne: '' }, $limit: 1, $count: EXISTS_COUNT })
      ).toBeUndefined();
      expect(env.match('query-fetch', 'questions', { _id: 'x', $limit: 2, $count: EXISTS_COUNT })).toBeUndefined();
      expect(env.match('query-fetch', 'questions', { _id: 'x', $limit: 1, $count: UNPAGED_COUNT })).toBeUndefined();
      expect(
        env.match('query-fetch', 'questions', { _id: 'x', $limit: 1, $count: EXISTS_COUNT, projectRef: PROJECT_ID })
      ).toBeUndefined();
    });
  });

  describe('a database failure', () => {
    it('refuses project queries rather than rejecting', async () => {
      const env = new TestEnvironment();
      env.world.data.fail();
      const cases: [TestUserName, string][] = [
        ['checker', 'Q1d'],
        ['checker', 'Q3'],
        ['translator', 'N1'],
        ['translator', 'B1'],
        ['checker', 'A1'],
        ['translator', 'T1'],
        ['servalAdmin', 'T2']
      ];
      for (const [user, id] of cases) {
        // SUT
        const outcome: QueryOutcome = await env.runAs(user, id);

        expect(outcome.authorization.kind, id).toEqual('refused');
      }
    });
  });
});
