import { InputSystem } from 'xforge-common/models/input-system';
import { Project } from 'xforge-common/models/project';
import { Sync } from './sync';
import { TextInfo } from './text-info';

export interface SFProject extends Project {
  paratextId?: string;
  checkingEnabled?: boolean;
  usersSeeEachOthersResponses?: boolean;
  translateEnabled?: boolean;
  sourceParatextId?: string;
  sourceInputSystem?: InputSystem;

  texts?: TextInfo[];
  sync?: Sync;
}
