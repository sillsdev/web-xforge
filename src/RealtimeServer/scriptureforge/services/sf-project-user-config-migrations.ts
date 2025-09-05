import { Doc, ObjectDeleteOp, ObjectInsertOp } from 'sharedb/lib/client';
import { DocMigration, MigrationConstructor, monotonicallyIncreasingMigrationList } from '../../common/migration';
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
    const audioRefsPlayed: string[] | undefined = doc.data.audioRefsPlayed;
    if (audioRefsPlayed !== undefined) {
      const op: ObjectDeleteOp = { p: ['audioRefsPlayed'], od: audioRefsPlayed };
      await submitMigrationOp(SFProjectUserConfigMigration5.VERSION, doc, [op]);
    }
  }
}

class SFProjectUserConfigMigration6 extends DocMigration {
  static readonly VERSION = 6;

  async migrateDoc(doc: Doc): Promise<void> {
    if (doc.data.editorTabsOpen === undefined) {
      const op: ObjectInsertOp = { p: ['editorTabsOpen'], oi: [] };
      await submitMigrationOp(SFProjectUserConfigMigration6.VERSION, doc, [op]);
    }
  }
}

class SFProjectUserConfigMigration7 extends DocMigration {
  static readonly VERSION = 7;

  async migrateDoc(_: Doc): Promise<void> {
    // This migration has been removed.
    // The migration that was here added the Biblical Terms tab, and removed the setting from project-user-config.
    // This migration was run on QA but not live.
  }
}

class SFProjectUserConfigMigration8 extends DocMigration {
  static readonly VERSION = 8;

  async migrateDoc(doc: Doc): Promise<void> {
    if (doc.data.lynxInsightState === undefined) {
      const op: ObjectInsertOp = { p: ['lynxInsightState'], oi: {} };
      await submitMigrationOp(SFProjectUserConfigMigration8.VERSION, doc, [op]);
    }
  }
}

class SFProjectUserConfigMigration9 extends DocMigration {
  static readonly VERSION = 9;

  async migrateDoc(doc: Doc): Promise<void> {
    if (doc.data.lynxUserConfig === undefined) {
      const op: ObjectInsertOp = {
        p: ['lynxUserConfig'],
        oi: { assessmentsEnabled: true, autoCorrectionsEnabled: true }
      };
      await submitMigrationOp(SFProjectUserConfigMigration9.VERSION, doc, [op]);
    }
  }
}

export const SF_PROJECT_USER_CONFIG_MIGRATIONS: MigrationConstructor[] = monotonicallyIncreasingMigrationList([
  SFProjectUserConfigMigration1,
  SFProjectUserConfigMigration2,
  SFProjectUserConfigMigration3,
  SFProjectUserConfigMigration4,
  SFProjectUserConfigMigration5,
  SFProjectUserConfigMigration6,
  SFProjectUserConfigMigration7,
  SFProjectUserConfigMigration8,
  SFProjectUserConfigMigration9
]);
