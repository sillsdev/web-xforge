import merge from 'lodash-es/merge';
import { RecursivePartial } from '../../common/utils/type-utils';
import { CheckingAnswerExport } from './checking-config';
import { SFProjectProfile } from './sf-project';

function createTestProjectProfile(ordinal: number): SFProjectProfile {
  return {
    name: 'Test project',
    userRoles: {},
    userPermissions: {},
    syncDisabled: false,
    paratextId: `paratextId${ordinal}`,
    shortName: `P${ordinal}`,
    writingSystem: { tag: 'en' },
    isRightToLeft: false,
    translateConfig: {
      translationSuggestionsEnabled: false,
      shareEnabled: false,
      defaultNoteTagId: 1
    },
    checkingConfig: {
      checkingEnabled: true,
      usersSeeEachOthersResponses: true,
      shareEnabled: false,
      answerExportMethod: CheckingAnswerExport.MarkedForExport
    },
    texts: [],
    sync: {
      queuedCount: 0,
      lastSyncSuccessful: true,
      dateLastSuccessfulSync: new Date(0).toISOString(),
      dataInSync: true
    },
    editable: true,
    defaultFontSize: 12,
    defaultFont: 'Charis SIL',
    maxGeneratedUsersPerShareKey: 250
  };
}

export function createTestProject(overrides?: RecursivePartial<SFProjectProfile>, ordinal = 1): SFProjectProfile {
  return merge(createTestProjectProfile(ordinal), overrides);
}
