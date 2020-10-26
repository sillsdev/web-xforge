import { OfflineData } from 'xforge-common/offline-store';

export const EDITED_SEGMENTS = 'edited_segments';

/**
 * Data that can be stored in browser storage and used to train edited segments while offline
 */
export interface EditedSegmentData extends OfflineData {
  projectRef: string;
  sourceProjectRef: string;
  bookNum: number;
  chapterNum: number;
  segment: string;
}
