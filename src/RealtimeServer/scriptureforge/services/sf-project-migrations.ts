import { Doc, Op, RawOp } from 'sharedb/lib/client';
import { Migration, MigrationConstructor } from '../../common/migration';
import { submitMigrationOp } from '../../common/realtime-server';

class SFProjectMigration1 implements Migration {
  static readonly VERSION = 1;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    for (let i = 0; i < doc.data.texts.length; i++) {
      for (let j = 0; j < doc.data.texts[i].chapters.length; j++) {
        const chapter = doc.data.texts[i].chapters[j];
        if (chapter.isValid === undefined) {
          ops.push({ p: ['texts', i, 'chapters', j, 'isValid'], oi: true });
        }
      }
    }
    if (ops.length > 0) {
      await submitMigrationOp(SFProjectMigration1.VERSION, doc, ops);
    }
  }

  migrateOp(_op: RawOp): void {
    // do nothing
  }
}

export const SF_PROJECT_MIGRATIONS: MigrationConstructor[] = [SFProjectMigration1];
