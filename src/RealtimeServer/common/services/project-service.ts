import { ConnectSession } from '../connect-session';
import { Project } from '../models/project';
import { SystemRole } from '../models/system-role';
import { JsonDocService } from './json-doc-service';

/**
 * This class contains all common functionality for managing project docs.
 */
export abstract class ProjectService<T extends Project = Project> extends JsonDocService<T> {
  protected abstract get projectAdminRole(): string;
  protected readonly immutableProps = [
    this.createPathTemplate(p => p.name),
    this.createPathTemplate(p => p.inputSystem),
    this.createPathTemplate(p => p.userRoles)
  ];

  protected allowRead(_docId: string, doc: T, session: ConnectSession): boolean {
    if (session.isServer || session.role === SystemRole.SystemAdmin || Object.keys(doc).length === 0) {
      return true;
    }

    return doc.userRoles != null && session.userId in doc.userRoles;
  }

  protected allowUpdate(_docId: string, _oldDoc: T, newDoc: T, ops: any, session: ConnectSession): boolean {
    if (session.isServer || session.role === SystemRole.SystemAdmin) {
      return true;
    }

    const projectRole = newDoc.userRoles != null ? newDoc.userRoles[session.userId] : '';
    if (projectRole !== this.projectAdminRole) {
      return false;
    }

    return this.checkImmutableProps(ops);
  }
}
