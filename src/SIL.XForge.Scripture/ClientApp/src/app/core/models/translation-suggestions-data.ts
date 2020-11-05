import { FeatureOfflineData } from 'xforge-common/models/feature-offline-data';

export const FEATURE_TRANSLATION = 'feature_translation';

/**
 * Data that can be stored in browser storage and used to train edited segments while offline
 */
export interface TranslationSuggestionsData extends FeatureOfflineData {
  bookNum: number;
  chapterNum: number;
  pendingTrainingSegments: string[];
}
