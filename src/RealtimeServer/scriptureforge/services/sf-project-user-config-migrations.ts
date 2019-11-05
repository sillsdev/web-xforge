import { Doc, ObjectInsertOp, RawOp } from 'sharedb/lib/client';
import { Migration, MigrationConstructor } from '../../common/migration';
import { submitMigrationOp } from '../../common/realtime-server';

class SFProjectUserConfigMigration1 implements Migration {
  static readonly VERSION = 1;

  async migrateDoc(doc: Doc): Promise<void> {
    if (doc.data.numSuggestions === undefined) {
      const op: ObjectInsertOp = { p: ['numSuggestions'], oi: 1 };
      await submitMigrationOp(SFProjectUserConfigMigration1.VERSION, doc, [op]);
    }
  }

  migrateOp(_op: RawOp): void {
    // do nothing
  }
}

export const SF_PROJECT_USER_CONFIG_MIGRATIONS: MigrationConstructor[] = [SFProjectUserConfigMigration1];
