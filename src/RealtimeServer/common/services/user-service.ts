import ShareDB = require('sharedb');
import { ConnectSession } from '../connect-session';
import { SystemRole } from '../models/system-role';
import { User, USER_INDEX_PATHS, USER_PROFILES_COLLECTION, USERS_COLLECTION } from '../models/user';
import { RealtimeServer } from '../realtime-server';
import { ANY_KEY, ObjPathTemplate } from '../utils/obj-path';
import { JsonDocService } from './json-doc-service';
import { USER_MIGRATIONS } from './user-migrations';

const USER_PROFILE_FIELDS: ShareDB.ProjectionFields = {
  displayName: true,
  avatarUrl: true
};

/**
 * This class manages user docs.
 */
export class UserService extends JsonDocService<User> {
  readonly collection = USERS_COLLECTION;

  protected readonly indexPaths = USER_INDEX_PATHS;

  protected readonly immutableProps: ObjPathTemplate[] = [
    this.pathTemplate(u => u.authId),
    this.pathTemplate(u => u.paratextId!),
    this.pathTemplate(u => u.role),
    this.pathTemplate(u => u.avatarUrl),
    this.pathTemplate(u => u.email),
    this.pathTemplate(u => u.name),
    this.pathTemplate(u => u.sites, false),
    this.pathTemplate(u => u.sites[ANY_KEY], false),
    this.pathTemplate(u => u.sites[ANY_KEY].projects)
  ];

  constructor() {
    super(USER_MIGRATIONS);
  }

  init(server: RealtimeServer): void {
    server.addProjection(USER_PROFILES_COLLECTION, this.collection, USER_PROFILE_FIELDS);
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
