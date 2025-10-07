import { CheckingAnswerExport } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';

/**
 * This interface represents the project settings that can be updated using "SFProjectService.onlineUpdateSettings()".
 */
export interface SFProjectSettings {
  translationSuggestionsEnabled?: boolean | null;
  sourceParatextId?: string | null;
  biblicalTermsEnabled?: boolean | null;

  /* DraftSourcesSettingsChange */
  additionalTrainingDataFiles?: string[] | null;
  draftingSourcesParatextIds?: string[] | null;
  trainingSourcesParatextIds?: string[] | null;

  checkingEnabled?: boolean | null;
  usersSeeEachOthersResponses?: boolean | null;
  checkingAnswerExport?: CheckingAnswerExport | null;
  hideCommunityCheckingText?: boolean | null;

  translatorsShareEnabled?: boolean | null;
  communityCheckersShareEnabled?: boolean | null;
  commentersShareEnabled?: boolean | null;
  viewersShareEnabled?: boolean | null;

  lynxAutoCorrectionsEnabled?: boolean | null;
  lynxAssessmentsEnabled?: boolean | null;
  lynxPunctuationCheckerEnabled?: boolean | null;
  lynxAllowedCharacterCheckerEnabled?: boolean | null;
}
