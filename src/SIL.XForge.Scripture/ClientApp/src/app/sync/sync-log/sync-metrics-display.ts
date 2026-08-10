/** One entry of a project's sync history, as returned by the syncMetrics RPC method. */
export interface SyncMetricsDisplay {
  id: string;
  dateQueued: string;
  dateStarted?: string;
  dateFinished?: string;
  status: SyncMetricsStatus;
  userRef?: string;
  /** The details of the error that caused the sync to fail. Only provided to serval and system administrators. */
  errorDetails?: string;
}

export enum SyncMetricsStatus {
  Queued = 'Queued',
  Running = 'Running',
  Successful = 'Successful',
  Cancelled = 'Cancelled',
  Failed = 'Failed'
}
