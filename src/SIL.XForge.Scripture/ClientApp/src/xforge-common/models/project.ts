import { InputSystem } from './input-system';
import { ProjectUserRef } from './project-user';
import { Resource, ResourceRef } from './resource';
import { SharingLevel } from './sharing-level';

export abstract class Project extends Resource {
  projectName?: string;
  inputSystem?: InputSystem;
  users?: ProjectUserRef[];
  shareEnabled: boolean;
  shareLevel: SharingLevel;

  abstract get taskNames(): string[];
}

export abstract class ProjectRef extends ResourceRef {}
