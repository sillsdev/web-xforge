import { Doc, ListInsertOp, ObjectDeleteOp, ObjectInsertOp, Op } from 'sharedb/lib/client';
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

  async migrateDoc(doc: Doc): Promise<void> {
    const biblicalTermsEnabled: boolean | undefined = doc.data.biblicalTermsEnabled;
    if (biblicalTermsEnabled !== undefined) {
      const ops: Op[] = [];
      if (biblicalTermsEnabled) {
        // Determine whether to show the biblical terms tab in the source or target
        let createTab: boolean = true;
        let groupId: string = 'target';
        for (const editorTab of doc.data.editorTabsOpen) {
          // If a tab is in the source, we can show the tab in the source
          if (editorTab.groupId === 'source') {
            groupId = 'source';
          }

          // If we already have a biblical terms tab, do not recreate it
          if (editorTab.tabType === 'biblical-terms') {
            createTab = false;
          }
        }

        // Add a biblical terms tab
        if (createTab) {
          const i: number = doc.data.editorTabsOpen.length;
          const liOp: ListInsertOp = {
            p: ['editorTabsOpen', i],
            li: {
              tabType: 'biblical-terms',
              groupId,
              isSelected: false
            }
          };
          ops.push(liOp);
        }
      }

      // Remove the old biblical terms enabled property
      const odOp: ObjectDeleteOp = { p: ['biblicalTermsEnabled'], od: biblicalTermsEnabled };
      ops.push(odOp);
      await submitMigrationOp(SFProjectUserConfigMigration7.VERSION, doc, ops);
    }
  }
}

export const SF_PROJECT_USER_CONFIG_MIGRATIONS: MigrationConstructor[] = [
  SFProjectUserConfigMigration1,
  SFProjectUserConfigMigration2,
  SFProjectUserConfigMigration3,
  SFProjectUserConfigMigration4,
  SFProjectUserConfigMigration5,
  SFProjectUserConfigMigration6,
  SFProjectUserConfigMigration7
];
