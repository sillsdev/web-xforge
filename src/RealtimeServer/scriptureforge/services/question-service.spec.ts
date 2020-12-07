import ShareDB = require('sharedb');
import ShareDBMingo = require('sharedb-mingo-memory');
import { instance, mock } from 'ts-mockito';
import { SystemRole } from '../../common/models/system-role';
import { User, USERS_COLLECTION } from '../../common/models/user';
import { RealtimeServer } from '../../common/realtime-server';
import { SchemaVersionRepository } from '../../common/schema-version-repository';
import { allowAll, clientConnect, createDoc, flushPromises, submitJson0Op } from '../../common/utils/test-utils';
import { CheckingShareLevel } from '../models/checking-config';
import { getQuestionDocId, Question, QUESTIONS_COLLECTION } from '../models/question';
import { SF_PROJECTS_COLLECTION, SFProject } from '../models/sf-project';
import { SFProjectRole } from '../models/sf-project-role';
import {
  getSFProjectUserConfigDocId,
  SF_PROJECT_USER_CONFIGS_COLLECTION,
  SFProjectUserConfig
} from '../models/sf-project-user-config';
import { QuestionService } from './question-service';

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
      [this.service],
      SF_PROJECTS_COLLECTION,
      this.db,
      instance(this.mockedSchemaVersionRepository)
    );
    allowAll(this.server, USERS_COLLECTION);
    allowAll(this.server, SF_PROJECTS_COLLECTION);
    allowAll(this.server, SF_PROJECT_USER_CONFIGS_COLLECTION);
  }

  async createData(): Promise<void> {
    const conn = this.server.connect();
    await createDoc<User>(conn, USERS_COLLECTION, 'projectAdmin', {
      name: 'User 01',
      email: 'user01@example.com',
      role: SystemRole.User,
      isDisplayNameConfirmed: true,
      authId: 'auth01',
      displayName: 'User 01',
      avatarUrl: '',
      sites: {}
    });

    await createDoc<SFProjectUserConfig>(
      conn,
      SF_PROJECT_USER_CONFIGS_COLLECTION,
      getSFProjectUserConfigDocId('project01', 'projectAdmin'),
      {
        projectRef: 'project01',
        ownerRef: 'projectAdmin',
        isTargetTextRight: false,
        confidenceThreshold: 0.2,
        translationSuggestionsEnabled: true,
        numSuggestions: 1,
        selectedSegment: '',
        questionRefsRead: ['question01'],
        answerRefsRead: ['answer01'],
        commentRefsRead: ['comment01']
      }
    );

    await createDoc<User>(conn, USERS_COLLECTION, 'checker', {
      name: 'User 02',
      email: 'user02@example.com',
      role: SystemRole.User,
      isDisplayNameConfirmed: true,
      authId: 'auth02',
      displayName: 'User 02',
      avatarUrl: '',
      sites: {}
    });

    await createDoc<SFProjectUserConfig>(
      conn,
      SF_PROJECT_USER_CONFIGS_COLLECTION,
      getSFProjectUserConfigDocId('project01', 'checker'),
      {
        projectRef: 'project01',
        ownerRef: 'checker',
        isTargetTextRight: false,
        confidenceThreshold: 0.2,
        translationSuggestionsEnabled: true,
        numSuggestions: 1,
        selectedSegment: '',
        questionRefsRead: ['question01'],
        answerRefsRead: ['answer01'],
        commentRefsRead: ['comment01']
      }
    );

    await createDoc<SFProject>(conn, SF_PROJECTS_COLLECTION, 'project01', {
      name: 'Project 01',
      shortName: 'PT01',
      paratextId: 'pt01',
      writingSystem: { tag: 'qaa' },
      translateConfig: { translationSuggestionsEnabled: false },
      checkingConfig: {
        checkingEnabled: false,
        usersSeeEachOthersResponses: true,
        shareEnabled: true,
        shareLevel: CheckingShareLevel.Specific
      },
      texts: [],
      sync: { queuedCount: 0 },
      userRoles: {
        projectAdmin: SFProjectRole.ParatextAdministrator,
        checker: SFProjectRole.CommunityChecker
      }
    });

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
          likes: [],
          comments: [
            {
              dataId: 'comment01',
              ownerRef: 'projectAdmin',
              text: 'Comment.',
              dateModified: '',
              dateCreated: ''
            }
          ]
        }
      ]
    });
  }
}
