// src/RealtimeServer/common/services/notification-service.ts
import { Notification } from '../models/notification';
import { ValidationSchema } from '../models/validation-schema';
import { DocService } from './doc-service';

/**
 * This class manages system-wide notification documents
 */
export class NotificationService extends DocService<Notification> {
  readonly collection = 'notifications';

  readonly validationSchema: ValidationSchema = {
    bsonType: DocService.validationSchema.bsonType,
    required: [
      ...DocService.validationSchema.required,
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

  constructor() {
    // No migrations needed for initial implementation
    super([]);
  }

  protected async checkShareAccess(doc: ShareDB.Doc, session: ConnectSession, _op?: ShareDB.Op[]): Promise<void> {
    // Only system admins can create/edit notifications
    if (!session.isSystemAdmin) {
      throw new Error('User does not have permission to modify notifications');
    }
  }

  protected async checkSubmitAccess(doc: ShareDB.Doc, session: ConnectSession, _op?: ShareDB.Op[]): Promise<void> {
    // Only system admins can create/edit notifications
    if (!session.isSystemAdmin) {
      throw new Error('User does not have permission to modify notifications');
    }
  }

  protected async checkDeleteAccess(doc: ShareDB.Doc, session: ConnectSession): Promise<void> {
    // Only system admins can delete notifications
    if (!session.isSystemAdmin) {
      throw new Error('User does not have permission to delete notifications');
    }
  }
}
