export enum CheckingAnswerExport {
  All = 'all',
  MarkedForExport = 'marked_for_export',
  None = 'none'
}

export interface CheckingConfig {
  checkingEnabled: boolean;
  usersSeeEachOthersResponses: boolean;
  shareEnabled: boolean;
  answerExportMethod: CheckingAnswerExport;
}
