import { ConnectSession } from '../connect-session';
import { Notification } from '../models/notification';
import { SystemRole } from '../models/system-role';
import { ValidationSchema } from '../models/validation-schema';
import { DocService } from './doc-service';
import { NOTIFICATION_MIGRATIONS } from './notification-migrations';

/**
 * This class manages system-wide notification documents
 */
export class NotificationService extends DocService<Notification> {
  constructor() {
    super(NOTIFICATION_MIGRATIONS);
  }

  readonly indexPaths: string[] = [
    // Index for filtering active notifications by scope and pageIds
    'expirationDate_1_scope_1_pageIds_1',
    // Index for filtering active global notifications
    'expirationDate_1_scope_1'
  ];
  readonly collection = 'notifications';

  readonly validationSchema: ValidationSchema = {
    bsonType: DocService.validationSchema.bsonType,
    required: [
      ...(DocService.validationSchema.required ?? []),
      'title',
      'content',
      'type',
      'scope',
      'expirationDate',
      'creationDate'
    ],
    properties: {
      ...DocService.validationSchema.properties,
      title: {
        bsonType: 'string'
      },
      content: {
        bsonType: 'string'
      },
      type: {
        bsonType: 'string',
        enum: ['Obtrusive', 'Unobtrusive']
      },
      scope: {
        bsonType: 'string',
        enum: ['Global', 'Page']
      },
      pageIds: {
        bsonType: ['array', 'null'],
        items: {
          bsonType: 'string'
        }
      },
      expirationDate: {
        bsonType: 'string'
      },
      creationDate: {
        bsonType: 'string'
      }
    },
    additionalProperties: false
  };

  protected allowRead(_docId: string, _doc: Notification, _session: ConnectSession): boolean {
    // All users can read notifications
    return true;
  }

  protected allowUpdate(
    _docId: string,
    _oldDoc: Notification,
    _newDoc: Notification,
    _ops: any,
    session: ConnectSession
  ): boolean {
    // Only system admins can create/edit notifications
    return session.roles.includes(SystemRole.SystemAdmin);
  }

  protected allowDelete(_docId: string, _doc: Notification, session: ConnectSession): boolean {
    // Only system admins can delete notifications
    return session.roles.includes(SystemRole.SystemAdmin);
  }
}
