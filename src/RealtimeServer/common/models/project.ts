import { InputSystem } from './input-system';
import { SharingLevel } from './sharing-level';

export interface Project {
  name?: string;
  inputSystem?: InputSystem;
  shareEnabled?: boolean;
  shareLevel?: SharingLevel;
  userRoles?: { [userRef: string]: string };
}
