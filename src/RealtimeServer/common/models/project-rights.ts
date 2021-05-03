import { OwnedData } from './owned-data';

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

  hasRight(role: string, permissions: string[], right: ProjectRight, userId?: string, data?: OwnedData): boolean {
    const rights = new Set((this.rights.get(role) || []).concat(permissions));

    if (rights.has(this.joinRight(right.projectDomain, right.operation))) {
      if (right.operation === Operation.Create && userId != null && data != null && userId !== data.ownerRef) {
        return false;
      }
      return true;
    }

    let ownOperation: Operation;
    switch (right.operation) {
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

    return userId != null && data?.ownerRef === userId && rights.has(this.joinRight(right.projectDomain, ownOperation));
  }

  joinRight(domain: string, operation: string) {
    return domain + '.' + operation;
  }

  protected addRights(role: string, rights: ProjectRight[]): void {
    this.rights.set(role, Array.from(new Set<string>(rights.map(r => this.joinRight(r.projectDomain, r.operation)))));
  }
}
