import ShareDB from 'sharedb';
import { ConnectSession } from '../connect-session';
import { SystemRole } from '../models/system-role';
import { User, USER_INDEX_PATHS, USER_PROFILES_COLLECTION, USERS_COLLECTION } from '../models/user';
import { ValidationSchema } from '../models/validation-schema';
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
    this.pathTemplate(u => u.roles),
    this.pathTemplate(u => u.avatarUrl),
    this.pathTemplate(u => u.email),
    this.pathTemplate(u => u.name),
    this.pathTemplate(u => u.sites, false),
    this.pathTemplate(u => u.sites[ANY_KEY], false),
    this.pathTemplate(u => u.sites[ANY_KEY].projects)
  ];

  readonly validationSchema: ValidationSchema = {
    bsonType: JsonDocService.validationSchema.bsonType,
    required: JsonDocService.validationSchema.required,
    properties: {
      ...JsonDocService.validationSchema.properties,
      _id: {
        bsonType: 'string',
        pattern: '^[0-9a-f]+$'
      },
      name: {
        bsonType: 'string'
      },
      email: {
        bsonType: 'string'
      },
      paratextId: {
        bsonType: 'string'
      },
      roles: {
        bsonType: 'array',
        items: {
          bsonType: 'string'
        }
      },
      isDisplayNameConfirmed: {
        bsonType: 'bool'
      },
      interfaceLanguage: {
        bsonType: 'string'
      },
      authId: {
        bsonType: 'string'
      },
      sites: {
        bsonType: 'object',
        properties: {
          sf: {
            bsonType: 'object',
            required: ['projects'],
            properties: {
              currentProjectId: {
                bsonType: 'string'
              },
              projects: {
                bsonType: 'array',
                items: {
                  bsonType: 'string'
                }
              }
            }
          }
        }
      },
      displayName: {
        bsonType: 'string'
      },
      avatarUrl: {
        bsonType: 'string'
      },
      viewedNotifications: {
        bsonType: 'object',
        patternProperties: {
          '^.*$': {
            bsonType: 'bool'
          }
        },
        additionalProperties: true
      }
    },
    additionalProperties: false
  };

  constructor() {
    super(USER_MIGRATIONS);
  }

  init(server: RealtimeServer): void {
    server.addProjection(USER_PROFILES_COLLECTION, this.collection, USER_PROFILE_FIELDS);
    super.init(server);
  }

  protected allowRead(docId: string, doc: User, session: ConnectSession): boolean {
    if (session.isServer || session.roles.includes(SystemRole.SystemAdmin)) {
      return true;
    }
    if (docId === session.userId) {
      return true;
    }

    for (const key of Object.keys(doc)) {
      if (!Object.prototype.hasOwnProperty.call(USER_PROFILE_FIELDS, key)) {
        return false;
      }
    }

    return true;
  }

  protected allowUpdate(docId: string, _oldDoc: User, _newDoc: User, ops: any, session: ConnectSession): boolean {
    if (session.isServer || session.roles.includes(SystemRole.SystemAdmin)) {
      return true;
    }
    if (docId !== session.userId) {
      return false;
    }

    return this.checkImmutableProps(ops);
  }
}
