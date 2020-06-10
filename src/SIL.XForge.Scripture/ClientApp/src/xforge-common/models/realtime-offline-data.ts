import { OfflineData } from '../offline-store';
import { Snapshot } from './snapshot';

/**
 * The model for a snapshot that is stored in the offline store.
 */
export interface RealtimeOfflineData extends OfflineData, Snapshot {
  pendingOps: any[];
}
