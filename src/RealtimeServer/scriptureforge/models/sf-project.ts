import { Project } from '../../common/models/project';
import { WritingSystem } from '../../common/models/writing-system';
import { CheckingConfig } from './checking-config';
import { Sync } from './sync';
import { TextInfo } from './text-info';
import { TranslateConfig } from './translate-config';

export const SF_PROJECTS_COLLECTION = 'sf_projects';
export const SF_PROJECT_INDEX_PATHS: string[] = [];

export interface SFProject extends Project {
  paratextId: string;
  shortName: string;
  writingSystem: WritingSystem;
  isRightToLeft?: boolean;
  translateConfig: TranslateConfig;
  checkingConfig: CheckingConfig;
  texts: TextInfo[];
  sync: Sync;
}
