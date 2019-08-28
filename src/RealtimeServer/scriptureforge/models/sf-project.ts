import { InputSystem } from '../../common/models/input-system';
import { Project } from '../../common/models/project';
import { Sync } from './sync';
import { TextInfo } from './text-info';

export const SF_PROJECTS_COLLECTION = 'sf_projects';

export interface SFProject extends Project {
  paratextId?: string;
  checkingEnabled?: boolean;
  usersSeeEachOthersResponses?: boolean;
  translateEnabled?: boolean;
  sourceParatextId?: string;
  sourceName?: string;
  sourceInputSystem?: InputSystem;

  texts?: TextInfo[];
  sync?: Sync;
}
