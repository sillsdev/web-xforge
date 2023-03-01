import ShareDB from 'sharedb';
import ShareDBMingo from 'sharedb-mingo-memory';
import { instance, mock, when } from 'ts-mockito';
import { Doc } from 'sharedb/lib/client';
import { RealtimeServer } from '../../common/realtime-server';
import { SchemaVersionRepository } from '../../common/schema-version-repository';
import { MetadataDB } from '../../common/metadata-db';
import { createDoc, fetchDoc } from '../../common/utils/test-utils';
import { NOTE_THREAD_COLLECTION } from '../models/note-thread';
import { NoteThreadService } from './note-thread-service';

describe('NoteThreadMigrations', () => {
  describe('version 1', () => {
    it('removes note thread icon', async () => {
      const env = new TestEnvironment(0);
      const conn = env.server.connect();
      await createDoc(conn, NOTE_THREAD_COLLECTION, 'project01:thread01', {
        threadId: 'thread01',
        tagIcon: '01flag1'
      });

      await env.server.migrateIfNecessary();
      const doc: Doc = await fetchDoc(conn, NOTE_THREAD_COLLECTION, 'project01:thread01');
      expect(doc.data.tagIcon).toBeUndefined();
    });
  });

  describe('version 2', () => {
    it('removes ext user and tag icon property', async () => {
      const env = new TestEnvironment(1);
      const conn = env.server.connect();
      await createDoc(conn, NOTE_THREAD_COLLECTION, 'project01:thread01', {
        threadId: 'thread01',
        notes: [{ threadId: 'thread01', tagIcon: '01flag1', extUserId: 'user02' }]
      });

      await env.server.migrateIfNecessary();
      const doc: Doc = await fetchDoc(conn, NOTE_THREAD_COLLECTION, 'project01:thread01');
      expect(doc.data.notes[0].extUserId).toBeUndefined();
      expect(doc.data.notes[0].tagIcon).toBeUndefined();
    });
  });
});

class TestEnvironment {
  readonly db: ShareDBMingo;
  readonly mockedSchemaVersionRepository = mock(SchemaVersionRepository);
  readonly server: RealtimeServer;

  constructor(version: number) {
    const ShareDBMingoType = MetadataDB(ShareDBMingo.extendMemoryDB(ShareDB.MemoryDB));
    this.db = new ShareDBMingoType();
    when(this.mockedSchemaVersionRepository.getAll()).thenResolve([
      { _id: NOTE_THREAD_COLLECTION, collection: NOTE_THREAD_COLLECTION, version }
    ]);
    this.server = new RealtimeServer(
      'TEST',
      false,
      [new NoteThreadService()],
      NOTE_THREAD_COLLECTION,
      this.db,
      instance(this.mockedSchemaVersionRepository)
    );
  }
}
