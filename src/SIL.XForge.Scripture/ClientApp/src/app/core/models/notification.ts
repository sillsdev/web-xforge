import { NotificationScope, NotificationType } from '../notification.service';

/** Message to user. */
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
