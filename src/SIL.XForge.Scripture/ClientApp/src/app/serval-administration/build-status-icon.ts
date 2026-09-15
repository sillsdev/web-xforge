/**
 * The Material icon for a build status, so that a build's state looks the same on every Serval administration page.
 * Accepts both the Serval build states ('COMPLETED') and the draft generation request statuses ('Completed').
 */
export function buildStatusIcon(status: string): string {
  switch (status.toLowerCase()) {
    case 'userrequested':
    case 'submittedtoserval':
    case 'queued':
    case 'pending':
    case 'active':
    case 'finishing':
      return 'hourglass_top';
    case 'completed':
      return 'done';
    case 'faulted':
      return 'error';
    case 'canceled':
      return 'cancel';
    default:
      return 'help';
  }
}
