import { OwnedData } from './owned-data';

export enum Operation {
  Create = 1,
  Edit = 2,
  Delete = 3,
  View = 4,

  EditOwn = 5,
  DeleteOwn = 6,
  ViewOwn = 7
}

export interface ProjectRight {
  projectDomain: number;
  operation: Operation;
}

export class ProjectRights {
  private readonly rights = new Map<string, Set<number>>();

  constructor(rights: { [role: string]: ProjectRight[] } = {}) {
    for (const role in rights) {
      if (rights.hasOwnProperty(role)) {
        this.addRights(role, rights[role]);
      }
    }
  }

  hasRight(role: string, right: ProjectRight, userId?: string, data?: OwnedData): boolean {
    const rights = this.rights.get(role);
    if (rights == null) {
      return false;
    }

    if (rights.has(right.projectDomain + right.operation)) {
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

    return userId != null && data != null && rights.has(right.projectDomain + ownOperation) && data.ownerRef === userId;
  }

  protected addRights(role: string, rights: ProjectRight[]): void {
    this.rights.set(role, new Set<number>(rights.map(r => r.projectDomain + r.operation)));
  }
}
