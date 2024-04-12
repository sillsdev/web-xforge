import { Doc, ObjectInsertOp } from 'sharedb/lib/client';
import { DocMigration, MigrationConstructor } from '../../common/migration';
import { submitMigrationOp } from '../../common/realtime-server';

class SFProjectUserConfigMigration1 extends DocMigration {
  static readonly VERSION = 1;

  async migrateDoc(doc: Doc): Promise<void> {
    if (doc.data.numSuggestions === undefined) {
      const op: ObjectInsertOp = { p: ['numSuggestions'], oi: 1 };
      await submitMigrationOp(SFProjectUserConfigMigration1.VERSION, doc, [op]);
    }
  }
}

class SFProjectUserConfigMigration2 extends DocMigration {
  static readonly VERSION = 2;

  async migrateDoc(doc: Doc): Promise<void> {
    if (doc.data.noteRefsRead === undefined) {
      const op: ObjectInsertOp = { p: ['noteRefsRead'], oi: [] };
      await submitMigrationOp(SFProjectUserConfigMigration1.VERSION, doc, [op]);
    }
  }
}

class SFProjectUserConfigMigration3 extends DocMigration {
  static readonly VERSION = 3;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: ObjectInsertOp[] = [];
    if (doc.data.biblicalTermsEnabled === undefined) {
      const op: ObjectInsertOp = { p: ['biblicalTermsEnabled'], oi: true };
      ops.push(op);
    }
    if (doc.data.transliterateBiblicalTerms === undefined) {
      const op: ObjectInsertOp = { p: ['transliterateBiblicalTerms'], oi: false };
      ops.push(op);
    }
    await submitMigrationOp(SFProjectUserConfigMigration3.VERSION, doc, ops);
  }
}

class SFProjectUserConfigMigration4 extends DocMigration {
  static readonly VERSION = 4;

  async migrateDoc(doc: Doc): Promise<void> {
    if (doc.data.audioRefsPlayed === undefined) {
      const op: ObjectInsertOp = { p: ['audioRefsPlayed'], oi: [] };
      await submitMigrationOp(SFProjectUserConfigMigration4.VERSION, doc, [op]);
    }
  }
}

class SFProjectUserConfigMigration5 extends DocMigration {
  static readonly VERSION = 5;

  async migrateDoc(doc: Doc): Promise<void> {
    if (doc.data.editorTabsOpen === undefined) {
      const op: ObjectInsertOp = { p: ['editorTabsOpen'], oi: [] };
      await submitMigrationOp(SFProjectUserConfigMigration5.VERSION, doc, [op]);
    }
  }
}

export const SF_PROJECT_USER_CONFIG_MIGRATIONS: MigrationConstructor[] = [
  SFProjectUserConfigMigration1,
  SFProjectUserConfigMigration2,
  SFProjectUserConfigMigration3,
  SFProjectUserConfigMigration4,
  SFProjectUserConfigMigration5
];
