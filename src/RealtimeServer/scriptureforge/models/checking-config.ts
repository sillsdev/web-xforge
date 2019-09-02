export enum CheckingShareLevel {
  Anyone = 'anyone',
  Specific = 'specific'
}

export interface CheckingConfig {
  checkingEnabled: boolean;
  usersSeeEachOthersResponses: boolean;
  shareEnabled: boolean;
  shareLevel: CheckingShareLevel;
}
