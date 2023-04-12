import { Doc, Op, RawOp } from 'sharedb/lib/client';
import { submitMigrationOp } from '../../common/realtime-server';
import { Migration, MigrationConstructor } from '../../common/migration';

class QuestionMigration1 implements Migration {
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

  migrateOp(_op: RawOp): void {
    // do nothing
  }
}

export const QUESTION_MIGRATIONS: MigrationConstructor[] = [QuestionMigration1];
