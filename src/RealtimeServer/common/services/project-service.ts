import { ConnectSession } from '../connect-session';
import { Project } from '../models/project';
import { SystemRole } from '../models/system-role';
import { ValidationSchema } from '../models/validation-schema';
import { JsonDocService } from './json-doc-service';

/**
 * This class contains all common functionality for managing project docs.
 */
export abstract class ProjectService<T extends Project = Project> extends JsonDocService<T> {
  protected abstract get projectAdminRole(): string;
  protected readonly immutableProps = [this.pathTemplate(p => p.name), this.pathTemplate(p => p.userRoles)];

  // This is static to aide with testing, and allow SFProjectService to utilize it
  static readonly validationSchema: ValidationSchema = {
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
      rolePermissions: {
        bsonType: 'object',
        patternProperties: {
          '^[a-z_]+$': {
            bsonType: 'array',
            items: {
              bsonType: 'string'
            }
          }
        },
        additionalProperties: false
      },
      userRoles: {
        bsonType: 'object',
        patternProperties: {
          '^[0-9a-f]+$': {
            bsonType: 'string'
          }
        },
        additionalProperties: false
      },
      userPermissions: {
        bsonType: 'object',
        patternProperties: {
          '^[0-9a-f]+$': {
            bsonType: 'array',
            items: {
              bsonType: 'string'
            }
          }
        },
        additionalProperties: false
      },
      syncDisabled: {
        bsonType: 'bool'
      }
    },
    additionalProperties: false
  };

  protected allowRead(_docId: string, doc: T, session: ConnectSession): boolean {
    if (
      session.isServer ||
      session.roles.includes(SystemRole.ServalAdmin) ||
      session.roles.includes(SystemRole.SystemAdmin) ||
      Object.keys(doc).length === 0
    ) {
      return true;
    }

    return doc.userRoles != null && session.userId in doc.userRoles;
  }

  protected allowUpdate(_docId: string, _oldDoc: T, newDoc: T, ops: any, session: ConnectSession): boolean {
    if (session.isServer || session.roles.includes(SystemRole.SystemAdmin)) {
      return true;
    }

    const projectRole = newDoc.userRoles != null ? newDoc.userRoles[session.userId] : '';
    if (projectRole !== this.projectAdminRole) {
      return false;
    }

    return this.checkImmutableProps(ops);
  }
}
