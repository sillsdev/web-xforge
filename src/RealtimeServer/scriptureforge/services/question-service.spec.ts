import ShareDB from 'sharedb';
import ShareDBMingo from 'sharedb-mingo-memory';
import { instance, mock } from 'ts-mockito';
import { User, USERS_COLLECTION } from '../../common/models/user';
import { createTestUser } from '../../common/models/user-test-data';
import { RealtimeServer } from '../../common/realtime-server';
import { SchemaVersionRepository } from '../../common/schema-version-repository';
import {
  allowAll,
  clientConnect,
  createDoc,
  fetchQuery,
  fetchDoc,
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
import { UserService } from '../../common/services/user-service';
import { SF_PROJECT_MIGRATIONS } from './sf-project-migrations';
import { SFProjectService } from './sf-project-service';
import { SF_PROJECT_USER_CONFIG_MIGRATIONS } from './sf-project-user-config-migrations';
import { SFProjectUserConfigService } from './sf-project-user-config-service';

// Answers that a client inserts must have hex ids to pass validation, which the other users' ids in the test data are
// not, as the test data is created by the server, which skips validation
const HEX_ID_CHECKER = 'c0ffee';

describe('QuestionService', () => {
  it('removes read refs when answer deleted', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'projectAdmin');
    await submitJson0Op<Question>(conn, QUESTIONS_COLLECTION, getQuestionDocId('project01', 'question01'), ops =>
      ops.remove(q => q.answers, 0)
    );
    await flushPromises();

    const adminProjectUserConfig = env.db.docs[SF_PROJECT_USER_CONFIGS_COLLECTION][
      getSFProjectUserConfigDocId('project01', 'projectAdmin')
    ].data as SFProjectUserConfig;
    expect(adminProjectUserConfig.answerRefsRead).not.toContain('answer01');
    expect(adminProjectUserConfig.commentRefsRead).not.toContain('comment01');
    const checkerProjectUserConfig = env.db.docs[SF_PROJECT_USER_CONFIGS_COLLECTION][
      getSFProjectUserConfigDocId('project01', 'checker')
    ].data as SFProjectUserConfig;
    expect(checkerProjectUserConfig.answerRefsRead).not.toContain('answer01');
    expect(checkerProjectUserConfig.commentRefsRead).not.toContain('comment01');
  });

  it('removes read refs of the deleted answer rather than of the answer the op claims to delete', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'checker');
    await submitOp(conn, QUESTIONS_COLLECTION, getQuestionDocId('project01', 'question01'), {
      p: ['answers', 0],
      ld: { dataId: 'answer02', ownerRef: 'checker', comments: [] }
    });
    await flushPromises();

    const adminProjectUserConfig = env.db.docs[SF_PROJECT_USER_CONFIGS_COLLECTION][
      getSFProjectUserConfigDocId('project01', 'projectAdmin')
    ].data as SFProjectUserConfig;
    expect(adminProjectUserConfig.answerRefsRead).not.toContain('answer01');
    expect(adminProjectUserConfig.commentRefsRead).not.toContain('comment01');
  });

  it('removes read refs when comment deleted', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'projectAdmin');
    await submitJson0Op<Question>(conn, QUESTIONS_COLLECTION, getQuestionDocId('project01', 'question01'), ops =>
      ops.remove(q => q.answers[0].comments, 0)
    );
    await flushPromises();

    const adminProjectUserConfig = env.db.docs[SF_PROJECT_USER_CONFIGS_COLLECTION][
      getSFProjectUserConfigDocId('project01', 'projectAdmin')
    ].data as SFProjectUserConfig;
    expect(adminProjectUserConfig.answerRefsRead).toContain('answer01');
    expect(adminProjectUserConfig.commentRefsRead).not.toContain('comment01');
    const checkerProjectUserConfig = env.db.docs[SF_PROJECT_USER_CONFIGS_COLLECTION][
      getSFProjectUserConfigDocId('project01', 'checker')
    ].data as SFProjectUserConfig;
    expect(checkerProjectUserConfig.answerRefsRead).toContain('answer01');
    expect(checkerProjectUserConfig.commentRefsRead).not.toContain('comment01');
  });

  it('does not allow user without edit right to replace question', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'checker');
    const docId: string = getQuestionDocId('project01', 'question01');
    const question: Question = (await fetchDoc(conn, QUESTIONS_COLLECTION, docId)).data;
    await expect(
      submitOp(conn, QUESTIONS_COLLECTION, docId, { p: [], od: question, oi: { ...question, text: 'Changed?' } })
    ).rejects.toThrow();
  });

  it('does not allow user to replace answer with a different owner', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'checker');
    const docId: string = getQuestionDocId('project01', 'question01');
    const question: Question = (await fetchDoc(conn, QUESTIONS_COLLECTION, docId)).data;
    const answer = question.answers[0];
    await expect(
      submitOp(conn, QUESTIONS_COLLECTION, docId, {
        p: ['answers', 0],
        ld: answer,
        // The test data's ids would fail validation in new data, so the replacement has valid ones
        li: { ...answer, dataId: 'aaaa', ownerRef: 'bbbb', comments: [] }
      })
    ).rejects.toThrow();
  });

  it('does not allow user without edit right to set answer status', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'checker');
    const docId: string = getQuestionDocId('project01', 'question01');
    await expect(
      submitOp(conn, QUESTIONS_COLLECTION, docId, { p: ['answers', 0, 'status'], oi: AnswerStatus.Resolved })
    ).rejects.toThrow();
  });

  it('allows project admin to set answer status', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'projectAdmin');
    const docId: string = getQuestionDocId('project01', 'question01');
    await expect(
      submitOp(conn, QUESTIONS_COLLECTION, docId, { p: ['answers', 0, 'status'], oi: AnswerStatus.Resolved })
    ).resolves.not.toThrow();
  });

  it('does not allow user to delete answer comment of another user by claiming it as theirs', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'checker');
    const docId: string = getQuestionDocId('project01', 'question01');
    await expect(
      submitOp(conn, QUESTIONS_COLLECTION, docId, { p: ['answers', 0, 'comments', 0], ld: { ownerRef: 'checker' } })
    ).rejects.toThrow();
  });

  it('does not allow user to delete answer that is not there', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'projectAdmin');
    await expect(
      submitOp(conn, QUESTIONS_COLLECTION, getQuestionDocId('project01', 'question01'), {
        p: ['answers', 5],
        ld: { dataId: 'answer01' }
      })
    ).rejects.toThrow('Permission denied');
  });

  it('does not allow user to edit answer of another user that an insert in the same op moved', async () => {
    const env = new TestEnvironment();
    await env.createData();
    await env.addHexIdChecker();

    const conn = clientConnect(env.server, HEX_ID_CHECKER);
    const docId: string = getQuestionDocId('project01', 'question01');
    await expect(
      submitOp(conn, QUESTIONS_COLLECTION, docId, [
        { p: ['answers', 0], li: env.createAnswer(HEX_ID_CHECKER) },
        { p: ['answers', 1, 'text'], od: 'Answer.', oi: 'Changed.' }
      ])
    ).rejects.toThrow();
  });

  it('allows user to edit answer that an earlier op inserted', async () => {
    const env = new TestEnvironment();
    await env.createData();
    await env.addHexIdChecker();

    const conn = clientConnect(env.server, HEX_ID_CHECKER);
    const docId: string = getQuestionDocId('project01', 'question01');
    await submitOp(conn, QUESTIONS_COLLECTION, docId, [
      { p: ['answers', 0], li: env.createAnswer(HEX_ID_CHECKER) },
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
    const conn = clientConnect(env.server, 'checker');
    await expect(
      submitOpData(env.server, conn, QUESTIONS_COLLECTION, getQuestionDocId('project01', 'question01'), {
        p: ['answers', 0],
        ld: {}
      })
    ).rejects.toThrow('Permission denied');
  });

  it('lets community checkers query questions', async () => {
    const env = new TestEnvironment();
    await env.createData();
    const conn = clientConnect(env.server, 'checker');

    const results = await fetchQuery(conn, QUESTIONS_COLLECTION, { projectRef: 'project01', isArchived: false });
    expect(results.map(d => d.id)).toEqual([getQuestionDocId('project01', 'question01')]);
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

  async addHexIdChecker(): Promise<void> {
    await submitJson0Op<SFProject>(this.server.connect(), SF_PROJECTS_COLLECTION, 'project01', op =>
      op.set<string>(p => p.userRoles[HEX_ID_CHECKER], SFProjectRole.CommunityChecker)
    );
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
    await createDoc<User>(conn, USERS_COLLECTION, 'projectAdmin', createTestUser({}, 1));

    await createDoc<SFProjectUserConfig>(
      conn,
      SF_PROJECT_USER_CONFIGS_COLLECTION,
      getSFProjectUserConfigDocId('project01', 'projectAdmin'),
      createTestProjectUserConfig({
        projectRef: 'project01',
        ownerRef: 'projectAdmin',
        questionRefsRead: ['question01'],
        answerRefsRead: ['answer01'],
        commentRefsRead: ['comment01']
      })
    );

    await createDoc<User>(conn, USERS_COLLECTION, 'checker', createTestUser({}, 2));

    await createDoc<SFProjectUserConfig>(
      conn,
      SF_PROJECT_USER_CONFIGS_COLLECTION,
      getSFProjectUserConfigDocId('project01', 'checker'),
      createTestProjectUserConfig({
        projectRef: 'project01',
        ownerRef: 'checker',
        questionRefsRead: ['question01'],
        answerRefsRead: ['answer01'],
        commentRefsRead: ['comment01']
      })
    );

    await createDoc<SFProject>(
      conn,
      SF_PROJECTS_COLLECTION,
      'project01',
      createTestProject({
        userRoles: {
          projectAdmin: SFProjectRole.ParatextAdministrator,
          checker: SFProjectRole.CommunityChecker
        },
        paratextUsers: [{ sfUserId: 'projectAdmin', username: 'ptprojectAdmin', opaqueUserId: 'opaqueprojectAdmin' }]
      })
    );

    await createDoc<Question>(conn, QUESTIONS_COLLECTION, getQuestionDocId('project01', 'question01'), {
      dataId: 'question01',
      projectRef: 'project01',
      ownerRef: 'projectAdmin',
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
          dataId: 'answer01',
          ownerRef: 'checker',
          text: 'Answer.',
          dateModified: '',
          dateCreated: '',
          deleted: false,
          likes: [],
          comments: [
            {
              dataId: 'comment01',
              ownerRef: 'projectAdmin',
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
