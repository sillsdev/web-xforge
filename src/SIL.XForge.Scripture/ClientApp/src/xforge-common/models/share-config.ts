export enum ShareLevel {
  Anyone = 'anyone',
  Specific = 'specific'
}

export interface ShareConfig {
  enabled?: boolean;
  level?: ShareLevel;
}
