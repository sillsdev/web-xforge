import { Doc, Op, RawOp } from 'sharedb/lib/client';
import { submitMigrationOp } from '../../common/realtime-server';
import { Migration, MigrationConstructor } from '../../common/migration';

class NoteThreadMigration1 implements Migration {
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

  migrateOp(_op: RawOp): void {
    // do nothing
  }
}

class NoteThreadMigration2 implements Migration {
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

  migrateOp(_op: RawOp): void {
    // do nothing
  }
}

class NoteThreadMigration3 implements Migration {
  static readonly VERSION = 3;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    if (doc.data.threadId != null) return;
    ops.push({ p: ['threadId'], oi: doc.data.dataId });

    await submitMigrationOp(NoteThreadMigration2.VERSION, doc, ops);
  }

  migrateOp(_op: RawOp): void {
    // do nothing
  }
}

class NoteThreadMigration4 implements Migration {
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

  migrateOp(_op: RawOp): void {
    // do nothing
  }
}

export const NOTE_THREAD_MIGRATIONS: MigrationConstructor[] = [
  NoteThreadMigration1,
  NoteThreadMigration2,
  NoteThreadMigration3,
  NoteThreadMigration4
];
