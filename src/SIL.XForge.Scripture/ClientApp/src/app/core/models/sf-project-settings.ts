import { CheckingAnswerExport } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';

/**
 * This interface represents the project settings that can be updated using "SFProjectService.onlineUpdateSettings()".
 */
export interface SFProjectSettings {
  translationSuggestionsEnabled?: boolean;
  sourceParatextId?: string;
  translateShareEnabled?: boolean;

  checkingEnabled?: boolean;
  usersSeeEachOthersResponses?: boolean;
  checkingShareEnabled?: boolean;
  checkingAnswerExport?: CheckingAnswerExport;
}
