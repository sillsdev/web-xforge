import { ProjectRef } from './project';
import { Resource, ResourceRef } from './resource';

export abstract class ProjectUser extends Resource {
  /** type identifier string for domain type mapping */
  static readonly TYPE: string = 'projectUser';

  role?: string;
  userRef?: string;
  project?: ProjectRef;

  constructor(init?: Partial<ProjectUser>) {
    super(ProjectUser.TYPE, init);
  }
}

export abstract class ProjectUserRef extends ResourceRef {
  static readonly TYPE: string = ProjectUser.TYPE;

  constructor(id: string) {
    super(ProjectUserRef.TYPE, id);
  }
}
