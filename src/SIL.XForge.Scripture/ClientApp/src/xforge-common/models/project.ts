import { InputSystem } from './input-system';
import { ProjectUserRef } from './project-user';
import { Resource, ResourceRef } from './resource';
import { SharingLevel } from './sharing-level';

export abstract class Project extends Resource {
  projectName?: string;
  inputSystem?: InputSystem;
  // lastSyncedDate is here instead of SFProject so that its type can be forced to be a string
  lastSyncedDate?: string;
  users?: ProjectUserRef[];
  shareEnabled: boolean;
  shareLevel: SharingLevel;

  abstract get taskNames(): string[];
}

export abstract class ProjectRef extends ResourceRef {}
