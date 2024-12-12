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

// See https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html
export type ProjectRight = [domain: string, operation: `${Operation}`];

/**
 * NOTE: When updating this class, be sure to update SFProjectRights in C#.
 */
export class ProjectRights {
  private readonly rights = new Map<string, string[]>();

  constructor(rights: { [role: string]: ProjectRight[] } = {}) {
    for (const role in rights) {
      if (Object.prototype.hasOwnProperty.call(rights, role)) {
        this.addRights(role, rights[role]);
      }
    }
  }

  hasRight(project: Project, userId: string, projectDomain: string, operation: Operation, data?: OwnedData): boolean {
    const userRole: string = project.userRoles[userId];
    const rights = (this.rights.get(userRole) || [])
      .concat((project.userPermissions || {})[userId] || [])
      .concat((project.rolePermissions || {})[userRole] || []);

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

  /**
   * Checks whether a project role has a right.
   * @deprecated Use hasRight instead in nearly every case. The only reason this method ever existed was so that when
   * granting extra permissions to a user, a check could be made whether the user's role already granted the permission.
   * Specifically, when granting non-admins the ability to add and edit questions, this method was used to check if the
   * a user already had the ability to manage questions based on their role (i.e. was an admin), and then show the
   * checkbox as disabled but already checked.
   */
  roleHasRight(role: string, projectDomain: string, operation: Operation): boolean {
    return (this.rights.get(role) || []).includes(this.joinRight(projectDomain, operation));
  }

  joinRight(domain: string, operation: string): string {
    return domain + '.' + operation;
  }

  protected addRights(role: string, rights: ProjectRight[]): void {
    this.rights.set(role, Array.from(new Set<string>(rights.map(r => this.joinRight(r[0], r[1])))));
  }
}
