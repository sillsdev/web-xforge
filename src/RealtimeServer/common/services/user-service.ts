import ShareDB = require('sharedb');
import { ConnectSession } from '../connect-session';
import { SystemRole } from '../models/system-role';
import { User } from '../models/user';
import { PathTemplate } from '../path-template';
import { RealtimeServer } from '../realtime-server';
import { JsonDocService } from './json-doc-service';

const USER_PROFILE_FIELDS: ShareDB.ProjectionFields = {
  displayName: true,
  avatarUrl: true
};

/**
 * This class manages user docs.
 */
export class UserService extends JsonDocService<User> {
  readonly collection = 'users';

  readonly immutableProps: PathTemplate[] = [
    this.createPathTemplate(u => u.authId!),
    this.createPathTemplate(u => u.paratextId!),
    this.createPathTemplate(u => u.role!),
    this.createPathTemplate(u => u.avatarUrl!),
    this.createPathTemplate(u => u.email!),
    this.createPathTemplate(u => u.name!),
    this.createPathTemplate(u => u.sites!, false),
    this.createPathTemplate(u => u.sites!['*'], false),
    this.createPathTemplate(u => u.sites!['*'].projects)
  ];

  init(server: RealtimeServer): void {
    server.backend.addProjection('user_profiles', this.collection, USER_PROFILE_FIELDS);
    super.init(server);
  }

  protected allowRead(docId: string, doc: User, session: ConnectSession): boolean {
    if (session.isServer || session.role === SystemRole.SystemAdmin) {
      return true;
    }
    if (docId === session.userId) {
      return true;
    }

    for (const key of Object.keys(doc)) {
      if (!USER_PROFILE_FIELDS.hasOwnProperty(key)) {
        return false;
      }
    }

    return true;
  }

  protected allowUpdate(docId: string, _oldDoc: User, _newDoc: User, ops: any, session: ConnectSession): boolean {
    if (session.isServer || session.role === SystemRole.SystemAdmin) {
      return true;
    }
    if (docId !== session.userId) {
      return false;
    }

    return this.checkImmutableProps(ops);
  }
}
