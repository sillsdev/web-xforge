import { VerseRef } from '@sillsdev/scripture';
import ShareDB from 'sharedb';
import ShareDBMingo from 'sharedb-mingo-memory';
import { Connection } from 'sharedb/lib/client';
import { instance, mock } from 'ts-mockito';
import { User, USERS_COLLECTION } from '../../common/models/user';
import { createTestUser } from '../../common/models/user-test-data';
import { RealtimeServer } from '../../common/realtime-server';
import { SchemaVersionRepository } from '../../common/schema-version-repository';
import { allowAll, clientConnect, createDoc, fetchDoc, submitJson0Op } from '../../common/utils/test-utils';
import { BIBLICAL_TERM_COLLECTION, BiblicalTerm, getBiblicalTermDocId } from '../models/biblical-term';
import { SF_PROJECTS_COLLECTION, SFProjectProfile } from '../models/sf-project';
import { SFProjectRole } from '../models/sf-project-role';
import { createTestProjectProfile } from '../models/sf-project-test-data';
import {
  getSFProjectUserConfigDocId,
  SF_PROJECT_USER_CONFIGS_COLLECTION,
  SFProjectUserConfig
} from '../models/sf-project-user-config';
import { createTestProjectUserConfig } from '../models/sf-project-user-config-test-data';
import { BiblicalTermService } from './biblical-term-service';

describe('BiblicalTermService', () => {
  it('the model builds an id as expected', () => {
    expect(getBiblicalTermDocId('myProjectId', 'myDataId')).toEqual('myProjectId:myDataId');
  });

  it('allows user to read biblical term', async () => {
    const env = new TestEnvironment();
    await env.createData();
    const conn: Connection = clientConnect(env.server, env.projectAdminId);
    const doc = await fetchDoc(conn, BIBLICAL_TERM_COLLECTION, getBiblicalTermDocId('project01', 'biblicalTerm01'));
    expect(doc).not.toBeNull();
  });

  it('allows user to edit biblical term', async () => {
    const env = new TestEnvironment();
    await env.createData();
    const conn: Connection = clientConnect(env.server, env.projectAdminId);
    const docId = getBiblicalTermDocId('project01', 'biblicalTerm01');
    const doc = await fetchDoc(conn, BIBLICAL_TERM_COLLECTION, docId);
    expect(doc).not.toBeNull();

    const content = 'edited content';
    await submitJson0Op<BiblicalTerm>(conn, BIBLICAL_TERM_COLLECTION, docId, op =>
      op.set(b => b.description, content.toString())
    );
    expect(doc.data.description).toEqual('edited content');
  });
});

class TestEnvironment {
  readonly projectAdminId = 'projectAdmin';
  readonly service: BiblicalTermService;
  readonly server: RealtimeServer;
  readonly db: ShareDBMingo;
  readonly mockedSchemaVersionRepository = mock(SchemaVersionRepository);

  constructor() {
    this.service = new BiblicalTermService();
    const ShareDBMingoType = ShareDBMingo.extendMemoryDB(ShareDB.MemoryDB);
    this.db = new ShareDBMingoType();
    this.server = new RealtimeServer(
      'TEST',
      false,
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
    await createDoc<User>(conn, USERS_COLLECTION, this.projectAdminId, createTestUser());

    await createDoc<SFProjectUserConfig>(
      conn,
      SF_PROJECT_USER_CONFIGS_COLLECTION,
      getSFProjectUserConfigDocId('project01', this.projectAdminId),
      createTestProjectUserConfig({
        projectRef: 'project01',
        ownerRef: this.projectAdminId,
        questionRefsRead: ['question01'],
        answerRefsRead: ['answer01'],
        commentRefsRead: ['comment01']
      })
    );

    await createDoc<SFProjectProfile>(
      conn,
      SF_PROJECTS_COLLECTION,
      'project01',
      createTestProjectProfile({
        userRoles: {
          projectAdmin: SFProjectRole.ParatextAdministrator,
          checker: SFProjectRole.CommunityChecker,
          commenter: SFProjectRole.Commenter
        }
      })
    );

    await createDoc<BiblicalTerm>(conn, BIBLICAL_TERM_COLLECTION, getBiblicalTermDocId('project01', 'biblicalTerm01'), {
      projectRef: 'project01',
      ownerRef: 'some-owner',
      dataId: 'biblicalTerm01',
      termId: 'δοῦλος-1',
      transliteration: 'doulos-1',
      renderings: ['bondservant', 'slave'],
      description: '',
      language: 'greek',
      links: ['realia:3.21.4'],
      references: [new VerseRef(40, 1, 1).BBBCCCVVV],
      definitions: {
        en: {
          categories: ['beings'],
          domains: ['people', 'authority', 'control', 'serve'],
          gloss: 'slave; servant',
          notes: 'one who is a slave in the sense of becoming the property of an owner'
        }
      }
    });
  }
}
