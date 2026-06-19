/**
 * Computes which training data files should be selected by default when the new draft wizard opens.
 *
 * The intent:
 * - Files used at the last build (and still present) start selected.
 * - Newly added files (present now, but not offered at the last build) start selected.
 * - Files that were offered at the last build but not used start deselected (the user deliberately excluded them).
 *
 * Distinguishing a newly added file from a deliberately deselected one requires knowing which files were available
 * at the last build (`lastAvailableFileIds`). Builds made before that was recorded won't have it, so we fall back to
 * following the last selection if one exists, or selecting everything when there is no prior selection at all.
 *
 * The returned list preserves the order of `currentFileIds`.
 */
export function defaultSelectedTrainingDataFiles(
  currentFileIds: string[],
  lastSelectedFileIds: string[] | undefined,
  lastAvailableFileIds: string[] | undefined
): string[] {
  const lastSelected = new Set(lastSelectedFileIds ?? []);

  if (lastAvailableFileIds != null) {
    // New format: we know what was offered last time, so we can tell newly added files apart from deselected ones.
    const lastAvailable = new Set(lastAvailableFileIds);
    return currentFileIds.filter(id => lastSelected.has(id) || !lastAvailable.has(id));
  }

  // Legacy fallback: no record of what was offered last time.
  if (lastSelected.size > 0) {
    return currentFileIds.filter(id => lastSelected.has(id));
  }
  return [...currentFileIds];
}
