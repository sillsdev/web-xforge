import { Doc, Op, RawOp } from 'sharedb/lib/client';
import { submitMigrationOp } from '../../common/realtime-server';
import { Migration, MigrationConstructor } from '../migration';

class UserMigration1 implements Migration {
  static readonly VERSION = 1;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    for (const key in doc.data.sites) {
      if (doc.data.sites[key].resources === undefined) {
        const resources: string[] = [];
        ops.push({ p: ['sites', key, 'resources'], oi: resources });
      }
    }
    if (ops.length > 0) {
      await submitMigrationOp(UserMigration1.VERSION, doc, ops);
    }
  }

  migrateOp(_op: RawOp): void {
    // do nothing
  }
}

export const USER_MIGRATIONS: MigrationConstructor[] = [UserMigration1];
