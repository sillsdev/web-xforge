import { OwnedData } from './owned-data';
import { Project } from './project';

export enum Operation {
  Create = 'create',
  Edit = 'edit',
  Delete = 'delete',
  View = 'view',

  EditOwn = 'edit_own',
  DeleteOwn = 'delete_own',
  ViewOwn = 'view_own'
}

export interface ProjectRight {
  projectDomain: string;
  operation: Operation;
}

export class ProjectRights {
  private readonly rights = new Map<string, string[]>();

  constructor(rights: { [role: string]: ProjectRight[] } = {}) {
    for (const role in rights) {
      if (rights.hasOwnProperty(role)) {
        this.addRights(role, rights[role]);
      }
    }
  }

  hasRight(project: Project, userId: string, projectDomain: string, operation: Operation, data?: OwnedData): boolean {
    const rights = (this.rights.get(project.userRoles[userId]) || []).concat(
      (project.userPermissions || {})[userId] || []
    );

    if (rights.includes(this.joinRight(projectDomain, operation))) {
      return operation === Operation.Create && userId != null && data != null ? userId === data.ownerRef : true;
    }

    let ownOperation: Operation;
    switch (operation) {
      case Operation.Edit:
        ownOperation = Operation.EditOwn;
        break;
      case Operation.View:
        ownOperation = Operation.ViewOwn;
        break;
      case Operation.Delete:
        ownOperation = Operation.DeleteOwn;
        break;
      default:
        return false;
    }

    return userId != null && data?.ownerRef === userId && rights.includes(this.joinRight(projectDomain, ownOperation));
  }

  roleHasRight(role: string, projectDomain: string, operation: Operation): boolean {
    return (this.rights.get(role) || []).includes(this.joinRight(projectDomain, operation));
  }

  joinRight(domain: string, operation: string) {
    return domain + '.' + operation;
  }

  protected addRights(role: string, rights: ProjectRight[]): void {
    this.rights.set(role, Array.from(new Set<string>(rights.map(r => this.joinRight(r.projectDomain, r.operation)))));
  }
}
