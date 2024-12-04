import { Doc, Op } from 'sharedb/lib/client';
import { DocMigration, MigrationConstructor } from '../migration';
import { submitMigrationOp } from '../realtime-server';

class NotificationMigration1 extends DocMigration {
  static readonly VERSION = 1;
  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    if (doc.data.creationDate == null) {
      ops.push({ p: ['creationDate'], oi: new Date().toISOString() });
    }
    if (ops.length > 0) {
      await submitMigrationOp(NotificationMigration1.VERSION, doc, ops);
    }
  }
}

export const NOTIFICATION_MIGRATIONS: MigrationConstructor[] = [NotificationMigration1];
