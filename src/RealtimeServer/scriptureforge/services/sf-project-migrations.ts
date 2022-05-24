import { Doc, Op, RawOp } from 'sharedb/lib/client';
import { Migration, MigrationConstructor } from '../../common/migration';
import { submitMigrationOp } from '../../common/realtime-server';
import { SFProjectRole } from '../models/sf-project-role';
import { TextInfoPermission } from '../models/text-info-permission';
import { TranslateShareLevel } from '../models/translate-config';

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

class SFProjectMigration2 implements Migration {
  static readonly VERSION = 2;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    for (let i = 0; i < doc.data.texts.length; i++) {
      // Create default book permissions
      if (doc.data.texts[i].permissions === undefined) {
        const permissions: { [userRef: string]: string } = {};
        for (const userId in doc.data.userRoles) {
          if (Object.prototype.hasOwnProperty.call(doc.data.userRoles, userId)) {
            if (
              doc.data.userRoles[userId] === SFProjectRole.ParatextTranslator ||
              doc.data.userRoles[userId] === SFProjectRole.ParatextAdministrator
            ) {
              permissions[userId] = TextInfoPermission.Write;
            } else {
              permissions[userId] = TextInfoPermission.Read;
            }
          }
        }
        ops.push({ p: ['texts', i, 'permissions'], oi: permissions });
      }
    }
    if (ops.length > 0) {
      await submitMigrationOp(SFProjectMigration2.VERSION, doc, ops);
    }
  }

  migrateOp(_op: RawOp): void {
    // do nothing
  }
}

class SFProjectMigration3 implements Migration {
  static readonly VERSION = 3;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    for (let i = 0; i < doc.data.texts.length; i++) {
      // Create default chapter permissions
      for (let j = 0; j < doc.data.texts[i].chapters.length; j++) {
        if (doc.data.texts[i].chapters[j].permissions === undefined) {
          const permissions: { [userRef: string]: string } = {};
          for (const userId in doc.data.userRoles) {
            if (Object.prototype.hasOwnProperty.call(doc.data.userRoles, userId)) {
              if (
                doc.data.userRoles[userId] === SFProjectRole.ParatextTranslator ||
                doc.data.userRoles[userId] === SFProjectRole.ParatextAdministrator
              ) {
                permissions[userId] = TextInfoPermission.Write;
              } else {
                permissions[userId] = TextInfoPermission.Read;
              }
            }
          }
          ops.push({ p: ['texts', i, 'chapters', j, 'permissions'], oi: permissions });
        }
      }
    }
    if (ops.length > 0) {
      await submitMigrationOp(SFProjectMigration3.VERSION, doc, ops);
    }
  }

  migrateOp(_op: RawOp): void {
    // do nothing
  }
}

class SFProjectMigration4 implements Migration {
  static readonly VERSION = 4;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops = [{ p: ['userPermissions'], oi: {} }];
    await submitMigrationOp(SFProjectMigration4.VERSION, doc, ops);
  }

  migrateOp(_op: RawOp): void {
    // do nothing
  }
}

class SFProjectMigration5 implements Migration {
  static readonly VERSION = 5;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops = [];
    if (doc.data.translateConfig == null) {
      ops.push({ p: ['translateConfig'], oi: {} });
    }
    ops.push({ p: ['translateConfig', 'shareEnabled'], oi: false });
    ops.push({ p: ['translateConfig', 'shareLevel'], oi: TranslateShareLevel.Specific });
    await submitMigrationOp(SFProjectMigration5.VERSION, doc, ops);
  }

  migrateOp(_op: RawOp): void {
    // do nothing
  }
}

class SFProjectMigration6 implements Migration {
  static readonly VERSION = 6;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops = [];
    if (doc.data.editable == null) {
      ops.push({ p: ['editable'], oi: true });
    }
    await submitMigrationOp(SFProjectMigration6.VERSION, doc, ops);
  }

  migrateOp(_op: RawOp): void {
    //do nothing
  }
}

export const SF_PROJECT_MIGRATIONS: MigrationConstructor[] = [
  SFProjectMigration1,
  SFProjectMigration2,
  SFProjectMigration3,
  SFProjectMigration4,
  SFProjectMigration5,
  SFProjectMigration6
]
