import { Doc, Op } from 'sharedb/lib/client';
import { DocMigration, MigrationConstructor, monotonicallyIncreasingMigrationList } from '../../common/migration';
import { submitMigrationOp } from '../../common/realtime-server';

class QuestionMigration1 extends DocMigration {
  static readonly VERSION = 1;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    for (let i = 0; i < doc.data.answers.length; i++) {
      if (doc.data.answers[i].deleted == null) {
        ops.push({ p: ['answers', i, 'deleted'], oi: false });
      }
      for (let j = 0; j < doc.data.answers[i].comments.length; j++) {
        if (doc.data.answers[i].comments[j].deleted == null) {
          ops.push({ p: ['answers', i, 'comments', j, 'deleted'], oi: false });
        }
      }
    }

    if (ops.length > 0) {
      await submitMigrationOp(QuestionMigration1.VERSION, doc, ops);
    }
  }
}

export const QUESTION_MIGRATIONS: MigrationConstructor[] = monotonicallyIncreasingMigrationList([QuestionMigration1]);
