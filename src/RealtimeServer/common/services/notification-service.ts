import { ConnectSession } from '../connect-session';
import { Notification, NOTIFICATIONS_COLLECTION } from '../models/notification';
import { SystemRole } from '../models/system-role';
import { ValidationSchema } from '../models/validation-schema';
import { RealtimeServer } from '../realtime-server';
import { JsonDocService } from './json-doc-service';
import { NOTIFICATION_MIGRATIONS } from './notification-migrations';

/**
 * This class manages system-wide notification documents
 */
export class NotificationService extends JsonDocService<Notification> {
  readonly collection = NOTIFICATIONS_COLLECTION;
  readonly indexPaths: string[] = [
    // Index for filtering active notifications by scope and pageIds
    'expirationDate_1_scope_1_pageIds_1',
    // Index for filtering active global notifications
    'expirationDate_1_scope_1'
  ];
  readonly validationSchema: ValidationSchema = {
    bsonType: JsonDocService.validationSchema.bsonType,
    required: JsonDocService.validationSchema.required,
    properties: {
      ...JsonDocService.validationSchema.properties,
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

  constructor() {
    super(NOTIFICATION_MIGRATIONS);
  }

  init(server: RealtimeServer): void {
    super.init(server);
  }

  protected allowCreate(_docId: string, doc: Notification, session: ConnectSession): boolean {
    console.log(`allowCreate notification`);
    console.log(_docId, doc, session);
    return session.roles.includes(SystemRole.SystemAdmin);
  }

  protected allowRead(_docId: string, _doc: Notification, _session: ConnectSession): boolean {
    return true;
  }

  protected allowUpdate(
    _docId: string,
    _oldDoc: Notification,
    _newDoc: Notification,
    _ops: any,
    session: ConnectSession
  ): boolean {
    console.log(`allowUpdate notification`);
    console.log(_docId, _oldDoc, _newDoc, _ops, session);
    return session.roles.includes(SystemRole.SystemAdmin);
  }

  protected allowDelete(_docId: string, _doc: Notification, session: ConnectSession): boolean {
    return session.roles.includes(SystemRole.SystemAdmin);
  }
}
