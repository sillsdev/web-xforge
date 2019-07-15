import { InputSystem } from './input-system';
import { ProjectUserRef } from './project-user';
import { Resource, ResourceRef } from './resource';
import { SharingLevel } from './sharing-level';

export abstract class Project extends Resource {
  /** type identifier string for domain type mapping */
  static readonly TYPE: string = 'project';

  projectName?: string;
  inputSystem?: InputSystem;
  users?: ProjectUserRef[];
  shareEnabled: boolean;
  shareLevel: SharingLevel;

  constructor(init?: Partial<Project>) {
    super(Project.TYPE, init);
  }

  abstract get taskNames(): string[];
}

export abstract class ProjectRef extends ResourceRef {
  static readonly TYPE: string = Project.TYPE;

  constructor(id: string) {
    super(ProjectRef.TYPE, id);
  }
}
