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

export abstract class ProjectRights {
  private readonly rights = new Map<string, Set<number>>();

  hasRight(role: string, right: ProjectRight): boolean {
    const rights = this.rights.get(role);
    if (rights == null) {
      return false;
    }
    return rights.has(right.projectDomain + right.operation);
  }

  protected addRights(role: string, rights: ProjectRight[]): void {
    this.rights.set(role, new Set<number>(rights.map(r => r.projectDomain + r.operation)));
  }
}
