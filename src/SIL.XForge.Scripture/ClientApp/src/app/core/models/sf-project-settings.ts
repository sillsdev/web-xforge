import { CheckingAnswerExport } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';

/**
 * This interface represents the project settings that can be updated using "SFProjectService.onlineUpdateSettings()".
 */
export interface SFProjectSettings {
  translationSuggestionsEnabled?: boolean | null;
  sourceParatextId?: string | null;
  biblicalTermsEnabled?: boolean | null;

  additionalTrainingData?: boolean | null;
  additionalTrainingSourceEnabled?: boolean | null;
  additionalTrainingSourceParatextId?: string | null;
  alternateSourceEnabled?: boolean | null;
  alternateSourceParatextId?: string | null;
  alternateTrainingSourceEnabled?: boolean | null;
  alternateTrainingSourceParatextId?: string | null;
  servalConfig?: string | null;

  checkingEnabled?: boolean | null;
  usersSeeEachOthersResponses?: boolean | null;
  checkingAnswerExport?: CheckingAnswerExport | null;
  hideCommunityCheckingText?: boolean | null;

  translatorsShareEnabled?: boolean | null;
  communityCheckersShareEnabled?: boolean | null;
  commentersShareEnabled?: boolean | null;
  viewersShareEnabled?: boolean | null;
}
