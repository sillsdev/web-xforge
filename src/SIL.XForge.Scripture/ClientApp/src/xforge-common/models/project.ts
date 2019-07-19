import { InputSystem } from './input-system';
import { SharingLevel } from './sharing-level';

export interface Project {
  projectName?: string;
  inputSystem?: InputSystem;
  shareEnabled?: boolean;
  shareLevel?: SharingLevel;
  userRoles?: { [key: string]: string };
}
