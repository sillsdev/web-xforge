import ShareDB from 'sharedb';
import ShareDBMingo from 'sharedb-mingo-memory';
import { instance, mock, when } from 'ts-mockito';
import { MetadataDB } from '../../common/metadata-db';
import { RealtimeServer } from '../../common/realtime-server';
import { SchemaVersionRepository } from '../../common/schema-version-repository';
import { createDoc, fetchDoc } from '../../common/utils/test-utils';
import { QUESTIONS_COLLECTION } from '../models/question';
import { QuestionService } from './question-service';

describe('QuestionMigrations', () => {
  describe('version 1', () => {
    it('migrates docs', async () => {
      const env = new TestEnvironment(0);
      const conn = env.server.connect();
      await createDoc(conn, QUESTIONS_COLLECTION, 'question01', {
        answers: [{ deleted: true, comments: [{}, { deleted: true }] }, { comments: [{}, {}] }]
      });
      await createDoc(conn, QUESTIONS_COLLECTION, 'question02', {
        answers: []
      });
      await env.server.migrateIfNecessary();

      let questionDoc = await fetchDoc(conn, QUESTIONS_COLLECTION, 'question01');
      expect(questionDoc.data.answers[0].deleted).toBe(true);
      expect(questionDoc.data.answers[0].comments[0].deleted).toBe(false);
      expect(questionDoc.data.answers[0].comments[1].deleted).toBe(true);
      expect(questionDoc.data.answers[1].deleted).toBe(false);
      expect(questionDoc.data.answers[1].comments[0].deleted).toBe(false);
      expect(questionDoc.data.answers[1].comments[1].deleted).toBe(false);
      questionDoc = await fetchDoc(conn, QUESTIONS_COLLECTION, 'question02');
      expect(questionDoc.data.answers.length).toBe(0);
    });
  });
});

class TestEnvironment {
  readonly db: ShareDBMingo;
  readonly mockedSchemaVersionRepository = mock(SchemaVersionRepository);
  readonly server: RealtimeServer;

  /**
   * @param version The version the document is currently at (so migrations prior to this version will not be run
   * on the document)
   */
  constructor(version: number) {
    const ShareDBMingoType = MetadataDB(ShareDBMingo.extendMemoryDB(ShareDB.MemoryDB));
    this.db = new ShareDBMingoType();
    when(this.mockedSchemaVersionRepository.getAll()).thenResolve([
      { _id: QUESTIONS_COLLECTION, collection: QUESTIONS_COLLECTION, version }
    ]);
    this.server = new RealtimeServer(
      'TEST',
      false,
      false,
      [new QuestionService()],
      QUESTIONS_COLLECTION,
      this.db,
      instance(this.mockedSchemaVersionRepository)
    );
  }
}
