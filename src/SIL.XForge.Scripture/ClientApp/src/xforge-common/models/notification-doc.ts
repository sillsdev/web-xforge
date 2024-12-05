import { Notification, NOTIFICATIONS_COLLECTION } from 'realtime-server/lib/esm/common/models/notification';
import { JsonRealtimeDoc } from './json-realtime-doc';

export class NotificationDoc extends JsonRealtimeDoc<Notification> {
  static readonly COLLECTION = NOTIFICATIONS_COLLECTION;
}
