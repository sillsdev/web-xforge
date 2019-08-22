import { InputSystem } from '../../common/models/input-system';
import { Project } from '../../common/models/project';
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
