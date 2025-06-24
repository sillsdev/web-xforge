import merge from 'lodash/merge';
import { RecursivePartial } from '../../common/utils/type-utils';
import { CheckingAnswerExport } from './checking-config';
import { SFProject, SFProjectProfile } from './sf-project';

function testProjectProfile(ordinal: number): SFProjectProfile {
  return {
    name: `Test project ${ordinal}`,
    rolePermissions: {},
    userRoles: {},
    userPermissions: {},
    syncDisabled: false,
    paratextId: `paratextId${ordinal}`,
    shortName: `P${ordinal}`,
    writingSystem: { tag: 'en' },
    isRightToLeft: false,
    translateConfig: {
      translationSuggestionsEnabled: false,
      preTranslate: false,
      defaultNoteTagId: 1,
      draftConfig: {
        additionalTrainingSourceEnabled: false,
        alternateSourceEnabled: false,
        alternateTrainingSourceEnabled: false,
        lastSelectedTrainingBooks: [],
        lastSelectedTrainingDataFiles: [],
        lastSelectedTranslationBooks: []
      }
    },
    checkingConfig: {
      checkingEnabled: true,
      usersSeeEachOthersResponses: true,
      answerExportMethod: CheckingAnswerExport.MarkedForExport,
      hideCommunityCheckingText: false
    },
    texts: [],
    sync: {
      queuedCount: 0,
      lastSyncSuccessful: true,
      dateLastSuccessfulSync: new Date('2020-01-01').toISOString(),
      dataInSync: true
    },
    biblicalTermsConfig: {
      biblicalTermsEnabled: false,
      hasRenderings: false
    },
    editable: true,
    defaultFontSize: 12,
    defaultFont: 'Charis SIL',
    maxGeneratedUsersPerShareKey: 250
  };
}

function testProject(ordinal: number): SFProject {
  return {
    ...testProjectProfile(ordinal),
    paratextUsers: []
  };
}

export function createTestProjectProfile(
  overrides?: RecursivePartial<SFProjectProfile>,
  ordinal = 1
): SFProjectProfile {
  return merge(testProjectProfile(ordinal), overrides);
}
export function createTestProject(overrides?: RecursivePartial<SFProject>, ordinal = 1): SFProject {
  return merge(testProject(ordinal), overrides);
}
