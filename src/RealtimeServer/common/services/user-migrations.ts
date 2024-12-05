import { Doc, Op } from 'sharedb/lib/client';
import { submitMigrationOp } from '../../common/realtime-server';
import { DocMigration, MigrationConstructor } from '../migration';

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

class UserMigration2 extends DocMigration {
  static readonly VERSION = 2;
  async migrateDoc(doc: Doc): Promise<void> {
    if (doc.data.viewedNotifications === undefined) {
      const ops: Op[] = [{ p: ['viewedNotifications'], oi: {} }];
      await submitMigrationOp(UserMigration2.VERSION, doc, ops);
    }
  }
}

export const USER_MIGRATIONS: MigrationConstructor[] = [UserMigration1, UserMigration2];
