import * as RichText from 'rich-text';
import { Delta } from 'rich-text';
import ShareDB from 'sharedb';
import ShareDBMingo from 'sharedb-mingo-memory';
import { instance, mock } from 'ts-mockito';
import { User, USERS_COLLECTION } from '../../common/models/user';
import { createTestUser } from '../../common/models/user-test-data';
import { RealtimeServer } from '../../common/realtime-server';
import { SchemaVersionRepository } from '../../common/schema-version-repository';
import { allowAll, clientConnect, createDoc, fetchDoc, submitOp } from '../../common/utils/test-utils';
import { SF_PROJECTS_COLLECTION, SFProject } from '../models/sf-project';
import { SFProjectRole } from '../models/sf-project-role';
import { createTestProject } from '../models/sf-project-test-data';
import { getTextDocId, TextData, TEXTS_COLLECTION } from '../models/text-data';
import { TextService } from './text-service';

ShareDB.types.register(RichText.type);

describe('TextService', () => {
  it('allows member to view text', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'observer');
    await expect(fetchDoc(conn, TEXTS_COLLECTION, getTextDocId('project01', 40, 1))).resolves.not.toThrow();
  });

  it('allows translator to edit text', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'translator');
    await expect(
      submitOp(conn, TEXTS_COLLECTION, getTextDocId('project01', 40, 1), new Delta())
    ).resolves.not.toThrow();
  });

  it('does not allow non-member to view text', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'nonmember');
    await expect(fetchDoc(conn, TEXTS_COLLECTION, getTextDocId('project01', 40, 1))).rejects.toThrow();
  });

  it('does not allow observer to edit text', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'observer');
    await expect(submitOp(conn, TEXTS_COLLECTION, getTextDocId('project01', 40, 1), new Delta())).rejects.toThrow();
  });

  it('writes the op source to the database', async () => {
    const env = new TestEnvironment();
    await env.createData();
    const conn = clientConnect(env.server, 'translator');
    const id: string = getTextDocId('project01', 40, 1);
    const source: string = 'history';
    await submitOp(conn, TEXTS_COLLECTION, id, new Delta(), source);
    await new Promise<void>(resolve => {
      env.db.getOps(TEXTS_COLLECTION, id, 1, null, { metadata: true }, (_, ops) => {
        expect(ops[0].m.source).toBe(source);
        resolve();
      });
    });
  });
});

class TestEnvironment {
  readonly service: TextService;
  readonly server: RealtimeServer;
  readonly db: ShareDBMingo;
  readonly mockedSchemaVersionRepository = mock(SchemaVersionRepository);

  constructor() {
    this.service = new TextService();
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
    await createDoc<User>(conn, USERS_COLLECTION, 'translator', createTestUser({}, 1));
    await createDoc<User>(conn, USERS_COLLECTION, 'observer', createTestUser({}, 2));
    await createDoc<User>(conn, USERS_COLLECTION, 'nonmember', createTestUser({}, 3));

    await createDoc<SFProject>(
      conn,
      SF_PROJECTS_COLLECTION,
      'project01',
      createTestProject({
        userRoles: {
          translator: SFProjectRole.ParatextTranslator,
          observer: SFProjectRole.ParatextObserver
        },
        paratextUsers: [{ sfUserId: 'translator', username: 'pttranslator', opaqueUserId: 'opaquetranslator' }]
      })
    );

    await createDoc<TextData>(conn, TEXTS_COLLECTION, getTextDocId('project01', 40, 1), new Delta(), 'rich-text');
  }
}
