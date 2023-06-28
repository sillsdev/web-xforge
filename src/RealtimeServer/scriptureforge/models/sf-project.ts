import { Project } from '../../common/models/project';
import { WritingSystem } from '../../common/models/writing-system';
import { CheckingAnswerExport, CheckingConfig } from './checking-config';
import { NoteTag } from './note-tag';
import { ParatextUserProfile } from './paratext-user-profile';
import { Sync } from './sync';
import { TextInfo } from './text-info';
import { TranslateConfig } from './translate-config';

export const SF_PROJECT_PROFILES_COLLECTION = 'sf_projects_profile';
export const SF_PROJECT_PROFILES_INDEX_PATHS: string[] = [];

export const SF_PROJECTS_COLLECTION = 'sf_projects';
export const SF_PROJECT_INDEX_PATHS: string[] = [];

export interface SFProjectProfile extends Project {
  paratextId: string;
  shortName: string;
  writingSystem: WritingSystem;
  isRightToLeft?: boolean;
  translateConfig: TranslateConfig;
  checkingConfig: CheckingConfig;
  resourceConfig?: ResourceConfig;
  texts: TextInfo[];
  noteTags?: NoteTag[];
  sync: Sync;
  editable: boolean;
  defaultFontSize?: number;
  defaultFont?: string;
  maxGeneratedUsersPerShareKey?: number;
}

export interface SFProject extends SFProjectProfile {
  paratextUsers: ParatextUserProfile[];
}

export interface ResourceConfig {
  createdTimestamp: Date;
  manifestChecksum: string;
  permissionsChecksum: string;
  revision: number;
}

const defaultSFProjectProfile: SFProjectProfile = {
  name: 'Test project',
  userRoles: {},
  userPermissions: {},
  syncDisabled: false,
  paratextId: 'paratextId01',
  shortName: 'P01',
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
    answerExportMethod: CheckingAnswerExport.MarkedForExport,
    noteTagId: 1
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

const defaultSFProject: SFProject = {
  ...defaultSFProjectProfile,
  paratextUsers: []
};
