import { CheckingAnswerExport } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';

/**
 * This interface represents the project settings that can be updated using "SFProjectService.onlineUpdateSettings()".
 */
export interface SFProjectSettings {
  translationSuggestionsEnabled?: boolean | null;
  sourceParatextId?: string | null;
  biblicalTermsEnabled?: boolean | null;
  translateShareEnabled?: boolean | null;

  alternateSourceParatextId?: string | null;

  checkingEnabled?: boolean | null;
  usersSeeEachOthersResponses?: boolean | null;
  checkingShareEnabled?: boolean | null;
  checkingAnswerExport?: CheckingAnswerExport | null;
  hideCommunityCheckingText?: boolean | null;
}
