export const NOTIFICATIONS_COLLECTION = 'notifications';

/** Represents a message that can be shown to users */
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

export enum NotificationType {
  Obtrusive = 'Obtrusive',
  Unobtrusive = 'Unobtrusive'
}

export enum NotificationScope {
  Global = 'Global',
  Page = 'Page'
}
