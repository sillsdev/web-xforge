import { Doc, Op } from 'sharedb/lib/client';
import { DocMigration, MigrationConstructor, monotonicallyIncreasingMigrationList } from '../../common/migration';
import { submitMigrationOp } from '../../common/realtime-server';

class NoteThreadMigration1 extends DocMigration {
  static readonly VERSION = 1;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    const tagIcon: string | undefined = doc.data.tagIcon;
    if (tagIcon != null) {
      ops.push({ p: ['tagIcon'], od: tagIcon });
    }

    if (ops.length > 0) {
      await submitMigrationOp(NoteThreadMigration1.VERSION, doc, ops);
    }
  }
}

class NoteThreadMigration2 extends DocMigration {
  static readonly VERSION = 2;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    if (doc.data.notes == null) return;
    for (let i = 0; i < doc.data.notes.length; i++) {
      const extUserId: string | undefined = doc.data.notes[i].extUserId;
      if (extUserId != null) {
        ops.push({ p: ['notes', i, 'extUserId'], od: extUserId });
      }
      const tagIcon: string | undefined = doc.data.notes[i].tagIcon;
      if (tagIcon != null) {
        ops.push({ p: ['notes', i, 'tagIcon'], od: tagIcon });
      }
    }

    if (ops.length > 0) {
      await submitMigrationOp(NoteThreadMigration2.VERSION, doc, ops);
    }
  }
}

class NoteThreadMigration3 extends DocMigration {
  static readonly VERSION = 3;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    if (doc.data.threadId != null) return;
    ops.push({ p: ['threadId'], oi: doc.data.dataId });

    await submitMigrationOp(NoteThreadMigration2.VERSION, doc, ops);
  }
}

class NoteThreadMigration4 extends DocMigration {
  static readonly VERSION = 4;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    const dataId: string | undefined = doc.data.dataId;
    if (dataId != null && dataId.substring(0, 3) === 'BT_' && doc.data.biblicalTermId == null) {
      ops.push({ p: ['biblicalTermId'], oi: dataId.substring(3) });
    }

    if (ops.length > 0) {
      await submitMigrationOp(NoteThreadMigration3.VERSION, doc, ops);
    }
  }
}

export const NOTE_THREAD_MIGRATIONS: MigrationConstructor[] = monotonicallyIncreasingMigrationList([
  NoteThreadMigration1,
  NoteThreadMigration2,
  NoteThreadMigration3,
  NoteThreadMigration4
]);
