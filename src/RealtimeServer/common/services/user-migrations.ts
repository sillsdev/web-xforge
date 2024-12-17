import { Doc, Op } from 'sharedb/lib/client';
import { submitMigrationOp } from '../../common/realtime-server';
import { DocMigration, MigrationConstructor, monotonicallyIncreasingMigrationList } from '../migration';

class UserMigration1 extends DocMigration {
  static readonly VERSION = 1;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    if (doc.data.roles == null) {
      if (doc.data.role != null) {
        ops.push({ p: ['role'], od: doc.data.role });
        ops.push({ p: ['roles'], oi: [doc.data.role] });
      } else {
        ops.push({ p: ['roles'], oi: [] });
      }
    }
    if (ops.length > 0) {
      await submitMigrationOp(UserMigration1.VERSION, doc, ops);
    }
  }
}

export const USER_MIGRATIONS: MigrationConstructor[] = monotonicallyIncreasingMigrationList([UserMigration1]);
