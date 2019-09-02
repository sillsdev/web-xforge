import { InputSystem } from './input-system';

export interface Project {
  name: string;
  inputSystem: InputSystem;
  userRoles: { [userRef: string]: string };
}
