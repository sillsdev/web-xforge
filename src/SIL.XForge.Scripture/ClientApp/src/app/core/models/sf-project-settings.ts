import { CheckingShareLevel } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';
import { TranslateShareLevel } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';

/**
 * This interface represents the project settings that can be updated using "SFProjectService.onlineUpdateSettings()".
 */
export interface SFProjectSettings {
  translationSuggestionsEnabled?: boolean;
  sourceParatextId?: string;
  translateShareEnabled?: boolean;
  translateShareLevel?: TranslateShareLevel;

  checkingEnabled?: boolean;
  usersSeeEachOthersResponses?: boolean;
  checkingShareEnabled?: boolean;
  checkingShareLevel?: CheckingShareLevel;
}
