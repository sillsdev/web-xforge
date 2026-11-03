import ShareDB from 'sharedb';
import ShareDBMingo from 'sharedb-mingo-memory';
import { instance, mock } from 'ts-mockito';
import { User, USERS_COLLECTION } from '../../common/models/user';
import { createTestUser } from '../../common/models/user-test-data';
import { RealtimeServer } from '../../common/realtime-server';
import { SchemaVersionRepository } from '../../common/schema-version-repository';
import { UserService } from '../../common/services/user-service';
import {
  allowAll,
  clientConnect,
  createDoc,
  fetchDoc,
  fetchQuery,
  flushPromises,
  submitJson0Op,
  submitOp,
  submitOpData
} from '../../common/utils/test-utils';
import { Answer, AnswerStatus } from '../models/answer';
import { getQuestionDocId, Question, QUESTIONS_COLLECTION } from '../models/question';
import { SF_PROJECTS_COLLECTION, SFProject } from '../models/sf-project';
import { SFProjectRole } from '../models/sf-project-role';
import { createTestProject } from '../models/sf-project-test-data';
import {
  getSFProjectUserConfigDocId,
  SF_PROJECT_USER_CONFIGS_COLLECTION,
  SFProjectUserConfig
} from '../models/sf-project-user-config';
import { createTestProjectUserConfig } from '../models/sf-project-user-config-test-data';
import { QuestionService } from './question-service';
import { SF_PROJECT_MIGRATIONS } from './sf-project-migrations';
import { SFProjectService } from './sf-project-service';
import { SF_PROJECT_USER_CONFIG_MIGRATIONS } from './sf-project-user-config-migrations';
import { SFProjectUserConfigService } from './sf-project-user-config-service';

// Ids in the form that validation requires of new data
const PROJECT_ADMIN_ID = 'a1';
const CHECKER_ID = 'c1';
const OTHER_CHECKER_ID = 'c2';
const QUESTION_ID = 'd1';
const ANSWER_ID = 'd2';
const COMMENT_ID = 'd3';

describe('QuestionService', () => {
  it('removes read refs when answer deleted', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, PROJECT_ADMIN_ID);
    await submitJson0Op<Question>(conn, QUESTIONS_COLLECTION, getQuestionDocId('project01', QUESTION_ID), ops =>
      ops.remove(q => q.answers, 0)
    );
    await flushPromises();

    const adminProjectUserConfig = env.db.docs[SF_PROJECT_USER_CONFIGS_COLLECTION][
      getSFProjectUserConfigDocId('project01', PROJECT_ADMIN_ID)
    ].data as SFProjectUserConfig;
    expect(adminProjectUserConfig.answerRefsRead).not.toContain(ANSWER_ID);
    expect(adminProjectUserConfig.commentRefsRead).not.toContain(COMMENT_ID);
    const checkerProjectUserConfig = env.db.docs[SF_PROJECT_USER_CONFIGS_COLLECTION][
      getSFProjectUserConfigDocId('project01', CHECKER_ID)
    ].data as SFProjectUserConfig;
    expect(checkerProjectUserConfig.answerRefsRead).not.toContain(ANSWER_ID);
    expect(checkerProjectUserConfig.commentRefsRead).not.toContain(COMMENT_ID);
  });

  it('removes read refs of the deleted answer rather than of the answer the op claims to delete', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, CHECKER_ID);
    await submitOp(conn, QUESTIONS_COLLECTION, getQuestionDocId('project01', QUESTION_ID), {
      p: ['answers', 0],
      ld: { dataId: 'answer02', ownerRef: CHECKER_ID, comments: [] }
    });
    await flushPromises();

    const adminProjectUserConfig = env.db.docs[SF_PROJECT_USER_CONFIGS_COLLECTION][
      getSFProjectUserConfigDocId('project01', PROJECT_ADMIN_ID)
    ].data as SFProjectUserConfig;
    expect(adminProjectUserConfig.answerRefsRead).not.toContain(ANSWER_ID);
    expect(adminProjectUserConfig.commentRefsRead).not.toContain(COMMENT_ID);
  });

  it('removes read refs when comment deleted', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, PROJECT_ADMIN_ID);
    await submitJson0Op<Question>(conn, QUESTIONS_COLLECTION, getQuestionDocId('project01', QUESTION_ID), ops =>
      ops.remove(q => q.answers[0].comments, 0)
    );
    await flushPromises();

    const adminProjectUserConfig = env.db.docs[SF_PROJECT_USER_CONFIGS_COLLECTION][
      getSFProjectUserConfigDocId('project01', PROJECT_ADMIN_ID)
    ].data as SFProjectUserConfig;
    expect(adminProjectUserConfig.answerRefsRead).toContain(ANSWER_ID);
    expect(adminProjectUserConfig.commentRefsRead).not.toContain(COMMENT_ID);
    const checkerProjectUserConfig = env.db.docs[SF_PROJECT_USER_CONFIGS_COLLECTION][
      getSFProjectUserConfigDocId('project01', CHECKER_ID)
    ].data as SFProjectUserConfig;
    expect(checkerProjectUserConfig.answerRefsRead).toContain(ANSWER_ID);
    expect(checkerProjectUserConfig.commentRefsRead).not.toContain(COMMENT_ID);
  });

  it('does not allow user without edit right to replace question', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, CHECKER_ID);
    const docId: string = getQuestionDocId('project01', QUESTION_ID);
    const question: Question = (await fetchDoc(conn, QUESTIONS_COLLECTION, docId)).data;
    await expect(
      submitOp(conn, QUESTIONS_COLLECTION, docId, { p: [], od: question, oi: { ...question, text: 'Changed?' } })
    ).rejects.toThrow();
  });

  it('does not allow user to replace answer with a different owner', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, CHECKER_ID);
    const docId: string = getQuestionDocId('project01', QUESTION_ID);
    const question: Question = (await fetchDoc(conn, QUESTIONS_COLLECTION, docId)).data;
    const answer = question.answers[0];
    await expect(
      submitOp(conn, QUESTIONS_COLLECTION, docId, {
        p: ['answers', 0],
        ld: answer,
        li: { ...answer, ownerRef: PROJECT_ADMIN_ID }
      })
    ).rejects.toThrow('Permission denied');
  });

  it('does not allow user without edit right to set answer status', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, CHECKER_ID);
    const docId: string = getQuestionDocId('project01', QUESTION_ID);
    await expect(
      submitOp(conn, QUESTIONS_COLLECTION, docId, { p: ['answers', 0, 'status'], oi: AnswerStatus.Resolved })
    ).rejects.toThrow();
  });

  it('allows project admin to set answer status', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, PROJECT_ADMIN_ID);
    const docId: string = getQuestionDocId('project01', QUESTION_ID);
    await expect(
      submitOp(conn, QUESTIONS_COLLECTION, docId, { p: ['answers', 0, 'status'], oi: AnswerStatus.Resolved })
    ).resolves.not.toThrow();
  });

  it('does not allow user to delete answer comment of another user by claiming it as theirs', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, CHECKER_ID);
    const docId: string = getQuestionDocId('project01', QUESTION_ID);
    await expect(
      submitOp(conn, QUESTIONS_COLLECTION, docId, { p: ['answers', 0, 'comments', 0], ld: { ownerRef: CHECKER_ID } })
    ).rejects.toThrow();
  });

  it('does not allow user to delete answer that is not there', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, PROJECT_ADMIN_ID);
    await expect(
      submitOp(conn, QUESTIONS_COLLECTION, getQuestionDocId('project01', QUESTION_ID), {
        p: ['answers', 5],
        ld: { dataId: ANSWER_ID }
      })
    ).rejects.toThrow('Permission denied');
  });

  it('does not allow user to edit answer of another user that an insert in the same op moved', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, OTHER_CHECKER_ID);
    const docId: string = getQuestionDocId('project01', QUESTION_ID);
    await expect(
      submitOp(conn, QUESTIONS_COLLECTION, docId, [
        { p: ['answers', 0], li: env.createAnswer(OTHER_CHECKER_ID) },
        { p: ['answers', 1, 'text'], od: 'Answer.', oi: 'Changed.' }
      ])
    ).rejects.toThrow();
  });

  it('allows user to edit answer that an earlier op inserted', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, OTHER_CHECKER_ID);
    const docId: string = getQuestionDocId('project01', QUESTION_ID);
    await submitOp(conn, QUESTIONS_COLLECTION, docId, [
      { p: ['answers', 0], li: env.createAnswer(OTHER_CHECKER_ID) },
      { p: ['answers', 0, 'text'], od: 'New answer.', oi: 'Changed.' }
    ]);
    const question: Question = (await fetchDoc(env.server.connect(), QUESTIONS_COLLECTION, docId)).data;
    expect(question.answers.map(a => a.text)).toEqual(['Changed.', 'Answer.']);
  });

  it('does not allow user to submit an op that is not a list of components', async () => {
    const env = new TestEnvironment();
    await env.createData();

    // Unlike text audio, the question service examines ops before they are applied, which must not throw on this op
    // before it is denied
    const conn = clientConnect(env.server, CHECKER_ID);
    // An op must be a list of components, not a single component
    const singleComponent = { p: ['answers', 0], ld: {} };
    await expect(
      submitOpData(env.server, conn, QUESTIONS_COLLECTION, getQuestionDocId('project01', QUESTION_ID), singleComponent)
    ).rejects.toThrow('Permission denied');
  });

  it('allows user to like the answer of another user and to remove their like', async () => {
    const env = new TestEnvironment();
    await env.createData();

    // The answer belongs to CHECKER_ID, as a user does not like their own answer
    const conn = clientConnect(env.server, OTHER_CHECKER_ID);
    const docId: string = getQuestionDocId('project01', QUESTION_ID);
    await submitOp(conn, QUESTIONS_COLLECTION, docId, {
      p: ['answers', 0, 'likes', 0],
      li: { ownerRef: OTHER_CHECKER_ID }
    });
    const liked: Question = (await fetchDoc(env.server.connect(), QUESTIONS_COLLECTION, docId)).data;
    expect(liked.answers[0].likes.map(like => like.ownerRef)).toEqual([OTHER_CHECKER_ID]);

    await submitOp(conn, QUESTIONS_COLLECTION, docId, {
      p: ['answers', 0, 'likes', 0],
      ld: { ownerRef: OTHER_CHECKER_ID }
    });
    const unliked: Question = (await fetchDoc(env.server.connect(), QUESTIONS_COLLECTION, docId)).data;
    expect(unliked.answers[0].likes).toEqual([]);
  });

  it('fails a component with no path with the error from JSON0 rather than one of its own', async () => {
    const env = new TestEnvironment();
    await env.createData();

    // This service examines a client's ops before JSON0 checks them, so it is the first thing to read a path that is
    // not there. It leaves such an op alone, so that the submit goes on to fail where every malformed op fails,
    // which is JSON0 refusing to apply it.
    const conn = clientConnect(env.server, CHECKER_ID);
    const componentWithoutPath = [{ ld: {} }];
    await expect(
      submitOpData(
        env.server,
        conn,
        QUESTIONS_COLLECTION,
        getQuestionDocId('project01', QUESTION_ID),
        componentWithoutPath
      )
    ).rejects.toMatchObject({ code: 'ERR_OT_OP_NOT_APPLIED', message: 'Missing path' });
  });

  it('fails a component with no instruction with the error from JSON0 rather than one of its own', async () => {
    const env = new TestEnvironment();
    await env.createData();

    // A component that says nothing to change is one that JSON0 will refuse. This service would meet it first, as it
    // applies each component to the doc that it checks the following components against, so it must leave such an op alone.
    // The op needs a second component, because a component is only thusly applied when another one follows it.
    const conn = clientConnect(env.server, CHECKER_ID);
    const componentWithoutInstruction = [{ p: ['text'] }, { p: ['answers', 0], ld: {} }];
    await expect(
      submitOpData(
        env.server,
        conn,
        QUESTIONS_COLLECTION,
        getQuestionDocId('project01', QUESTION_ID),
        componentWithoutInstruction
      )
    ).rejects.toMatchObject({ code: 'ERR_OT_OP_NOT_APPLIED', message: 'invalid / missing instruction in op' });
  });

  it('lets community checkers query questions', async () => {
    const env = new TestEnvironment();
    await env.createData();
    const conn = clientConnect(env.server, CHECKER_ID);

    const results = await fetchQuery(conn, QUESTIONS_COLLECTION, { projectRef: 'project01', isArchived: false });
    expect(results.map(d => d.id)).toEqual([getQuestionDocId('project01', QUESTION_ID)]);
  });
});

class TestEnvironment {
  readonly service: QuestionService;
  readonly server: RealtimeServer;
  readonly db: ShareDBMingo;
  readonly mockedSchemaVersionRepository = mock(SchemaVersionRepository);

  constructor() {
    this.service = new QuestionService();
    const ShareDBMingoType = ShareDBMingo.extendMemoryDB(ShareDB.MemoryDB);
    this.db = new ShareDBMingoType();
    this.server = new RealtimeServer(
      'TEST',
      false,
      false,
      [
        this.service,
        new UserService(),
        new SFProjectService(SF_PROJECT_MIGRATIONS),
        new SFProjectUserConfigService(SF_PROJECT_USER_CONFIG_MIGRATIONS)
      ],
      SF_PROJECTS_COLLECTION,
      this.db,
      instance(this.mockedSchemaVersionRepository)
    );
    allowAll(this.server, USERS_COLLECTION);
    allowAll(this.server, SF_PROJECTS_COLLECTION);
    allowAll(this.server, SF_PROJECT_USER_CONFIGS_COLLECTION);
  }

  createAnswer(ownerRef: string): Answer {
    return {
      dataId: 'abcd',
      ownerRef,
      text: 'New answer.',
      dateModified: '',
      dateCreated: '',
      deleted: false,
      likes: [],
      comments: []
    };
  }

  async createData(): Promise<void> {
    const conn = this.server.connect();
    await createDoc<User>(conn, USERS_COLLECTION, PROJECT_ADMIN_ID, createTestUser({}, 1));

    await createDoc<SFProjectUserConfig>(
      conn,
      SF_PROJECT_USER_CONFIGS_COLLECTION,
      getSFProjectUserConfigDocId('project01', PROJECT_ADMIN_ID),
      createTestProjectUserConfig({
        projectRef: 'project01',
        ownerRef: PROJECT_ADMIN_ID,
        questionRefsRead: [QUESTION_ID],
        answerRefsRead: [ANSWER_ID],
        commentRefsRead: [COMMENT_ID]
      })
    );

    await createDoc<User>(conn, USERS_COLLECTION, CHECKER_ID, createTestUser({}, 2));

    await createDoc<SFProjectUserConfig>(
      conn,
      SF_PROJECT_USER_CONFIGS_COLLECTION,
      getSFProjectUserConfigDocId('project01', CHECKER_ID),
      createTestProjectUserConfig({
        projectRef: 'project01',
        ownerRef: CHECKER_ID,
        questionRefsRead: [QUESTION_ID],
        answerRefsRead: [ANSWER_ID],
        commentRefsRead: [COMMENT_ID]
      })
    );

    await createDoc<SFProject>(
      conn,
      SF_PROJECTS_COLLECTION,
      'project01',
      createTestProject({
        userRoles: {
          [PROJECT_ADMIN_ID]: SFProjectRole.ParatextAdministrator,
          [CHECKER_ID]: SFProjectRole.CommunityChecker,
          [OTHER_CHECKER_ID]: SFProjectRole.CommunityChecker
        },
        paratextUsers: [{ sfUserId: PROJECT_ADMIN_ID, username: 'ptprojectAdmin', opaqueUserId: 'opaqueprojectAdmin' }]
      })
    );

    await createDoc<Question>(conn, QUESTIONS_COLLECTION, getQuestionDocId('project01', QUESTION_ID), {
      dataId: QUESTION_ID,
      projectRef: 'project01',
      ownerRef: PROJECT_ADMIN_ID,
      verseRef: {
        bookNum: 40,
        chapterNum: 1,
        verseNum: 1
      },
      text: 'Question?',
      isArchived: false,
      dateModified: '',
      dateCreated: '',
      answers: [
        {
          dataId: ANSWER_ID,
          ownerRef: CHECKER_ID,
          text: 'Answer.',
          dateModified: '',
          dateCreated: '',
          deleted: false,
          likes: [],
          comments: [
            {
              dataId: COMMENT_ID,
              ownerRef: PROJECT_ADMIN_ID,
              text: 'Comment.',
              dateModified: '',
              dateCreated: '',
              deleted: false
            }
          ]
        }
      ]
    });
  }
}
