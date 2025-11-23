import { Canon } from '@sillsdev/scripture';
import { Doc, Op } from 'sharedb/lib/client';
import { DocMigration, MigrationConstructor, monotonicallyIncreasingMigrationList } from '../../common/migration';
import { Operation } from '../../common/models/project-rights';
import { submitMigrationOp } from '../../common/realtime-server';
import { NoteTag } from '../models/note-tag';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from '../models/sf-project-rights';
import { SFProjectRole } from '../models/sf-project-role';
import { TextInfo } from '../models/text-info';
import { TextInfoPermission } from '../models/text-info-permission';
import { TranslateShareLevel, TranslateSource } from '../models/translate-config';

class SFProjectMigration1 extends DocMigration {
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
}

class SFProjectMigration2 extends DocMigration {
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
}

class SFProjectMigration3 extends DocMigration {
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
}

class SFProjectMigration4 extends DocMigration {
  static readonly VERSION = 4;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [{ p: ['userPermissions'], oi: {} }];
    await submitMigrationOp(SFProjectMigration4.VERSION, doc, ops);
  }
}

class SFProjectMigration5 extends DocMigration {
  static readonly VERSION = 5;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    if (doc.data.translateConfig == null) {
      ops.push({ p: ['translateConfig'], oi: {} });
    }
    ops.push({ p: ['translateConfig', 'shareEnabled'], oi: false });
    ops.push({ p: ['translateConfig', 'shareLevel'], oi: TranslateShareLevel.Specific });
    await submitMigrationOp(SFProjectMigration5.VERSION, doc, ops);
  }
}

class SFProjectMigration6 extends DocMigration {
  static readonly VERSION = 6;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    if (doc.data.editable == null) {
      ops.push({ p: ['editable'], oi: true });
    }
    await submitMigrationOp(SFProjectMigration6.VERSION, doc, ops);
  }
}

class SFProjectMigration7 extends DocMigration {
  static readonly VERSION = 7;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    const tagIcon: string | undefined = doc.data.tagIcon;
    if (tagIcon != null) {
      ops.push({ p: ['tagIcon'], od: tagIcon });
    }
    await submitMigrationOp(SFProjectMigration7.VERSION, doc, ops);
  }
}

class SFProjectMigration8 extends DocMigration {
  static readonly VERSION = 8;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    const percentCompleted: number | undefined = doc.data.sync?.percentCompleted;
    if (percentCompleted != null) {
      ops.push({ p: ['sync', 'percentCompleted'], od: percentCompleted });
    }
    if (ops.length > 0) {
      await submitMigrationOp(SFProjectMigration8.VERSION, doc, ops);
    }
  }
}

/**
 * This migration removes the shareLevel property from the translateConfig and checkingConfig objects.
 * Project admins now select whether a share link can be used by only one person or by anyone at the time the
 * link is created (rather than configuring it on the project).
 */
class SFProjectMigration9 extends DocMigration {
  static readonly VERSION = 9;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    const translateConfigShareLevel = doc.data.translateConfig?.shareLevel;
    if (translateConfigShareLevel != null) {
      ops.push({ p: ['translateConfig', 'shareLevel'], od: translateConfigShareLevel });
    }
    const checkingConfigShareLevel = doc.data.checkingConfig?.shareLevel;
    if (checkingConfigShareLevel != null) {
      ops.push({ p: ['checkingConfig', 'shareLevel'], od: checkingConfigShareLevel });
    }
    await submitMigrationOp(SFProjectMigration9.VERSION, doc, ops);
  }
}

class SFProjectMigration10 extends DocMigration {
  static readonly VERSION = 10;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    if (doc.data.translateConfig != null) {
      ops.push({ p: ['translateConfig', 'preTranslate'], oi: false });
    }
    await submitMigrationOp(SFProjectMigration10.VERSION, doc, ops);
  }
}

class SFProjectMigration11 extends DocMigration {
  static readonly VERSION = 11;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    if (doc.data.biblicalTermsConfig == null) {
      ops.push({ p: ['biblicalTermsConfig'], oi: {} });
    }
    if (doc.data.biblicalTermsConfig == null || doc.data.biblicalTermsConfig.biblicalTermsEnabled === undefined) {
      ops.push({ p: ['biblicalTermsConfig', 'biblicalTermsEnabled'], oi: false });
    }
    if (doc.data.biblicalTermsConfig == null || doc.data.biblicalTermsConfig.hasRenderings === undefined) {
      ops.push({ p: ['biblicalTermsConfig', 'hasRenderings'], oi: false });
    }
    await submitMigrationOp(SFProjectMigration11.VERSION, doc, ops);
  }
}

class SFProjectMigration12 extends DocMigration {
  static readonly VERSION = 12;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    if (doc.data.translateConfig.draftConfig == null) {
      ops.push({ p: ['translateConfig', 'draftConfig'], oi: {} });
    }
    await submitMigrationOp(SFProjectMigration12.VERSION, doc, ops);
  }
}

class SFProjectMigration13 extends DocMigration {
  static readonly VERSION = 13;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    if (doc.data.translateConfig.draftConfig.lastSelectedBooks == null) {
      ops.push({ p: ['translateConfig', 'draftConfig', 'lastSelectedBooks'], oi: [] });
    }
    await submitMigrationOp(SFProjectMigration13.VERSION, doc, ops);
  }
}

class SFProjectMigration14 extends DocMigration {
  static readonly VERSION = 14;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    if (doc.data.translateConfig.draftConfig.alternateTrainingSourceEnabled == null) {
      ops.push({ p: ['translateConfig', 'draftConfig', 'alternateTrainingSourceEnabled'], oi: false });
    }

    if (doc.data.translateConfig.draftConfig.lastSelectedTrainingBooks == null) {
      const lastSelectedBooks = doc.data.translateConfig.draftConfig.lastSelectedBooks;
      if (lastSelectedBooks != null) {
        ops.push({ p: ['translateConfig', 'draftConfig', 'lastSelectedBooks'], od: lastSelectedBooks });
        ops.push({ p: ['translateConfig', 'draftConfig', 'lastSelectedTrainingBooks'], oi: lastSelectedBooks });
      } else {
        ops.push({ p: ['translateConfig', 'draftConfig', 'lastSelectedTrainingBooks'], oi: [] });
      }
    }

    if (doc.data.translateConfig.draftConfig.lastSelectedTranslationBooks == null) {
      ops.push({ p: ['translateConfig', 'draftConfig', 'lastSelectedTranslationBooks'], oi: [] });
    }

    await submitMigrationOp(SFProjectMigration14.VERSION, doc, ops);
  }
}

class SFProjectMigration15 extends DocMigration {
  static readonly VERSION = 15;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    for (let i = 0; i < (doc.data.noteTags?.length ?? 0); i++) {
      const noteTag: NoteTag = doc.data.noteTags[i];
      if (!noteTag.creatorResolve) {
        ops.push({ p: ['noteTags', i, 'creatorResolve'], od: noteTag.creatorResolve });
        ops.push({ p: ['noteTags', i, 'creatorResolve'], oi: true });
      }
    }
    await submitMigrationOp(SFProjectMigration15.VERSION, doc, ops);
  }
}

class SFProjectMigration16 extends DocMigration {
  static readonly VERSION = 16;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    if (doc.data.translateConfig.draftConfig.sendAllSegments == null) {
      ops.push({ p: ['translateConfig', 'draftConfig', 'sendAllSegments'], oi: false });
    }

    await submitMigrationOp(SFProjectMigration16.VERSION, doc, ops);
  }
}

class SFProjectMigration17 extends DocMigration {
  static readonly VERSION = 17;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    if (doc.data.translateConfig.draftConfig.lastSelectedTrainingDataFiles == null) {
      ops.push({ p: ['translateConfig', 'draftConfig', 'lastSelectedTrainingDataFiles'], oi: [] });
    }
    if (doc.data.translateConfig.draftConfig.additionalTrainingData == null) {
      ops.push({ p: ['translateConfig', 'draftConfig', 'additionalTrainingData'], oi: false });
    }
    await submitMigrationOp(SFProjectMigration17.VERSION, doc, ops);
  }
}

class SFProjectMigration18 extends DocMigration {
  static readonly VERSION = 18;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    if (doc.data.translateConfig.draftConfig.alternateSourceEnabled == null) {
      if (doc.data.translateConfig.draftConfig.alternateSource != null) {
        ops.push({ p: ['translateConfig', 'draftConfig', 'alternateSourceEnabled'], oi: true });
      } else {
        ops.push({ p: ['translateConfig', 'draftConfig', 'alternateSourceEnabled'], oi: false });
      }
    }

    await submitMigrationOp(SFProjectMigration18.VERSION, doc, ops);
  }
}

class SFProjectMigration19 extends DocMigration {
  static readonly VERSION = 19;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    if (doc.data.translateConfig.draftConfig.sendAllSegments != null) {
      ops.push({
        p: ['translateConfig', 'draftConfig', 'sendAllSegments'],
        od: doc.data.translateConfig.draftConfig.sendAllSegments
      });
    }

    await submitMigrationOp(SFProjectMigration19.VERSION, doc, ops);
  }
}

class SFProjectMigration20 extends DocMigration {
  static readonly VERSION = 20;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    if (doc.data.translateConfig.draftConfig.additionalTrainingSourceEnabled == null) {
      ops.push({ p: ['translateConfig', 'draftConfig', 'additionalTrainingSourceEnabled'], oi: false });
    }

    await submitMigrationOp(SFProjectMigration20.VERSION, doc, ops);
  }
}

class SFProjectMigration21 extends DocMigration {
  static readonly VERSION = 21;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    if (doc.data.rolePermissions == null) {
      ops.push({ p: ['rolePermissions'], oi: {} });

      // Migrate and remove checkingConfig.shareEnabled
      const permissions = [SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.UserInvites, Operation.Create)];
      const checkingConfigShareEnabled = doc.data.checkingConfig.shareEnabled;
      if (checkingConfigShareEnabled === true) {
        ops.push({
          p: ['rolePermissions', SFProjectRole.CommunityChecker],
          oi: permissions
        });
      }
      if (checkingConfigShareEnabled != null) {
        ops.push({ p: ['checkingConfig', 'shareEnabled'], od: checkingConfigShareEnabled });
      }

      // Migrate and remove translateConfig.shareEnabled
      const translateConfigShareEnabled = doc.data.translateConfig.shareEnabled;
      if (translateConfigShareEnabled === true) {
        ops.push({
          p: ['rolePermissions', SFProjectRole.Commenter],
          oi: permissions
        });
        ops.push({
          p: ['rolePermissions', SFProjectRole.Viewer],
          oi: permissions
        });
      }
      if (translateConfigShareEnabled != null) {
        ops.push({ p: ['translateConfig', 'shareEnabled'], od: translateConfigShareEnabled });
      }
    }

    await submitMigrationOp(SFProjectMigration21.VERSION, doc, ops);
  }
}

class SFProjectMigration22 extends DocMigration {
  static readonly VERSION = 22;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    if (doc.data.translateConfig.draftConfig.lastSelectedTrainingScriptureRange == null) {
      const trainingRangeFromBooks: string[] = doc.data.translateConfig.draftConfig.lastSelectedTrainingBooks.map(
        (b: number) => Canon.bookNumberToId(b)
      );
      if (trainingRangeFromBooks.length > 0) {
        ops.push({
          p: ['translateConfig', 'draftConfig', 'lastSelectedTrainingScriptureRange'],
          oi: trainingRangeFromBooks.join(';')
        });
      }
    }
    if (doc.data.translateConfig.draftConfig.lastSelectedTranslationScriptureRange == null) {
      const translationRangeFromBooks: string[] = doc.data.translateConfig.draftConfig.lastSelectedTranslationBooks.map(
        (b: number) => Canon.bookNumberToId(b)
      );
      if (translationRangeFromBooks.length > 0) {
        ops.push({
          p: ['translateConfig', 'draftConfig', 'lastSelectedTranslationScriptureRange'],
          oi: translationRangeFromBooks.join(';')
        });
      }
    }

    await submitMigrationOp(SFProjectMigration22.VERSION, doc, ops);
  }
}

class SFProjectMigration23 extends DocMigration {
  static readonly VERSION = 23;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    if (doc.data.translateConfig.draftConfig.usfmConfig?.preserveParagraphMarkers != null) {
      ops.push({
        p: ['translateConfig', 'draftConfig', 'usfmConfig'],
        od: doc.data.translateConfig.draftConfig.usfmConfig
      });
    }
    await submitMigrationOp(SFProjectMigration23.VERSION, doc, ops);
  }
}

class SFProjectMigration24 extends DocMigration {
  static readonly VERSION = 24;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    if (doc.data.translateConfig?.draftConfig?.additionalTrainingData != null) {
      ops.push({
        p: ['translateConfig', 'draftConfig', 'additionalTrainingData'],
        od: doc.data.translateConfig.draftConfig.additionalTrainingData
      });
    }

    if (ops.length > 0) {
      await submitMigrationOp(SFProjectMigration24.VERSION, doc, ops);
    }
  }
}

class SFProjectMigration25 extends DocMigration {
  static readonly VERSION = 25;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    if (doc.data.lynxConfig == null) {
      ops.push({ p: ['lynxConfig'], oi: {} });
    }
    if (doc.data.lynxConfig?.autoCorrectionsEnabled == null) {
      ops.push({ p: ['lynxConfig', 'autoCorrectionsEnabled'], oi: false });
    }
    if (doc.data.lynxConfig?.assessmentsEnabled == null) {
      ops.push({ p: ['lynxConfig', 'assessmentsEnabled'], oi: false });
    }
    if (doc.data.lynxConfig?.punctuationCheckerEnabled == null) {
      ops.push({ p: ['lynxConfig', 'punctuationCheckerEnabled'], oi: false });
    }
    if (doc.data.lynxConfig?.allowedCharacterCheckerEnabled == null) {
      ops.push({ p: ['lynxConfig', 'allowedCharacterCheckerEnabled'], oi: false });
    }
    await submitMigrationOp(SFProjectMigration25.VERSION, doc, ops);
  }
}

class SFProjectMigration26 extends DocMigration {
  static readonly VERSION = 26;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];

    // Remove the lastSelectedTrainingBooks
    if (doc.data.translateConfig.draftConfig.lastSelectedTrainingBooks != null) {
      ops.push({
        p: ['translateConfig', 'draftConfig', 'lastSelectedTrainingBooks'],
        od: doc.data.translateConfig.draftConfig.lastSelectedTrainingBooks
      });
    }

    // Remove the lastSelectedTranslationBooks
    if (doc.data.translateConfig.draftConfig.lastSelectedTranslationBooks != null) {
      ops.push({
        p: ['translateConfig', 'draftConfig', 'lastSelectedTranslationBooks'],
        od: doc.data.translateConfig.draftConfig.lastSelectedTranslationBooks
      });
    }

    // Migrate the lastSelectedTrainingScriptureRange
    if (doc.data.translateConfig?.draftConfig?.lastSelectedTrainingScriptureRange != null) {
      const scriptureRange: string = doc.data.translateConfig.draftConfig.lastSelectedTrainingScriptureRange;
      if (
        doc.data.translateConfig?.draftConfig?.lastSelectedTrainingScriptureRanges == null ||
        doc.data.translateConfig?.draftConfig?.lastSelectedTrainingScriptureRanges.length == 0
      ) {
        const projectId: string =
          doc.data.translateConfig.draftConfig.alternateTrainingSourceEnabled &&
          doc.data.translateConfig.draftConfig.alternateTrainingSource?.projectRef != null
            ? doc.data.translateConfig.draftConfig.alternateTrainingSource.projectRef
            : doc.data.translateConfig.source?.projectRef;
        ops.push({
          p: ['translateConfig', 'draftConfig', 'lastSelectedTrainingScriptureRanges'],
          oi: [{ projectId, scriptureRange }]
        });
      }

      ops.push({
        p: ['translateConfig', 'draftConfig', 'lastSelectedTrainingScriptureRange'],
        od: scriptureRange
      });
    }

    // Migrate the lastSelectedTranslationScriptureRange
    if (doc.data.translateConfig?.draftConfig?.lastSelectedTranslationScriptureRange != null) {
      const scriptureRange: string = doc.data.translateConfig.draftConfig.lastSelectedTranslationScriptureRange;
      if (
        doc.data.translateConfig?.draftConfig?.lastSelectedTranslationScriptureRanges == null ||
        doc.data.translateConfig?.draftConfig?.lastSelectedTranslationScriptureRanges.length == 0
      ) {
        const projectId: string =
          doc.data.translateConfig.draftConfig.alternateSourceEnabled &&
          doc.data.translateConfig.draftConfig.alternateSource?.projectRef != null
            ? doc.data.translateConfig.draftConfig.alternateSource.projectRef
            : doc.data.translateConfig.source?.projectRef;
        ops.push({
          p: ['translateConfig', 'draftConfig', 'lastSelectedTranslationScriptureRanges'],
          oi: [{ projectId, scriptureRange }]
        });
      }

      ops.push({
        p: ['translateConfig', 'draftConfig', 'lastSelectedTranslationScriptureRange'],
        od: scriptureRange
      });
    }

    if (ops.length > 0) {
      await submitMigrationOp(SFProjectMigration26.VERSION, doc, ops);
    }
  }
}

class SFProjectMigration27 extends DocMigration {
  static readonly VERSION = 27;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    const draftingSources: TranslateSource[] = [];
    const trainingSources: TranslateSource[] = [];

    // Migrate the old values to the new structure
    if (doc.data.translateConfig.preTranslate === true) {
      const translateConfig = doc.data.translateConfig;
      const draftConfig = translateConfig.draftConfig;
      if (draftConfig.alternateTrainingSourceEnabled && draftConfig.alternateTrainingSource != null) {
        trainingSources.push(draftConfig.alternateTrainingSource);
      } else if (translateConfig.source != null) {
        trainingSources.push(translateConfig.source);
      }
      if (draftConfig.additionalTrainingSourceEnabled && draftConfig.additionalTrainingSource != null) {
        trainingSources.push(draftConfig.additionalTrainingSource);
      }
      if (draftConfig.alternateSourceEnabled && draftConfig.alternateSource != null) {
        draftingSources.push(draftConfig.alternateSource);
      } else if (translateConfig.source != null) {
        draftingSources.push(translateConfig.source);
      }
    }

    // Create the new structure
    if (doc.data.translateConfig.draftConfig.draftingSources == null) {
      ops.push({ p: ['translateConfig', 'draftConfig', 'draftingSources'], oi: draftingSources });
    }
    if (doc.data.translateConfig.draftConfig.trainingSources == null) {
      ops.push({ p: ['translateConfig', 'draftConfig', 'trainingSources'], oi: trainingSources });
    }

    // Remove the old values
    if (doc.data.translateConfig.draftConfig.alternateSourceEnabled != null) {
      ops.push({
        p: ['translateConfig', 'draftConfig', 'alternateSourceEnabled'],
        od: doc.data.translateConfig.draftConfig.alternateSourceEnabled
      });
    }
    if (doc.data.translateConfig.draftConfig.alternateSource != null) {
      ops.push({
        p: ['translateConfig', 'draftConfig', 'alternateSource'],
        od: doc.data.translateConfig.draftConfig.alternateSource
      });
    }
    if (doc.data.translateConfig.draftConfig.alternateTrainingSourceEnabled != null) {
      ops.push({
        p: ['translateConfig', 'draftConfig', 'alternateTrainingSourceEnabled'],
        od: doc.data.translateConfig.draftConfig.alternateTrainingSourceEnabled
      });
    }
    if (doc.data.translateConfig.draftConfig.alternateTrainingSource != null) {
      ops.push({
        p: ['translateConfig', 'draftConfig', 'alternateTrainingSource'],
        od: doc.data.translateConfig.draftConfig.alternateTrainingSource
      });
    }
    if (doc.data.translateConfig.draftConfig.additionalTrainingSourceEnabled != null) {
      ops.push({
        p: ['translateConfig', 'draftConfig', 'additionalTrainingSourceEnabled'],
        od: doc.data.translateConfig.draftConfig.additionalTrainingSourceEnabled
      });
    }
    if (doc.data.translateConfig.draftConfig.additionalTrainingSource != null) {
      ops.push({
        p: ['translateConfig', 'draftConfig', 'additionalTrainingSource'],
        od: doc.data.translateConfig.draftConfig.additionalTrainingSource
      });
    }

    await submitMigrationOp(SFProjectMigration27.VERSION, doc, ops);
  }
}

class SFProjectMigration28 extends DocMigration {
  static readonly VERSION = 28;

  async migrateDoc(doc: Doc): Promise<void> {
    const ops: Op[] = [];
    if (doc.data?.texts != null && doc.data?.translateConfig?.draftConfig?.currentScriptureRange == null) {
      const currentScriptureRange = doc.data.texts
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        .filter((t: TextInfo) => t.chapters.some(c => c.hasDraft))
        .map((t: TextInfo) => Canon.bookNumberToId(t.bookNum, ''))
        .filter((id: string) => id !== '')
        .join(';');
      if (currentScriptureRange !== '' && currentScriptureRange != null) {
        ops.push({
          p: ['translateConfig', 'draftConfig', 'currentScriptureRange'],
          oi: currentScriptureRange
        });
        if (doc.data.translateConfig?.draftConfig?.draftedScriptureRange == null) {
          ops.push({
            p: ['translateConfig', 'draftConfig', 'draftedScriptureRange'],
            oi: currentScriptureRange
          });
        }
      }
    }

    if (ops.length > 0) {
      await submitMigrationOp(SFProjectMigration28.VERSION, doc, ops);
    }
  }
}

export const SF_PROJECT_MIGRATIONS: MigrationConstructor[] = monotonicallyIncreasingMigrationList([
  SFProjectMigration1,
  SFProjectMigration2,
  SFProjectMigration3,
  SFProjectMigration4,
  SFProjectMigration5,
  SFProjectMigration6,
  SFProjectMigration7,
  SFProjectMigration8,
  SFProjectMigration9,
  SFProjectMigration10,
  SFProjectMigration11,
  SFProjectMigration12,
  SFProjectMigration13,
  SFProjectMigration14,
  SFProjectMigration15,
  SFProjectMigration16,
  SFProjectMigration17,
  SFProjectMigration18,
  SFProjectMigration19,
  SFProjectMigration20,
  SFProjectMigration21,
  SFProjectMigration22,
  SFProjectMigration23,
  SFProjectMigration24,
  SFProjectMigration25,
  SFProjectMigration26,
  SFProjectMigration27,
  SFProjectMigration28
]);
