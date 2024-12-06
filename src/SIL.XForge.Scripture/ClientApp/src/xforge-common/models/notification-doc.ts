import { Notification, NOTIFICATIONS_COLLECTION } from 'realtime-server/lib/esm/common/models/notification';
import { JsonRealtimeDoc } from './json-realtime-doc';

/**
 * Real-time document representing a system-wide notification
 */
export class NotificationDoc extends JsonRealtimeDoc<Notification> {
  static readonly COLLECTION = NOTIFICATIONS_COLLECTION;
  static readonly INDEX_PATHS = [
    // Index for filtering active notifications by scope and pageIds
    'expirationDate_1_scope_1_pageIds_1',
    // Index for filtering active global notifications
    'expirationDate_1_scope_1'
  ];
}
