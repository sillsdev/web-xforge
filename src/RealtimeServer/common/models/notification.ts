import { NotificationScope } from './notification-scope';
import { NotificationType } from './notification-type';

export const NOTIFICATIONS_COLLECTION = 'notifications';

/** Represents a notification that can be shown to users */
export interface Notification {
  id: string;
  title: string;
  content: string;
  type: NotificationType;
  scope: NotificationScope;
  pageIds?: string[];
  expirationDate: string;
  creationDate: string;
}
