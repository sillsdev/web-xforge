import { Doc, Op, RawOp } from 'sharedb/lib/client';
import { submitMigrationOp } from '../../common/realtime-server';
import { Migration, MigrationConstructor } from '../../common/migration';

class NoteThreadMigration1 implements Migration {
  static readonly VERSION = 1;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    if (doc.data.tagIcon != null) {
      ops.push({ p: ['tagIcon'], od: true });
    }

    if (ops.length > 0) {
      await submitMigrationOp(NoteThreadMigration1.VERSION, doc, ops);
    }
  }

  migrateOp(_op: RawOp): void {
    // do nothing
  }
}

export const NOTE_THREAD_MIGRATIONS: MigrationConstructor[] = [NoteThreadMigration1];
