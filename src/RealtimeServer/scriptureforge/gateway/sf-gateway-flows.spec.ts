import 'jest-expect-message';
import { GATEWAY_REFUSED_CODE, SHAREDB_SILENT_READ_REJECTION_CODE } from '../../common/gateway/gateway-connection';
import { JsonObject } from '../../common/gateway/json';
import { JSON0_TYPE_URI, RICH_TEXT_TYPE_URI } from '../../common/gateway/protocol-config';
import {
  ADMIN,
  ADMIN_TRAINING_DATA_ID,
  BIBLICAL_TERM_ID,
  CHECKER,
  COMMENTER,
  CONSULTANT,
  Message,
  NON_MEMBER,
  OTHER_PROJECT_ID,
  PROJECT_ID,
  PT_OBSERVER,
  PUBLISHED_THREAD_DATA_ID,
  PUBLISHED_THREAD_ID,
  QUESTION_DATA_ID,
  QUESTION_ID,
  READ_ONLY_TEXT_ID,
  SF_OBSERVER,
  TestClient,
  TestEnvironment,
  TEXT_AUDIO_ID,
  TEXT_ID,
  TRANSLATOR,
  TRANSLATOR_TRAINING_DATA_ID,
  UNPUBLISHED_THREAD_ID
} from '../../common/gateway/test-gateway-environment';
import { USER_PROFILES_COLLECTION, USERS_COLLECTION } from '../../common/models/user';
import { Json0OpBuilder } from '../../common/utils/json0-op-builder';
import { BIBLICAL_TERM_COLLECTION } from '../models/biblical-term';
import { NOTE_THREAD_COLLECTION, NoteThread } from '../models/note-thread';
import { Question, QUESTIONS_COLLECTION } from '../models/question';
import { SF_PROJECT_PROFILES_COLLECTION } from '../models/sf-project';
import { SFProjectRole } from '../models/sf-project-role';
import { SF_PROJECT_USER_CONFIGS_COLLECTION, SFProjectUserConfig } from '../models/sf-project-user-config';
import { TEXT_AUDIO_COLLECTION } from '../models/text-audio';
import { TEXTS_COLLECTION } from '../models/text-data';
import { TRAINING_DATA_COLLECTION } from '../models/training-data';

/**
 * End-to-end flows through Scripture Forge's gateway, with the messages the Scripture Forge client sends, in the
 * order it sends them: the real server on an in-memory database, behind the gateway, over a real websocket.
 */

/** How long to listen when asserting that nothing arrives. */
const QUIET_PERIOD_MS = 250;

const NEW_QUESTION_DATA_ID = 'c0000000000000000000000b';
const NEW_THREAD_DATA_ID = 'd0000000000000000000000b';
const NEW_THREAD_ID = `${PROJECT_ID}:${NEW_THREAD_DATA_ID}`;
const ANSWER_DATA_ID = 'b00000000000000000000001';
const ADDED_NOTE_DATA_ID = 'f0000000000000000000000d';
const VIEWER_CHANNEL = `${TEXTS_COLLECTION}:${TEXT_ID}`;
const CURSOR_CHANNEL = `${TEXTS_COLLECTION}.${TEXT_ID}`;
const ADMIN_PRESENCE_ID = '0123456789abcdef0000000a';
const TRANSLATOR_PRESENCE_ID = '0123456789abcdef0000000b';
const QUESTION_SORT: JsonObject = {
  'verseRef.bookNum': 1,
  'verseRef.chapterNum': 1,
  'verseRef.verseNum': 1,
  dateCreated: 1
};

/** The queries the client's pages subscribe to (see the gateway's query registry). */
type PageQuery =
  | 'questions'
  | 'chapterQuestions'
  | 'unansweredQuestion'
  | 'noteThreads'
  | 'biblicalTermNoteThreads'
  | 'biblicalTerms'
  | 'textAudio'
  | 'trainingData';

const ALL_PAGE_QUERIES: readonly PageQuery[] = [
  'questions',
  'chapterQuestions',
  'unansweredQuestion',
  'noteThreads',
  'biblicalTermNoteThreads',
  'biblicalTerms',
  'textAudio',
  'trainingData'
];

/** What one project role's pages load, and what the gateway must refuse it. */
interface RoleFlow {
  readonly role: string;
  readonly userId: string;
  /** The queries the role's pages subscribe to, with the docs each must deliver. */
  readonly queries: ReadonlyMap<PageQuery, readonly string[]>;
  /** Queries the role's pages never run, because the role may not read their docs. Each must be refused. */
  readonly refusedQueries: readonly PageQuery[];
  /** Whether the role may read a note thread that is not published to Scripture Forge. */
  readonly readsUnpublishedThreads: boolean;
}

const PARATEXT_MEMBER_QUERIES: ReadonlyMap<PageQuery, readonly string[]> = new Map<PageQuery, readonly string[]>([
  ['questions', [QUESTION_ID]],
  ['noteThreads', [PUBLISHED_THREAD_ID, UNPUBLISHED_THREAD_ID]],
  ['biblicalTermNoteThreads', []],
  ['biblicalTerms', [BIBLICAL_TERM_ID]],
  ['textAudio', [TEXT_AUDIO_ID]]
]);

const ROLE_FLOWS: readonly RoleFlow[] = [
  {
    role: 'administrator',
    userId: ADMIN,
    queries: new Map([
      ...PARATEXT_MEMBER_QUERIES,
      ['trainingData', [ADMIN_TRAINING_DATA_ID, TRANSLATOR_TRAINING_DATA_ID]]
    ]),
    refusedQueries: [],
    readsUnpublishedThreads: true
  },
  {
    role: 'translator',
    userId: TRANSLATOR,
    queries: new Map([
      ...PARATEXT_MEMBER_QUERIES,
      ['trainingData', [ADMIN_TRAINING_DATA_ID, TRANSLATOR_TRAINING_DATA_ID]]
    ]),
    refusedQueries: [],
    readsUnpublishedThreads: true
  },
  {
    role: 'consultant',
    userId: CONSULTANT,
    queries: PARATEXT_MEMBER_QUERIES,
    refusedQueries: ['trainingData'],
    readsUnpublishedThreads: true
  },
  {
    role: 'Paratext observer',
    userId: PT_OBSERVER,
    queries: PARATEXT_MEMBER_QUERIES,
    refusedQueries: ['trainingData'],
    readsUnpublishedThreads: true
  },
  {
    role: 'community checker',
    userId: CHECKER,
    queries: new Map<PageQuery, readonly string[]>([
      ['questions', [QUESTION_ID]],
      ['chapterQuestions', [QUESTION_ID]],
      ['unansweredQuestion', [QUESTION_ID]],
      ['textAudio', [TEXT_AUDIO_ID]]
    ]),
    refusedQueries: ['noteThreads', 'biblicalTermNoteThreads', 'biblicalTerms', 'trainingData'],
    readsUnpublishedThreads: false
  },
  {
    role: 'commenter',
    userId: COMMENTER,
    // The built query has only the threads published to Scripture Forge.
    queries: new Map<PageQuery, readonly string[]>([['noteThreads', [PUBLISHED_THREAD_ID]]]),
    refusedQueries: ['questions', 'chapterQuestions', 'biblicalTerms', 'trainingData'],
    readsUnpublishedThreads: false
  },
  {
    role: 'Scripture Forge observer',
    userId: SF_OBSERVER,
    queries: new Map<PageQuery, readonly string[]>([['noteThreads', [PUBLISHED_THREAD_ID]]]),
    refusedQueries: ['questions', 'chapterQuestions', 'biblicalTerms', 'trainingData'],
    readsUnpublishedThreads: false
  }
];

describe('Scripture Forge gateway flows', () => {
  describe('each project role', () => {
    it.each(ROLE_FLOWS.map((flow: RoleFlow): [string, RoleFlow] => [flow.role, flow]))(
      '%s: loads the project and what its pages read, and is refused what it may not read',
      async (_role: string, flow: RoleFlow) => {
        const env = new FlowEnvironment();
        await env.start();
        const client: TestClient = await env.connect(flow.userId);

        // SUT
        const project: ProjectLoad = await env.openProject(client, flow.userId);
        const delivered = new Map<PageQuery, QueryOutcome>();
        const refused = new Map<PageQuery, QueryOutcome>();
        let queryId = 1;
        for (const name of flow.queries.keys()) {
          delivered.set(name, await env.runPageQuery(client, queryId, name, flow.userId));
          queryId += 2;
        }
        for (const name of flow.refusedQueries) {
          refused.set(name, await env.runPageQuery(client, queryId, name, flow.userId));
          queryId += 2;
        }
        const text: Message = await client.request({ a: 's', c: TEXTS_COLLECTION, d: TEXT_ID, v: null });
        const unpublishedThread: Message = await client.request({
          a: 's',
          c: NOTE_THREAD_COLLECTION,
          d: UNPUBLISHED_THREAD_ID,
          v: null
        });

        expect(project.profile.data.data.name).toEqual('project01');
        expect(project.user.data.data.displayName).toBeDefined();
        expect(project.config.data.data.ownerRef).toEqual(flow.userId);
        expect(project.adminProfile.data.data.displayName).toEqual('Test user 1');
        for (const [name, expectedIds] of flow.queries) {
          const outcome: QueryOutcome = delivered.get(name)!;
          expect(
            outcome.replies.map(reply => reply.error),
            name
          ).toEqual(outcome.replies.map(() => undefined));
          expect([...outcome.insertedIds].sort(), name).toEqual([...expectedIds].sort());
        }
        for (const [name, outcome] of refused) {
          expect(outcome.replies[0].error?.code, name).toEqual(GATEWAY_REFUSED_CODE);
          expect(outcome.insertedIds, name).toEqual([]);
        }
        expect(text.data.type).toEqual(RICH_TEXT_TYPE_URI);
        if (flow.readsUnpublishedThreads) {
          expect(unpublishedThread.data.data.publishedToSF).toBe(false);
        } else {
          expect(unpublishedThread.error.code).toEqual(GATEWAY_REFUSED_CODE);
          expect(unpublishedThread.data).toBeUndefined();
        }
        expect(client.isOpen).toBe(true);
        await env.stop();
      }
    );

    it('non-member: reads only their own user doc, project config and profiles, and keeps the connection', async () => {
      const env = new FlowEnvironment();
      await env.start();
      const client: TestClient = await env.connect(NON_MEMBER);

      // SUT
      const profile: Message = await client.request({
        a: 's',
        c: SF_PROJECT_PROFILES_COLLECTION,
        d: PROJECT_ID,
        v: null
      });
      const user: Message = await client.request({ a: 's', c: USERS_COLLECTION, d: NON_MEMBER, v: null });
      const config: Message = await client.request({
        a: 's',
        c: SF_PROJECT_USER_CONFIGS_COLLECTION,
        d: `${PROJECT_ID}:${NON_MEMBER}`,
        v: null
      });
      const adminProfile: Message = await client.request({ a: 's', c: USER_PROFILES_COLLECTION, d: ADMIN, v: null });
      const adminUser: Message = await client.request({ a: 's', c: USERS_COLLECTION, d: ADMIN, v: null });
      const queries: QueryOutcome[] = [];
      for (const [index, name] of ALL_PAGE_QUERIES.entries()) {
        queries.push(await env.runPageQuery(client, 1 + index * 2, name, NON_MEMBER));
      }
      const text: Message = await client.request({ a: 's', c: TEXTS_COLLECTION, d: TEXT_ID, v: null });
      const question: Message = await client.request({ a: 'f', c: QUESTIONS_COLLECTION, d: QUESTION_ID, v: null });

      expect(profile.error.code).toEqual(GATEWAY_REFUSED_CODE);
      expect(user.data.data.displayName).toEqual('Test user 5');
      // There is no config: the user learns only that their own config does not exist.
      expect(config.error).toBeUndefined();
      expect(config.data).toEqual({ v: 0, type: null });
      expect(adminProfile.data.data.displayName).toEqual('Test user 1');
      expect(adminUser.error.code).toEqual(GATEWAY_REFUSED_CODE);
      for (const outcome of queries) {
        expect(outcome.replies[0].error?.code).toEqual(GATEWAY_REFUSED_CODE);
        expect(outcome.insertedIds).toEqual([]);
      }
      expect(text.error.code).toEqual(GATEWAY_REFUSED_CODE);
      expect(question.error.code).toEqual(GATEWAY_REFUSED_CODE);
      expect(client.since(0).filter(m => m.a === 'q')).toEqual([]);
      expect(client.isOpen).toBe(true);
      await env.stop();
    });
  });

  describe('each project role, editing', () => {
    it('administrator: edits both chapters and creates a question', async () => {
      const env = new FlowEnvironment();
      await env.start();
      const client: TestClient = await env.connect(ADMIN);
      await env.openProject(client, ADMIN);
      await client.request({ a: 's', c: TEXTS_COLLECTION, d: TEXT_ID, v: null });
      await client.request({ a: 's', c: TEXTS_COLLECTION, d: READ_ONLY_TEXT_ID, v: null });

      // SUT
      const chapter1: Message = await client.request(env.textOp(TEXT_ID, 1, 1, 'The book'));
      const chapter2: Message = await client.request(env.textOp(READ_ONLY_TEXT_ID, 2, 1, 'Now when'));
      const create: Message = await client.request(
        env.createOp(
          QUESTIONS_COLLECTION,
          `${PROJECT_ID}:${NEW_QUESTION_DATA_ID}`,
          3,
          env.question(NEW_QUESTION_DATA_ID, ADMIN, 'Who was Abraham?')
        )
      );

      expect(chapter1).toEqual({ a: 'op', c: TEXTS_COLLECTION, d: TEXT_ID, src: client.src, seq: 1, v: 1 });
      expect(chapter2.error).toBeUndefined();
      expect(create.error).toBeUndefined();
      expect(
        (await env.serverSnapshot(QUESTIONS_COLLECTION, `${PROJECT_ID}:${NEW_QUESTION_DATA_ID}`)).data.text
      ).toEqual('Who was Abraham?');
      await env.stop();
    });

    it('translator: edits a chapter it may write, and is refused one it may only read', async () => {
      const env = new FlowEnvironment();
      await env.start();
      const client: TestClient = await env.connect(TRANSLATOR);
      await env.openProject(client, TRANSLATOR);
      await client.request({ a: 's', c: TEXTS_COLLECTION, d: TEXT_ID, v: null });
      await client.request({ a: 's', c: TEXTS_COLLECTION, d: READ_ONLY_TEXT_ID, v: null });

      // SUT
      const writable: Message = await client.request(env.textOp(TEXT_ID, 1, 1, 'The book'));
      const readOnly: Message = await client.request(env.textOp(READ_ONLY_TEXT_ID, 2, 1, 'Now when'));
      const question: Message = await client.request(
        env.createOp(
          QUESTIONS_COLLECTION,
          `${PROJECT_ID}:${NEW_QUESTION_DATA_ID}`,
          3,
          env.question(NEW_QUESTION_DATA_ID, TRANSLATOR, 'May I ask?')
        )
      );

      expect(writable.error).toBeUndefined();
      expect(readOnly.error.code).toEqual(GATEWAY_REFUSED_CODE);
      expect(question.error.code).toEqual(GATEWAY_REFUSED_CODE);
      expect((await env.serverSnapshot(TEXTS_COLLECTION, TEXT_ID)).v).toEqual(2);
      expect((await env.serverSnapshot(TEXTS_COLLECTION, READ_ONLY_TEXT_ID)).v).toEqual(1);
      expect(client.isOpen).toBe(true);
      await env.stop();
    });

    it.each([
      ['consultant', CONSULTANT, true],
      ['Paratext observer', PT_OBSERVER, false],
      ['community checker', CHECKER, true]
    ])(
      '%s: may not edit text, and answers a question only with the right to',
      async (_role: string, userId: string, mayAnswer: boolean) => {
        const env = new FlowEnvironment();
        await env.start();
        const client: TestClient = await env.connect(userId);
        await env.openProject(client, userId);
        await env.runPageQuery(client, 1, 'questions', userId);
        await client.request({ a: 's', c: TEXTS_COLLECTION, d: TEXT_ID, v: null });

        // SUT
        const text: Message = await client.request(env.textOp(TEXT_ID, 1, 1, 'The book'));
        const answer: Message = await client.request(env.answerOp(QUESTION_ID, 2, 1, userId));

        expect(text.error.code).toEqual(GATEWAY_REFUSED_CODE);
        expect((await env.serverSnapshot(TEXTS_COLLECTION, TEXT_ID)).v).toEqual(1);
        const answers: unknown[] = (await env.serverSnapshot(QUESTIONS_COLLECTION, QUESTION_ID)).data.answers;
        if (mayAnswer) {
          expect(answer).toEqual({ a: 'op', c: QUESTIONS_COLLECTION, d: QUESTION_ID, src: client.src, seq: 2, v: 1 });
          expect(answers).toEqual([env.answer(ANSWER_DATA_ID, userId, 'An answer')]);
        } else {
          expect(answer.error.code).toEqual(GATEWAY_REFUSED_CODE);
          expect(answers).toEqual([]);
        }
        expect(client.isOpen).toBe(true);
        await env.stop();
      }
    );

    it('community checker: may not create note threads or add notes', async () => {
      const env = new FlowEnvironment();
      await env.start();
      const client: TestClient = await env.connect(CHECKER);
      await env.openProject(client, CHECKER);

      // SUT
      const create: Message = await client.request(env.createNoteThreadOp(1, CHECKER));
      const note: Message = await client.request(env.addNoteOp(PUBLISHED_THREAD_ID, 2, 1, CHECKER));

      expect(create.error.code).toEqual(GATEWAY_REFUSED_CODE);
      expect(note.error.code).toEqual(GATEWAY_REFUSED_CODE);
      expect((await env.serverSnapshot(NOTE_THREAD_COLLECTION, PUBLISHED_THREAD_ID)).v).toEqual(1);
      expect(client.isOpen).toBe(true);
      await env.stop();
    });

    it('commenter: creates a note thread and adds a note to a published thread, but not to an unpublished one', async () => {
      const env = new FlowEnvironment();
      await env.start();
      const client: TestClient = await env.connect(COMMENTER);
      await env.openProject(client, COMMENTER);
      await env.runPageQuery(client, 1, 'noteThreads', COMMENTER);

      // SUT
      const create: Message = await client.request(env.createNoteThreadOp(1, COMMENTER));
      const note: Message = await client.request(env.addNoteOp(PUBLISHED_THREAD_ID, 2, 1, COMMENTER));
      // After adding a note, the editor marks it read in the user's project config.
      const readRefs: Message = await client.request(env.markNoteReadOp(COMMENTER, 3, 1));
      const unpublished: Message = await client.request(env.addNoteOp(UNPUBLISHED_THREAD_ID, 4, 1, COMMENTER));
      const text: Message = await client.request(env.textOp(TEXT_ID, 5, 1, 'The book'));

      expect(create.error).toBeUndefined();
      expect((await env.serverSnapshot(NOTE_THREAD_COLLECTION, NEW_THREAD_ID)).data.ownerRef).toEqual(COMMENTER);
      expect(note.error).toBeUndefined();
      expect((await env.serverSnapshot(NOTE_THREAD_COLLECTION, PUBLISHED_THREAD_ID)).data.notes.length).toEqual(2);
      expect(readRefs.error).toBeUndefined();
      // The write hook refuses it, because the commenter may not read the thread. A refusal by ShareDB middleware reaches
      // the client with ShareDB's generic error code, so only the message tells that it was refused.
      expect(unpublished.error.message).toMatch(/^403: /);
      expect((await env.serverSnapshot(NOTE_THREAD_COLLECTION, UNPUBLISHED_THREAD_ID)).v).toEqual(1);
      expect(text.error.code).toEqual(GATEWAY_REFUSED_CODE);
      expect(client.isOpen).toBe(true);
      await env.stop();
    });

    it('Scripture Forge observer: may not create note threads or add notes', async () => {
      const env = new FlowEnvironment();
      await env.start();
      const client: TestClient = await env.connect(SF_OBSERVER);
      await env.openProject(client, SF_OBSERVER);
      await env.runPageQuery(client, 1, 'noteThreads', SF_OBSERVER);

      // SUT
      const create: Message = await client.request(env.createNoteThreadOp(1, SF_OBSERVER));
      const note: Message = await client.request(env.addNoteOp(PUBLISHED_THREAD_ID, 2, 1, SF_OBSERVER));

      expect(create.error.code).toEqual(GATEWAY_REFUSED_CODE);
      expect(note.error.code).toEqual(GATEWAY_REFUSED_CODE);
      expect((await env.serverSnapshot(NOTE_THREAD_COLLECTION, PUBLISHED_THREAD_ID)).v).toEqual(1);
      expect(client.isOpen).toBe(true);
      await env.stop();
    });

    it('non-member: is refused every edit, and keeps the connection', async () => {
      const env = new FlowEnvironment();
      await env.start();
      const client: TestClient = await env.connect(NON_MEMBER);

      // SUT
      const text: Message = await client.request(env.textOp(TEXT_ID, 1, 1, 'The book'));
      const answer: Message = await client.request(env.answerOp(QUESTION_ID, 2, 1, NON_MEMBER));
      const question: Message = await client.request(
        env.createOp(
          QUESTIONS_COLLECTION,
          `${PROJECT_ID}:${NEW_QUESTION_DATA_ID}`,
          3,
          env.question(NEW_QUESTION_DATA_ID, NON_MEMBER, 'Can I ask?')
        )
      );
      const thread: Message = await client.request(env.createNoteThreadOp(4, NON_MEMBER));

      for (const reply of [text, answer, question, thread]) {
        expect(reply.error.code).toEqual(GATEWAY_REFUSED_CODE);
      }
      expect((await env.serverSnapshot(TEXTS_COLLECTION, TEXT_ID)).v).toEqual(1);
      expect((await env.serverSnapshot(QUESTIONS_COLLECTION, QUESTION_ID)).v).toEqual(1);
      expect(client.isOpen).toBe(true);
      await env.stop();
    });
  });

  describe('live collaboration', () => {
    it("two editors of a chapter see each other's ops and presence", async () => {
      const env = new FlowEnvironment();
      await env.start();
      const admin: TestClient = await env.connect(ADMIN);
      const translator: TestClient = await env.connect(TRANSLATOR);
      for (const client of [admin, translator]) {
        await client.request({ a: 's', c: TEXTS_COLLECTION, d: TEXT_ID, v: null });
        await client.request({ a: 'ps', ch: VIEWER_CHANNEL, seq: 1 });
        await client.request({ a: 'ps', ch: CURSOR_CHANNEL, seq: 2 });
      }
      const adminStart: number = admin.mark;
      const translatorStart: number = translator.mark;

      // SUT
      admin.send(env.viewerPresence(ADMIN_PRESENCE_ID, 0, '#aa0000'));
      admin.send(env.cursorPresence(ADMIN_PRESENCE_ID, 0, 1, 0));
      translator.send(env.viewerPresence(TRANSLATOR_PRESENCE_ID, 0, '#00aa00'));
      translator.send(env.cursorPresence(TRANSLATOR_PRESENCE_ID, 0, 1, 0));
      await admin.request(env.textOp(TEXT_ID, 1, 1, 'The book'));
      const adminOp: Message = await translator.waitFor(m => m.a === 'op' && m.op != null, translatorStart);
      await translator.request({ ...env.textOp(TEXT_ID, 1, 2, ''), op: { ops: [{ retain: 8 }, { insert: ' of' }] } });
      const translatorOp: Message = await admin.waitFor(m => m.a === 'op' && m.op != null, adminStart);
      admin.send(env.cursorPresence(ADMIN_PRESENCE_ID, 1, 3, 11));
      const movedCursor: Message = await translator.waitFor(
        m => m.a === 'p' && m.ch === CURSOR_CHANNEL && m.src === admin.src && m.pv === 1,
        translatorStart
      );

      expect(adminOp).toEqual({
        a: 'op',
        c: TEXTS_COLLECTION,
        d: TEXT_ID,
        v: 1,
        src: admin.src,
        seq: 1,
        op: { ops: [{ insert: 'The book' }] }
      });
      expect(translatorOp).toEqual({
        a: 'op',
        c: TEXTS_COLLECTION,
        d: TEXT_ID,
        v: 2,
        src: translator.src,
        seq: 1,
        op: { ops: [{ retain: 8 }, { insert: ' of' }] }
      });
      // Each sees the other's viewer, named from the other's user doc, and the other's cursor.
      expect(await env.presenceFrom(translator, admin.src, VIEWER_CHANNEL, translatorStart)).toEqual({
        a: 'p',
        ch: VIEWER_CHANNEL,
        src: admin.src,
        id: ADMIN_PRESENCE_ID,
        p: { viewer: { displayName: 'Test user 1', avatarUrl: '', cursorColor: '#aa0000', activeInEditor: true } },
        pv: 0
      });
      expect(await env.presenceFrom(admin, translator.src, VIEWER_CHANNEL, adminStart)).toEqual({
        a: 'p',
        ch: VIEWER_CHANNEL,
        src: translator.src,
        id: TRANSLATOR_PRESENCE_ID,
        p: { viewer: { displayName: 'Test user 2', avatarUrl: '', cursorColor: '#00aa00', activeInEditor: true } },
        pv: 0
      });
      expect((await env.presenceFrom(translator, admin.src, CURSOR_CHANNEL, translatorStart)).p).toEqual({
        index: 0,
        length: 0
      });
      expect((await env.presenceFrom(admin, translator.src, CURSOR_CHANNEL, adminStart)).p).toEqual({
        index: 0,
        length: 0
      });
      expect(movedCursor).toEqual({
        a: 'p',
        ch: CURSOR_CHANNEL,
        src: admin.src,
        id: ADMIN_PRESENCE_ID,
        p: { index: 11, length: 0 },
        pv: 1,
        c: TEXTS_COLLECTION,
        d: TEXT_ID,
        v: 3,
        t: RICH_TEXT_TYPE_URI
      });
      await env.stop();
    });

    it("a checker's question query gets the administrator's new question, and answers to it", async () => {
      const env = new FlowEnvironment();
      await env.start();
      const checker: TestClient = await env.connect(CHECKER);
      await env.openProject(checker, CHECKER);
      await env.runPageQuery(checker, 1, 'chapterQuestions', CHECKER);
      const admin: TestClient = await env.connect(ADMIN);
      const consultant: TestClient = await env.connect(CONSULTANT);
      const newQuestionId = `${PROJECT_ID}:${NEW_QUESTION_DATA_ID}`;
      const start: number = checker.mark;

      // SUT
      await admin.request(
        env.createOp(
          QUESTIONS_COLLECTION,
          newQuestionId,
          1,
          env.question(NEW_QUESTION_DATA_ID, ADMIN, 'Who was Abraham?')
        )
      );
      const inserted: Message = await checker.waitFor(m => m.a === 'q' && m.id === 1, start);
      const answer: Message = await consultant.request(
        env.answerOp(newQuestionId, 1, 1, CONSULTANT, env.question(NEW_QUESTION_DATA_ID, ADMIN, 'Who was Abraham?'))
      );
      const answerPush: Message = await checker.waitFor(m => m.a === 'op' && m.d === newQuestionId, start);

      expect(inserted.diff).toEqual([
        {
          type: 'insert',
          index: 1,
          values: [{ d: newQuestionId, v: 1, data: env.question(NEW_QUESTION_DATA_ID, ADMIN, 'Who was Abraham?') }]
        }
      ]);
      expect(answer.error).toBeUndefined();
      expect(answerPush).toEqual({
        a: 'op',
        c: QUESTIONS_COLLECTION,
        d: newQuestionId,
        v: 1,
        src: consultant.src,
        seq: 1,
        op: [{ p: ['answers', 0], li: env.answer(ANSWER_DATA_ID, CONSULTANT, 'An answer') }]
      });
      await env.stop();
    });
  });

  describe('reconnecting', () => {
    it('resubscribes with the versions it has and catches up on what it missed', async () => {
      const env = new FlowEnvironment();
      await env.start();
      const before: TestClient = await env.connect(TRANSLATOR);
      await env.openProject(before, TRANSLATOR);
      await before.request({ a: 's', c: TEXTS_COLLECTION, d: TEXT_ID, v: null });
      await before.request({ a: 's', c: TEXTS_COLLECTION, d: READ_ONLY_TEXT_ID, v: null });
      await env.runPageQuery(before, 1, 'questions', TRANSLATOR);
      await before.close();
      const admin: TestClient = await env.connect(ADMIN);
      await admin.request(env.textOp(TEXT_ID, 1, 1, 'The book'));
      await admin.request(env.textOp(TEXT_ID, 2, 2, ' of'));
      await admin.request(env.textOp(READ_ONLY_TEXT_ID, 3, 1, 'Now when'));
      const newQuestionId = `${PROJECT_ID}:${NEW_QUESTION_DATA_ID}`;
      await admin.request(
        env.createOp(QUESTIONS_COLLECTION, newQuestionId, 4, env.question(NEW_QUESTION_DATA_ID, ADMIN, 'Who?'))
      );

      // SUT
      const after: TestClient = await env.connect(TRANSLATOR, { previousSrc: before.src });
      // As ShareDB's client does on reconnecting: queries first, then the docs it holds, with their versions.
      after.send({
        a: 'qs',
        id: 1,
        c: QUESTIONS_COLLECTION,
        q: env.pageQuery('questions', TRANSLATOR).query,
        o: {},
        r: [[QUESTION_ID, 1]]
      });
      after.send({ a: 's', c: SF_PROJECT_PROFILES_COLLECTION, d: PROJECT_ID, v: 1 });
      after.send({ a: 's', c: USERS_COLLECTION, d: TRANSLATOR, v: 1 });
      after.send({ a: 's', c: SF_PROJECT_USER_CONFIGS_COLLECTION, d: `${PROJECT_ID}:${TRANSLATOR}`, v: 1 });
      after.send({ a: 'bs', c: TEXTS_COLLECTION, b: { [TEXT_ID]: 1, [READ_ONLY_TEXT_ID]: 1 } });
      const texts: Message = await after.waitFor(m => m.a === 'bs');
      const query: Message = await after.waitFor(m => m.a === 'qs');
      const resubscribed: Message[] = await after.waitForCount(m => m.a === 's', 3);

      expect(after.src).toEqual(before.src);
      expect(texts).toEqual({ a: 'bs', c: TEXTS_COLLECTION, b: { [TEXT_ID]: 1, [READ_ONLY_TEXT_ID]: 1 } });
      expect(after.opsSince(0, TEXTS_COLLECTION, TEXT_ID).map(op => [op.v, op.src, op.op])).toEqual([
        [1, admin.src, { ops: [{ insert: 'The book' }] }],
        [2, admin.src, { ops: [{ insert: ' of' }] }]
      ]);
      expect(after.opsSince(0, TEXTS_COLLECTION, READ_ONLY_TEXT_ID).map(op => [op.v, op.op])).toEqual([
        [1, { ops: [{ insert: 'Now when' }] }]
      ]);
      expect(query.error).toBeUndefined();
      expect(env.insertedIds(after, 1, 0)).toEqual([newQuestionId]);
      expect(resubscribed.map(reply => reply.error)).toEqual([undefined, undefined, undefined]);
      expect(after.isOpen).toBe(true);
      await env.stop();
    });
  });

  describe('revocation', () => {
    it('a removed user gets no more ops on their text or results of their query, and stays connected', async () => {
      const env = new FlowEnvironment();
      await env.start();
      const translator: TestClient = await env.connect(TRANSLATOR);
      await env.openProject(translator, TRANSLATOR);
      await translator.request({ a: 's', c: TEXTS_COLLECTION, d: TEXT_ID, v: null });
      const query: QueryOutcome = await env.runPageQuery(translator, 1, 'questions', TRANSLATOR);
      const admin: TestClient = await env.connect(ADMIN);
      await admin.request(env.textOp(TEXT_ID, 1, 1, 'The book'));
      await translator.waitFor(m => m.a === 'op' && m.d === TEXT_ID && m.op != null);
      const start: number = translator.mark;

      // SUT
      await env.removeFromProjectAsServer(TRANSLATOR);
      await admin.request(env.textOp(TEXT_ID, 2, 2, ' of'));
      await admin.request(
        env.createOp(
          QUESTIONS_COLLECTION,
          `${PROJECT_ID}:${NEW_QUESTION_DATA_ID}`,
          3,
          env.question(NEW_QUESTION_DATA_ID, ADMIN, 'Who?')
        )
      );
      await admin.request(env.answerOp(QUESTION_ID, 4, 1, ADMIN));
      const received: Message[] = [...translator.since(start), ...(await translator.collectFor(QUIET_PERIOD_MS))];

      expect(query.insertedIds).toEqual([QUESTION_ID]);
      // The op that removes the user from the project profile is left out here; see the next test.
      expect(received.filter(m => m.a === 'op' && m.c !== SF_PROJECT_PROFILES_COLLECTION)).toEqual([]);
      expect(received.filter(m => m.a === 'q')).toEqual([]);
      expect(translator.isOpen).toBe(true);
      await env.flushLog();
      expect(env.eventSink.events.map(e => e.kind)).toContain('withheld');
      await env.stop();
    });

    // The client tells a removed user that they were removed (AppComponent, "See if the user was removed from the
    // project") when the op that removes them from `userRoles` reaches their subscribed project profile.
    it('a removed user receives the op that removes them, so the client can tell them', async () => {
      const env = new FlowEnvironment();
      await env.start();
      const translator: TestClient = await env.connect(TRANSLATOR);
      await env.openProject(translator, TRANSLATOR);
      const start: number = translator.mark;

      // SUT
      await env.removeFromProjectAsServer(TRANSLATOR);
      const received: Message[] = [...translator.since(start), ...(await translator.collectFor(QUIET_PERIOD_MS))];

      expect(received.filter(m => m.a === 'op')).toEqual([
        {
          a: 'op',
          c: SF_PROJECT_PROFILES_COLLECTION,
          d: PROJECT_ID,
          v: 1,
          src: expect.any(String),
          seq: expect.any(Number),
          op: [{ p: ['userRoles', TRANSLATOR], od: SFProjectRole.ParatextTranslator }]
        }
      ]);
      await env.stop();
    });
  });

  describe('access lost while the client is open', () => {
    // The client subscribes with the version it holds on every page load after the first, and on every reconnect, so
    // the reply carries no snapshot for the gateway to decide on.
    it('a removed user who subscribed with the version they hold receives the op that removes them', async () => {
      const env = new FlowEnvironment();
      await env.start();
      const before: TestClient = await env.connect(TRANSLATOR);
      const load: ProjectLoad = await env.openProject(before, TRANSLATOR);
      await before.close();
      const after: TestClient = await env.connect(TRANSLATOR, { previousSrc: before.src });
      const resubscribed: Message = await after.request({
        a: 's',
        c: SF_PROJECT_PROFILES_COLLECTION,
        d: PROJECT_ID,
        v: load.profile.data.v
      });
      const start: number = after.mark;

      // SUT
      await env.removeFromProjectAsServer(TRANSLATOR);
      const removal: Message = await after.waitFor(m => m.a === 'op' && m.c === SF_PROJECT_PROFILES_COLLECTION, start);

      expect(resubscribed).toEqual({ a: 's', c: SF_PROJECT_PROFILES_COLLECTION, d: PROJECT_ID });
      expect(removal.op).toEqual([{ p: ['userRoles', TRANSLATOR], od: SFProjectRole.ParatextTranslator }]);
      await env.flushLog();
      expect(env.eventSink.events.filter(e => e.kind === 'withheld')).toEqual([]);
      await env.stop();
    });

    it("a removed user's clearing of their presence reaches the others on the text", async () => {
      const env = new FlowEnvironment();
      await env.start();
      const admin: TestClient = await env.connect(ADMIN);
      const translator: TestClient = await env.connect(TRANSLATOR);
      for (const client of [admin, translator]) {
        await client.request({ a: 's', c: TEXTS_COLLECTION, d: TEXT_ID, v: null });
        await client.request({ a: 'ps', ch: VIEWER_CHANNEL, seq: 1 });
        await client.request({ a: 'ps', ch: CURSOR_CHANNEL, seq: 2 });
      }
      translator.send(env.viewerPresence(TRANSLATOR_PRESENCE_ID, 0, '#00aa00'));
      translator.send(env.cursorPresence(TRANSLATOR_PRESENCE_ID, 0, 1, 0));
      await env.presenceFrom(admin, translator.src, CURSOR_CHANNEL, 0);
      await env.removeFromProjectAsServer(TRANSLATOR);
      const start: number = admin.mark;

      // SUT
      // As the editor does when it is destroyed (TextComponent): the cursor and the viewer are cleared.
      translator.send({ ...env.cursorPresence(TRANSLATOR_PRESENCE_ID, 1, 1, 0), p: null });
      translator.send({ ...env.viewerPresence(TRANSLATOR_PRESENCE_ID, 1, '#00aa00'), p: null });
      const clearedCursor: Message = await env.presenceFrom(admin, translator.src, CURSOR_CHANNEL, start);
      const clearedViewer: Message = await env.presenceFrom(admin, translator.src, VIEWER_CHANNEL, start);
      // Presence with a value is still refused, and another connection may not clear the translator's presence.
      translator.send(env.viewerPresence(TRANSLATOR_PRESENCE_ID, 2, '#00aa00'));
      admin.send({ ...env.viewerPresence(TRANSLATOR_PRESENCE_ID, 3, '#00aa00'), p: null });
      const later: Message[] = await admin.collectFor(QUIET_PERIOD_MS);

      expect(clearedCursor.p).toBeNull();
      expect(clearedViewer.p).toBeNull();
      expect(later.filter(m => m.a === 'p' && m.id === TRANSLATOR_PRESENCE_ID)).toEqual([]);
      expect(translator.isOpen).toBe(true);
      await env.stop();
    });

    it('a removed user receives the deletes of the docs they had open, which carry nothing of them', async () => {
      const env = new FlowEnvironment();
      await env.start();
      const translator: TestClient = await env.connect(TRANSLATOR);
      await env.openProject(translator, TRANSLATOR);
      const question: Message = await translator.request({ a: 's', c: QUESTIONS_COLLECTION, d: QUESTION_ID, v: null });
      await env.removeFromProjectAsServer(TRANSLATOR);
      await translator.waitFor(m => m.a === 'op' && m.c === SF_PROJECT_PROFILES_COLLECTION);
      const start: number = translator.mark;

      // SUT
      // As the backend does when it removes a user (their project config) or deletes a project (all of its docs).
      await env.deleteAsServer(SF_PROJECT_USER_CONFIGS_COLLECTION, `${PROJECT_ID}:${TRANSLATOR}`);
      await env.deleteAsServer(QUESTIONS_COLLECTION, QUESTION_ID);
      const received: Message[] = [...translator.since(start), ...(await translator.collectFor(QUIET_PERIOD_MS))];

      expect(question.error).toBeUndefined();
      expect(received.filter(m => m.a === 'op')).toEqual([
        {
          a: 'op',
          c: SF_PROJECT_USER_CONFIGS_COLLECTION,
          d: `${PROJECT_ID}:${TRANSLATOR}`,
          v: expect.any(Number),
          src: expect.any(String),
          seq: expect.any(Number),
          del: true
        },
        {
          a: 'op',
          c: QUESTIONS_COLLECTION,
          d: QUESTION_ID,
          v: expect.any(Number),
          src: expect.any(String),
          seq: expect.any(Number),
          del: true
        }
      ]);
      await env.stop();
    });

    it('a query subscribe naming results the user may no longer read keeps them in place and removes them', async () => {
      const env = new FlowEnvironment();
      await env.start();
      const unpublishedVersion: number = (await env.serverSnapshot(NOTE_THREAD_COLLECTION, UNPUBLISHED_THREAD_ID)).v;
      const publishedVersion: number = (await env.serverSnapshot(NOTE_THREAD_COLLECTION, PUBLISHED_THREAD_ID)).v;
      const client: TestClient = await env.connect(COMMENTER);
      const start: number = client.mark;

      // SUT
      // As if the commenter's offline store still had the unpublished thread from when it was published, first.
      const query: Message = await client.request({
        a: 'qs',
        id: 1,
        c: NOTE_THREAD_COLLECTION,
        q: env.pageQuery('noteThreads', COMMENTER).query,
        o: {},
        r: [
          [UNPUBLISHED_THREAD_ID, unpublishedVersion - 1],
          [PUBLISHED_THREAD_ID, publishedVersion]
        ]
      });
      const removed: Message = await client.waitFor(m => m.a === 'q' && m.id === 1, start);
      // A diff after that lands at the right index of the client's results.
      await env.submitJson0AsServer<NoteThread>(NOTE_THREAD_COLLECTION, UNPUBLISHED_THREAD_ID, op =>
        op.set(t => t.publishedToSF, true)
      );
      const inserted: Message = await client.waitFor(
        m => m.a === 'q' && m.id === 1 && m.diff.some((d: Message) => d.type === 'insert'),
        start
      );
      const received: Message[] = client.since(start);

      expect(query.error).toBeUndefined();
      expect(removed.diff).toEqual([{ type: 'remove', index: 0, howMany: 1 }]);
      expect(inserted.diff).toEqual([
        { type: 'insert', index: expect.any(Number), values: [expect.objectContaining({ d: UNPUBLISHED_THREAD_ID })] }
      ]);
      // Nothing of the thread was sent while the commenter could not read it: neither its ops nor its snapshot.
      expect(received.filter(m => m.a === 'op' && m.d === UNPUBLISHED_THREAD_ID && m.v < unpublishedVersion)).toEqual(
        []
      );
      expect(client.isOpen).toBe(true);
      await env.stop();
    });
  });

  describe('subscribing to a doc before it is created', () => {
    it('refuses a non-member, and a role that may not read every doc that could be at the id', async () => {
      const env = new FlowEnvironment();
      await env.start();
      const outsider: TestClient = await env.connect(NON_MEMBER);
      const commenter: TestClient = await env.connect(COMMENTER);

      // SUT
      const question: Message = await outsider.request({
        a: 's',
        c: QUESTIONS_COLLECTION,
        d: `${PROJECT_ID}:${NEW_QUESTION_DATA_ID}`,
        v: null
      });
      // A thread that is not there yet could be one that is not published to Scripture Forge.
      const thread: Message = await commenter.request({ a: 's', c: NOTE_THREAD_COLLECTION, d: NEW_THREAD_ID, v: null });
      const outsiderStart: number = outsider.mark;
      const commenterStart: number = commenter.mark;
      await env.createAsServer<Question>(
        QUESTIONS_COLLECTION,
        `${PROJECT_ID}:${NEW_QUESTION_DATA_ID}`,
        env.question(NEW_QUESTION_DATA_ID, ADMIN, 'Who?')
      );
      await env.createAsServer<NoteThread>(
        NOTE_THREAD_COLLECTION,
        NEW_THREAD_ID,
        env.noteThread({
          dataId: NEW_THREAD_DATA_ID,
          threadId: 'e0000000000000000000000b',
          noteDataId: 'f0000000000000000000000b',
          ownerRef: ADMIN,
          publishedToSF: false
        })
      );
      await outsider.collectFor(QUIET_PERIOD_MS);

      // Silently, as the server answered before the gateway with an empty snapshot: no doc is there yet.
      expect(question.error.code).toEqual(SHAREDB_SILENT_READ_REJECTION_CODE);
      expect(thread.error.code).toEqual(SHAREDB_SILENT_READ_REJECTION_CODE);
      expect(outsider.since(outsiderStart)).toEqual([]);
      expect(commenter.since(commenterStart)).toEqual([]);
      expect(outsider.isOpen).toBe(true);
      expect(commenter.isOpen).toBe(true);
      await env.stop();
    });

    it('sends the create to a member who may read the created doc', async () => {
      const env = new FlowEnvironment();
      await env.start();
      const observer: TestClient = await env.connect(PT_OBSERVER);
      const admin: TestClient = await env.connect(ADMIN);
      const newQuestionId = `${PROJECT_ID}:${NEW_QUESTION_DATA_ID}`;
      const subscribed: Message = await observer.request({
        a: 's',
        c: QUESTIONS_COLLECTION,
        d: newQuestionId,
        v: null
      });

      // SUT
      await admin.request(
        env.createOp(QUESTIONS_COLLECTION, newQuestionId, 1, env.question(NEW_QUESTION_DATA_ID, ADMIN, 'Who?'))
      );
      const created: Message = await observer.waitFor(m => m.a === 'op' && m.d === newQuestionId);

      expect(subscribed.data).toEqual({ v: 0, type: null });
      expect(created).toEqual({
        a: 'op',
        c: QUESTIONS_COLLECTION,
        d: newQuestionId,
        v: 0,
        src: admin.src,
        seq: 1,
        create: { type: JSON0_TYPE_URI, data: env.question(NEW_QUESTION_DATA_ID, ADMIN, 'Who?') }
      });
      await env.stop();
    });

    it('withholds the create from a subscriber who may not read the created doc', async () => {
      const env = new FlowEnvironment();
      await env.start();
      const translator: TestClient = await env.connect(TRANSLATOR);
      const docId = `${PROJECT_ID}:${NEW_QUESTION_DATA_ID}`;
      const subscribed: Message = await translator.request({ a: 's', c: QUESTIONS_COLLECTION, d: docId, v: null });
      const start: number = translator.mark;

      // SUT
      // The backend makes a doc whose data names a project the translator is not a member of.
      await env.createAsServer<Question>(
        QUESTIONS_COLLECTION,
        docId,
        env.question(NEW_QUESTION_DATA_ID, ADMIN, 'Secret question', OTHER_PROJECT_ID)
      );
      await env.submitJson0AsServer<Question>(QUESTIONS_COLLECTION, docId, op => op.set(q => q.text, 'Still secret'));
      const received: Message[] = [...translator.since(start), ...(await translator.collectFor(QUIET_PERIOD_MS))];

      expect(subscribed.error).toBeUndefined();
      expect(received).toEqual([]);
      expect(translator.isOpen).toBe(true);
      await env.stop();
    });
  });

  describe('a note thread that is no longer published to Scripture Forge', () => {
    it.each([
      ['commenter', COMMENTER],
      ['Scripture Forge observer', SF_OBSERVER]
    ])('is no longer sent to a %s, and leaves their note thread query', async (_role: string, userId: string) => {
      const env = new FlowEnvironment();
      await env.start();
      const client: TestClient = await env.connect(userId);
      const subscribed: Message = await client.request({
        a: 's',
        c: NOTE_THREAD_COLLECTION,
        d: PUBLISHED_THREAD_ID,
        v: null
      });
      const query: QueryOutcome = await env.runPageQuery(client, 1, 'noteThreads', userId);
      const start: number = client.mark;

      // SUT
      await env.submitJson0AsServer<NoteThread>(NOTE_THREAD_COLLECTION, PUBLISHED_THREAD_ID, op =>
        op.set(t => t.publishedToSF, false)
      );
      await env.submitJson0AsServer<NoteThread>(NOTE_THREAD_COLLECTION, PUBLISHED_THREAD_ID, op =>
        op.add(t => t.notes, env.note('f0000000000000000000000c', 'e00000000000000000000001', ADMIN, 'Paratext only'))
      );
      const received: Message[] = [...client.since(start), ...(await client.collectFor(QUIET_PERIOD_MS))];

      expect(subscribed.data.data.publishedToSF).toBe(true);
      expect(query.insertedIds).toEqual([PUBLISHED_THREAD_ID]);
      // The op that takes the thread out of Scripture Forge is an op of the published thread, so it is sent (once for
      // the doc subscription and once for the query); nothing after it is.
      const ops: Message[] = received.filter(m => m.a === 'op');
      expect(ops.length).toBeGreaterThan(0);
      for (const op of ops) {
        expect(op.v).toEqual(subscribed.data.v);
        expect(op.op).toEqual([{ p: ['publishedToSF'], od: true, oi: false }]);
      }
      expect(JSON.stringify(received)).not.toContain('Paratext only');
      expect(received.filter(m => m.a === 'q')).toEqual([
        { a: 'q', id: 1, diff: [{ type: 'remove', index: 0, howMany: 1 }] }
      ]);
      expect(client.isOpen).toBe(true);
      await env.stop();
    });
  });

  describe('a doc deleted and created again', () => {
    it('does not send the ops since a version from before the delete', async () => {
      const env = new FlowEnvironment();
      await env.start();
      const before: TestClient = await env.connect(COMMENTER);
      const subscribed: Message = await before.request({
        a: 's',
        c: NOTE_THREAD_COLLECTION,
        d: PUBLISHED_THREAD_ID,
        v: null
      });
      await before.close();
      // While the commenter is away, the thread is taken out of Scripture Forge, gets a note only Paratext users may
      // read, and is deleted; then a new thread is created at the same id, published to Scripture Forge.
      await env.submitJson0AsServer<NoteThread>(NOTE_THREAD_COLLECTION, PUBLISHED_THREAD_ID, op =>
        op.set(t => t.publishedToSF, false)
      );
      await env.submitJson0AsServer<NoteThread>(NOTE_THREAD_COLLECTION, PUBLISHED_THREAD_ID, op =>
        op.add(t => t.notes, env.note('f0000000000000000000000c', 'e00000000000000000000001', ADMIN, 'Paratext only'))
      );
      await env.deleteAsServer(NOTE_THREAD_COLLECTION, PUBLISHED_THREAD_ID);
      await env.createAsServer<NoteThread>(
        NOTE_THREAD_COLLECTION,
        PUBLISHED_THREAD_ID,
        env.noteThread({
          dataId: PUBLISHED_THREAD_DATA_ID,
          threadId: 'e00000000000000000000003',
          noteDataId: 'f00000000000000000000003',
          ownerRef: ADMIN,
          publishedToSF: true
        })
      );

      // SUT
      const after: TestClient = await env.connect(COMMENTER, { previousSrc: before.src });
      const query: Message = await after.request({
        a: 'qs',
        id: 1,
        c: NOTE_THREAD_COLLECTION,
        q: env.pageQuery('noteThreads', COMMENTER).query,
        o: {},
        r: [[PUBLISHED_THREAD_ID, 1]]
      });
      const resubscribed: Message = await after.request({
        a: 's',
        c: NOTE_THREAD_COLLECTION,
        d: PUBLISHED_THREAD_ID,
        v: 1
      });
      const fetched: Message = await after.request({ a: 'f', c: NOTE_THREAD_COLLECTION, d: PUBLISHED_THREAD_ID, v: 1 });
      const received: Message[] = [...after.since(0), ...(await after.collectFor(QUIET_PERIOD_MS))];

      expect(subscribed.data.v).toEqual(1);
      expect(resubscribed.error.code).toEqual(SHAREDB_SILENT_READ_REJECTION_CODE);
      expect(fetched.error.code).toEqual(SHAREDB_SILENT_READ_REJECTION_CODE);
      // The query sends the thread as it is now, in place of the ops since the version the client named. The thread
      // stays among the query's results, where the client has it, so no diff moves it.
      expect(query.error).toBeUndefined();
      expect(query.data).toEqual({ [PUBLISHED_THREAD_ID]: { v: 5, data: expect.anything() } });
      expect(query.data[PUBLISHED_THREAD_ID].data.threadId).toEqual('e00000000000000000000003');
      expect(received.filter(m => m.a === 'q')).toEqual([]);
      expect(received.filter(m => m.a === 'op')).toEqual([]);
      expect(JSON.stringify(received)).not.toContain('Paratext only');
      expect(after.isOpen).toBe(true);
      await env.stop();
    });
  });

  describe('a query with a new match the subscriber may not read', () => {
    it('sends nothing about it, and keeps the connection', async () => {
      const env = new FlowEnvironment();
      await env.start();
      const observer: TestClient = await env.connect(PT_OBSERVER);
      await env.openProject(observer, PT_OBSERVER);
      const query: QueryOutcome = await env.runPageQuery(observer, 1, 'questions', PT_OBSERVER);
      const admin: TestClient = await env.connect(ADMIN);
      const newQuestionId = `${PROJECT_ID}:${NEW_QUESTION_DATA_ID}`;
      // The observer becomes a Scripture Forge observer, who may not read questions.
      await env.setRoleAsServer(PT_OBSERVER, SFProjectRole.Viewer);
      const roleChange: Message = await observer.waitFor(m => m.a === 'op' && m.c === SF_PROJECT_PROFILES_COLLECTION);
      const start: number = observer.mark;

      // SUT
      await admin.request(
        env.createOp(QUESTIONS_COLLECTION, newQuestionId, 1, env.question(NEW_QUESTION_DATA_ID, ADMIN, 'Hidden?'))
      );
      await admin.request(
        env.answerOp(newQuestionId, 2, 1, ADMIN, env.question(NEW_QUESTION_DATA_ID, ADMIN, 'Hidden?'))
      );
      const received: Message[] = [...observer.since(start), ...(await observer.collectFor(QUIET_PERIOD_MS))];

      expect(query.insertedIds).toEqual([QUESTION_ID]);
      // Role changes still reach a member, so the client can follow them.
      expect(roleChange.op).toEqual([
        { p: ['userRoles', PT_OBSERVER], od: SFProjectRole.ParatextObserver, oi: SFProjectRole.Viewer }
      ]);
      expect(received.filter(m => m.a === 'q' && m.diff.some((d: Message) => d.type === 'insert'))).toEqual([]);
      expect(received.filter(m => m.a === 'op' && m.d === newQuestionId)).toEqual([]);
      expect(JSON.stringify(received)).not.toContain('Hidden?');
      expect(observer.isOpen).toBe(true);
      await env.stop();
    });
  });
});

/** The replies to the docs the client subscribes to when it opens a project. */
interface ProjectLoad {
  readonly profile: Message;
  readonly user: Message;
  readonly config: Message;
  readonly adminProfile: Message;
}

/** The replies to a page's query (two for a paged query, which also has a count query), and the docs it delivered. */
interface QueryOutcome {
  readonly replies: Message[];
  readonly insertedIds: string[];
}

/** The test environment with Scripture Forge's policies, and the messages the client sends for its pages. */
class FlowEnvironment extends TestEnvironment {
  constructor() {
    super({ sfPolicies: true });
  }

  /**
   * Subscribes to what the app loads when it opens a project: the project profile, the user's own user doc and
   * project config, and the profile of a user whose name it shows (the administrator, who asked the question).
   */
  async openProject(client: TestClient, userId: string): Promise<ProjectLoad> {
    return {
      profile: await client.request({ a: 's', c: SF_PROJECT_PROFILES_COLLECTION, d: PROJECT_ID, v: null }),
      user: await client.request({ a: 's', c: USERS_COLLECTION, d: userId, v: null }),
      config: await client.request({
        a: 's',
        c: SF_PROJECT_USER_CONFIGS_COLLECTION,
        d: `${PROJECT_ID}:${userId}`,
        v: null
      }),
      adminProfile: await client.request({ a: 's', c: USER_PROFILES_COLLECTION, d: ADMIN, v: null })
    };
  }

  /** The collection and query a page subscribes to, and for a paged query, its count query. */
  pageQuery(name: PageQuery, userId: string): { collection: string; query: JsonObject; countQuery?: JsonObject } {
    switch (name) {
      case 'questions':
        // Q1c, from the navigation menu's link to the checking page.
        return { collection: QUESTIONS_COLLECTION, query: { projectRef: PROJECT_ID, isArchived: false } };
      case 'chapterQuestions':
        // Q1a, the checking page of a chapter.
        return {
          collection: QUESTIONS_COLLECTION,
          query: {
            projectRef: PROJECT_ID,
            'verseRef.bookNum': 40,
            'verseRef.chapterNum': 1,
            isArchived: false,
            $sort: QUESTION_SORT
          }
        };
      case 'unansweredQuestion': {
        // Q3 and its count Q3c, the checking page's first question the user has not answered.
        const query: JsonObject = {
          projectRef: PROJECT_ID,
          isArchived: false,
          answers: { $not: { $elemMatch: { ownerRef: userId, deleted: false } } },
          $sort: QUESTION_SORT,
          $limit: 1
        };
        return {
          collection: QUESTIONS_COLLECTION,
          query: query,
          countQuery: { ...query, $count: { applySkipLimit: false } }
        };
      }
      case 'noteThreads':
        // N1, the editor's open note threads of a chapter.
        return {
          collection: NOTE_THREAD_COLLECTION,
          query: { projectRef: PROJECT_ID, status: 'todo', 'verseRef.bookNum': 40, 'verseRef.chapterNum': 1 }
        };
      case 'biblicalTermNoteThreads':
        // N2, the Biblical Terms panel's note threads.
        return { collection: NOTE_THREAD_COLLECTION, query: { projectRef: PROJECT_ID, biblicalTermId: { $ne: null } } };
      case 'biblicalTerms':
        // B1, the Biblical Terms of Matthew.
        return {
          collection: BIBLICAL_TERM_COLLECTION,
          query: { projectRef: PROJECT_ID, references: { $elemMatch: { $gte: 40_000_000, $lt: 41_000_000 } } }
        };
      case 'textAudio':
        // A1, the checking page's chapter audio.
        return { collection: TEXT_AUDIO_COLLECTION, query: { projectRef: PROJECT_ID } };
      case 'trainingData':
        // T1, the draft generation pages' training data.
        return { collection: TRAINING_DATA_COLLECTION, query: { projectRef: PROJECT_ID, deleted: false } };
    }
  }

  /**
   * Subscribes to a page's query as the client does on its first load, with no results cached: `o: {}` and `r: []`.
   * A paged query is followed by its count query, which has neither, with the next query id. The server sends the
   * results as query diffs before its reply.
   */
  async runPageQuery(client: TestClient, queryId: number, name: PageQuery, userId: string): Promise<QueryOutcome> {
    const start: number = client.mark;
    const { collection, query, countQuery } = this.pageQuery(name, userId);
    const replies: Message[] = [await client.request({ a: 'qs', id: queryId, c: collection, q: query, o: {}, r: [] })];
    if (countQuery != null) {
      replies.push(await client.request({ a: 'qs', id: queryId + 1, c: collection, q: countQuery }));
    }
    return { replies: replies, insertedIds: this.insertedIds(client, queryId, start) };
  }

  /** The ids of the docs that the diffs of a query inserted since `start`. */
  insertedIds(client: TestClient, queryId: number, start: number): string[] {
    const ids: string[] = [];
    for (const message of client.since(start)) {
      if (message.a !== 'q' || message.id !== queryId) {
        continue;
      }
      for (const diff of message.diff) {
        if (diff.type === 'insert') {
          ids.push(...diff.values.map((value: Message) => value.d));
        }
      }
    }
    return ids;
  }

  /** A create op as the client sends it for a doc it has not loaded. */
  createOp(collection: string, docId: string, seq: number, data: unknown): Message {
    return { a: 'op', c: collection, d: docId, v: null, seq: seq, x: {}, create: { type: JSON0_TYPE_URI, data: data } };
  }

  /** The op the checking page submits to add a user's answer to a question (CheckingComponent.saveAnswer). */
  answerOp(
    questionId: string,
    seq: number,
    version: number,
    userId: string,
    question: Question = this.question(QUESTION_DATA_ID, ADMIN, 'Whose genealogy is this?')
  ): Message {
    const op: unknown[] = new Json0OpBuilder<Question>(question).insert(
      q => q.answers,
      0,
      this.answer(ANSWER_DATA_ID, userId, 'An answer')
    ).op;
    return { a: 'op', c: QUESTIONS_COLLECTION, d: questionId, v: version, seq: seq, x: {}, op: op };
  }

  /** The create the editor submits for a new note thread on Matthew 1:1 (EditorComponent.saveNote). */
  createNoteThreadOp(seq: number, userId: string): Message {
    return this.createOp(
      NOTE_THREAD_COLLECTION,
      NEW_THREAD_ID,
      seq,
      this.noteThread({
        dataId: NEW_THREAD_DATA_ID,
        threadId: 'e0000000000000000000000b',
        noteDataId: 'f0000000000000000000000b',
        ownerRef: userId,
        publishedToSF: true
      })
    );
  }

  /**
   * The op the editor submits to add a note to a seeded thread (EditorComponent.saveNote): the note, and the thread's
   * status, which is left out because it is already the note's.
   */
  addNoteOp(threadDocId: string, seq: number, version: number, userId: string): Message {
    const threadId: string =
      threadDocId === PUBLISHED_THREAD_ID ? 'e00000000000000000000001' : 'e00000000000000000000002';
    const thread: NoteThread = this.noteThread({
      dataId: threadDocId.split(':')[1],
      threadId: threadId,
      noteDataId: threadDocId === PUBLISHED_THREAD_ID ? 'f00000000000000000000001' : 'f00000000000000000000002',
      ownerRef: ADMIN,
      publishedToSF: threadDocId === PUBLISHED_THREAD_ID
    });
    const note = this.note(ADDED_NOTE_DATA_ID, threadId, userId, 'A reply');
    const op: unknown[] = new Json0OpBuilder<NoteThread>(thread)
      .add(t => t.notes, note)
      .set(t => t.status, note.status).op;
    return { a: 'op', c: NOTE_THREAD_COLLECTION, d: threadDocId, v: version, seq: seq, x: {}, op: op };
  }

  /** The op the editor submits after adding a note, to mark it read (EditorComponent.updateNoteReadRefs). */
  markNoteReadOp(userId: string, seq: number, version: number): Message {
    const op: unknown[] = new Json0OpBuilder<SFProjectUserConfig>(this.userConfig(userId)).add<string>(
      c => c.noteRefsRead,
      ADDED_NOTE_DATA_ID
    ).op;
    return {
      a: 'op',
      c: SF_PROJECT_USER_CONFIGS_COLLECTION,
      d: `${PROJECT_ID}:${userId}`,
      v: version,
      seq: seq,
      x: {},
      op: op
    };
  }

  /** The presence the editor sends on a text's plain channel: who is viewing it (TextComponent). */
  viewerPresence(presenceId: string, presenceVersion: number, cursorColor: string): Message {
    return {
      a: 'p',
      ch: VIEWER_CHANNEL,
      id: presenceId,
      // The name and avatar the client sends are replaced with those of the user's own doc.
      p: { viewer: { displayName: 'Anyone', avatarUrl: '', cursorColor: cursorColor, activeInEditor: true } },
      pv: presenceVersion
    };
  }

  /** The presence the editor sends on a text's doc channel: the user's selection (TextComponent). */
  cursorPresence(presenceId: string, presenceVersion: number, docVersion: number, index: number): Message {
    return {
      a: 'p',
      ch: CURSOR_CHANNEL,
      id: presenceId,
      p: { index: index, length: 0 },
      pv: presenceVersion,
      c: TEXTS_COLLECTION,
      d: TEXT_ID,
      v: docVersion,
      t: RICH_TEXT_TYPE_URI
    };
  }

  /** The first presence another connection sent on a channel, since `start`. */
  presenceFrom(client: TestClient, src: string, channel: string, start: number): Promise<Message> {
    return client.waitFor(m => m.a === 'p' && m.ch === channel && m.src === src, start);
  }
}
