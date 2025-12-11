/** Status options for draft requests. Some are user-selectable, others are system-managed. */
export const DRAFT_REQUEST_STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' }
] as const;

/** Default label for unresolved requests. */
const DEFAULT_RESOLUTION_LABEL = 'Unresolved';

/** Resolution options for draft requests. */
export const DRAFT_REQUEST_RESOLUTION_OPTIONS = [
  { value: null, label: DEFAULT_RESOLUTION_LABEL },
  { value: 'approved', label: 'Approved' },
  { value: 'declined', label: 'Declined' },
  { value: 'outsourced', label: 'Outsourced' }
] as const;

/**
 * Gets the user-friendly label for a draft request status.
 * @param status The status value.
 * @returns The user-friendly label, or the original status if not found.
 */
export function getStatusLabel(status: string): string {
  const option = DRAFT_REQUEST_STATUS_OPTIONS.find(opt => opt.value === status);
  return option?.label ?? status;
}

/**
 * Gets the user-friendly label for a draft request resolution.
 * @param resolution The resolution value.
 * @returns The user-friendly label, or the default label if not found.
 */
export function getResolutionLabel(resolution: string | null): string {
  const option = DRAFT_REQUEST_RESOLUTION_OPTIONS.find(opt => opt.value === resolution);
  return option?.label ?? DEFAULT_RESOLUTION_LABEL;
}
