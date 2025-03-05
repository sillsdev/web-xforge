import { USJ_TYPE, USJ_VERSION } from '@biblionexus-foundation/scripture-utilities';
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
import { getTextDocId } from '../models/text-data';
import { TEXT_DOCUMENTS_COLLECTION, TextDocument } from '../models/text-document';
import { TextDocumentService } from './text-document-service';

describe('TextDocumentService', () => {
  it('allows member to view text documents', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'observer');
    await expect(fetchDoc(conn, TEXT_DOCUMENTS_COLLECTION, getTextDocId('project01', 40, 1))).resolves.not.toThrow();
  });

  it('allows translator to edit text documents', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'translator');
    await expect(
      submitJson0Op<TextDocument>(conn, TEXT_DOCUMENTS_COLLECTION, getTextDocId('project01', 40, 1), op =>
        op.insert(n => n.content, 0, {
          marker: 'c',
          number: '1',
          type: 'chapter'
        })
      )
    ).resolves.not.toThrow();
  });

  it('does not allow non-member to view text documents', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'nonmember');
    await expect(fetchDoc(conn, TEXT_DOCUMENTS_COLLECTION, getTextDocId('project01', 40, 1))).rejects.toThrow();
  });

  it('does not allow observer to edit text documents', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'observer');
    await expect(
      submitJson0Op<TextDocument>(conn, TEXT_DOCUMENTS_COLLECTION, getTextDocId('project01', 40, 1), op =>
        op.insert(n => n.content, 0, {
          marker: 'c',
          number: '1',
          type: 'chapter'
        })
      )
    ).rejects.toThrow();
  });

  it('writes the op source to the database', async () => {
    const env = new TestEnvironment();
    await env.createData();
    const conn = clientConnect(env.server, 'translator');
    const id: string = getTextDocId('project01', 40, 1);
    const source: string = 'history';
    await submitJson0Op<TextDocument>(
      conn,
      TEXT_DOCUMENTS_COLLECTION,
      id,
      op =>
        op.insert(n => n.content, 0, {
          marker: 'c',
          number: '1',
          type: 'chapter'
        }),
      source
    );
    await new Promise<void>(resolve => {
      env.db.getOps(TEXT_DOCUMENTS_COLLECTION, id, 1, null, { metadata: true }, (_, ops) => {
        expect(ops[0].m.source).toBe(source);
        resolve();
      });
    });
  });
});

class TestEnvironment {
  readonly service: TextDocumentService;
  readonly server: RealtimeServer;
  readonly db: ShareDBMingo;
  readonly mockedSchemaVersionRepository = mock(SchemaVersionRepository);

  constructor() {
    this.service = new TextDocumentService();
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

    await createDoc<TextDocument>(conn, TEXT_DOCUMENTS_COLLECTION, getTextDocId('project01', 40, 1), {
      type: USJ_TYPE,
      version: USJ_VERSION,
      content: []
    });
  }
}
