export interface Sync {
  queuedCount: number;
  percentCompleted?: number;
  lastSyncSuccessful?: boolean;
  dateLastSuccessfulSync?: string;
  dataInSync?: boolean;
}
