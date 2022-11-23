export enum CheckingShareLevel {
  Anyone = 'anyone',
  Specific = 'specific'
}

export enum CheckingAnswerExport {
  All = 'all',
  MarkedForExport = 'marked_for_export',
  None = 'none'
}

export interface CheckingConfig {
  checkingEnabled: boolean;
  usersSeeEachOthersResponses: boolean;
  shareEnabled: boolean;
  shareLevel: CheckingShareLevel;
  answerExportMethod: CheckingAnswerExport;
}
