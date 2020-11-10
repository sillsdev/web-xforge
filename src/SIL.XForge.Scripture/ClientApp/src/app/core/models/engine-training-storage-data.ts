import { OfflineData } from 'xforge-common/offline-store';

export const FEATURE_TRANSLATION = 'feature_translation';

/**
 * Data that can be stored in browser storage and used to train edited segments while offline
 */
export interface EngineTrainingStorageData extends OfflineData {
  projectRef: string;
  bookNum: number;
  chapterNum: number;
  segment: string;
}
