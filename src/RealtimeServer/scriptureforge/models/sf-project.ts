import { Project } from '../../common/models/project';
import { WritingSystem } from '../../common/models/writing-system';
import { obj } from '../../common/utils/obj-path';
import { BiblicalTermsConfig } from './biblical-terms-config';
import { CheckingConfig } from './checking-config';
import { NoteTag } from './note-tag';
import { ParatextUserProfile } from './paratext-user-profile';
import { Sync } from './sync';
import { TextInfo } from './text-info';
import { TranslateConfig } from './translate-config';

export const SF_PROJECT_PROFILES_COLLECTION = 'sf_projects_profile';
export const SF_PROJECT_PROFILES_INDEX_PATHS: string[] = [];

export const SF_PROJECTS_COLLECTION = 'sf_projects';
export const SF_PROJECT_INDEX_PATHS: string[] = [
  obj<SFProject>().pathStr(q => q.name),
  obj<SFProject>().pathStr(q => q.paratextId)
];

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
  biblicalTermsConfig: BiblicalTermsConfig;
  copyrightBanner?: string;
  copyrightNotice?: string;
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
