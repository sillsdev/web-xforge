/** The result of the most recent draft build. This is set by the backend when a draft build finishes. */
export enum DraftResult {
  Completed = 'COMPLETED',
  Faulted = 'FAULTED',
  Cancelled = 'CANCELLED'
}
