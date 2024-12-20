export interface EventMetric {
  id: string;
  eventType: string;
  payload: { [key: string]: any };
  projectId?: string;
  scope: EventScope;
  timeStamp: Date;
  userId?: string;
}

export enum EventScope {
  None = 'None',
  Settings = 'Settings',
  Sync = 'Sync',
  Drafting = 'Drafting',
  Checking = 'Checking'
}
