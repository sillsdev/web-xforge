import ShareDB from 'sharedb';
import ShareDBMingo from 'sharedb-mingo-memory';
import { instance, mock } from 'ts-mockito';
import { User, USERS_COLLECTION } from '../../common/models/user';
import { createTestUser } from '../../common/models/user-test-data';
import { RealtimeServer } from '../../common/realtime-server';
import { SchemaVersionRepository } from '../../common/schema-version-repository';
import { allowAll, clientConnect, createDoc, fetchDoc, submitJson0Op } from '../../common/utils/test-utils';
import { SF_PROJECTS_COLLECTION, SFProject } from '../models/sf-project';
import { SFProjectRole } from '../models/sf-project-role';
import { createTestProject } from '../models/sf-project-test-data';
import { getTrainingDataId, TRAINING_DATA_COLLECTION, TrainingData } from '../models/training-data';
import { TrainingDataService } from './training-data-service';

describe('TrainingDataService', () => {
  it('allows translator to view training data', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'translator');
    await expect(
      fetchDoc(conn, TRAINING_DATA_COLLECTION, getTrainingDataId('project01', 'dataid01'))
    ).resolves.not.toThrow();
  });

  it('allows administrator to edit training data', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'administrator');
    await expect(
      submitJson0Op<TrainingData>(conn, TRAINING_DATA_COLLECTION, getTrainingDataId('project01', 'dataid01'), op =>
        op.set<number>(n => n.skipRows, 1)
      )
    ).resolves.not.toThrow();
  });

  it('does not allow consultant to view training data', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'consultant');
    await expect(
      fetchDoc(conn, TRAINING_DATA_COLLECTION, getTrainingDataId('project01', 'dataid01'))
    ).rejects.toThrow();
  });
});

class TestEnvironment {
  readonly service: TrainingDataService;
  readonly server: RealtimeServer;
  readonly db: ShareDBMingo;
  readonly mockedSchemaVersionRepository = mock(SchemaVersionRepository);

  constructor() {
    this.service = new TrainingDataService();
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
  }

  async createData(): Promise<void> {
    const conn = this.server.connect();
    await createDoc<User>(conn, USERS_COLLECTION, 'administrator', createTestUser({}, 1));
    await createDoc<User>(conn, USERS_COLLECTION, 'translator', createTestUser({}, 2));
    await createDoc<User>(conn, USERS_COLLECTION, 'consultant', createTestUser({}, 3));

    await createDoc<SFProject>(
      conn,
      SF_PROJECTS_COLLECTION,
      'project01',
      createTestProject({
        userRoles: {
          administrator: SFProjectRole.ParatextAdministrator,
          translator: SFProjectRole.ParatextTranslator,
          consultant: SFProjectRole.ParatextConsultant
        }
      })
    );

    await createDoc<TrainingData>(conn, TRAINING_DATA_COLLECTION, getTrainingDataId('project01', 'dataid01'), {
      dataId: 'dataid01',
      projectRef: 'project01',
      ownerRef: 'user01',
      fileUrl: 'project01/user01_file01.csv?t=123456789123456789',
      mimeType: 'text/csv',
      skipRows: 0,
      title: 'Test File'
    });
  }
}
