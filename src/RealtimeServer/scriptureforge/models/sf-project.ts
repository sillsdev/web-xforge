import { CreateIndexesOptions } from 'mongodb';
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
export const SF_PROJECT_INDEX_PATHS: (string | [string, CreateIndexesOptions])[] = [
  obj<SFProject>().pathStr(p => p.name),
  obj<SFProject>().pathStr(p => p.paratextId),
  // Index for ParatextService.GetBiblicalTermsAsync() in .NET
  obj<SFProject>().pathStr(p => p.shortName),
  // Indexes for SFProjectService.IsSourceProject() in .NET
  [obj<SFProject>().pathStr(p => p.translateConfig.source!.projectRef), { sparse: true }],
  [obj<SFProject>().pathStr(p => p.translateConfig.draftConfig.additionalTrainingSource!.projectRef), { sparse: true }],
  [obj<SFProject>().pathStr(p => p.translateConfig.draftConfig.alternateSource!.projectRef), { sparse: true }],
  [obj<SFProject>().pathStr(p => p.translateConfig.draftConfig.alternateTrainingSource!.projectRef), { sparse: true }]
];

/** Length of id for a DBL resource. */
export const DBL_RESOURCE_ID_LENGTH: number = 16;

/** See documentation in SFProject.cs. */
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

/** Is the SF project that of a DBL resource, rather than a typical PT project? */
export function isResource(project: SFProjectProfile): boolean {
  const resourceIdLength: number = DBL_RESOURCE_ID_LENGTH;
  return project.paratextId.length === resourceIdLength;
}
