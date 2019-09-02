import { CheckingShareLevel } from 'realtime-server/lib/scriptureforge/models/checking-config';

/**
 * This interface represents the project settings that can be updated using "SFProjectService.onlineUpdateSettings()".
 */
export interface SFProjectSettings {
  translationSuggestionsEnabled?: boolean;
  sourceParatextId?: string;

  checkingEnabled?: boolean;
  usersSeeEachOthersResponses?: boolean;
  shareEnabled?: boolean;
  shareLevel?: CheckingShareLevel;
}
