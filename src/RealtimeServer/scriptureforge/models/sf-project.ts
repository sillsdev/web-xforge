import { Project } from '../../common/models/project';
import { WritingSystem } from '../../common/models/writing-system';
import { CheckingConfig } from './checking-config';
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
  texts: TextInfo[];
  sync: Sync;
  editable: boolean;
  defaultFontSize?: number;
  defaultFont?: string;
}

export interface SFProject extends SFProjectProfile {
  paratextUsers: ParatextUserProfile[];
}
