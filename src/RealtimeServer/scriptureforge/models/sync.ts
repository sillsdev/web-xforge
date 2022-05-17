export interface Sync {
  queuedCount: number;
  percentCompleted?: number;
  lastSyncSuccessful?: boolean;
  dateLastSuccessfulSync?: string;
  syncedToRepositoryVersion?: string;
  /** Indicates if PT project data from the last send/receive operation was incorporated into the SF project docs */
  dataInSync?: boolean;
}
