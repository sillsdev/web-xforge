export interface EventMetric {
  eventType: string;
  exception?: string;
  id: string;
  payload: { [key: string]: any };
  projectId?: string;
  result?: any;
  scope: EventScope;
  timeStamp: string;
  userId?: string;
}

export enum EventScope {
  None = 'None',
  Settings = 'Settings',
  Sync = 'Sync',
  Drafting = 'Drafting',
  Checking = 'Checking'
}
