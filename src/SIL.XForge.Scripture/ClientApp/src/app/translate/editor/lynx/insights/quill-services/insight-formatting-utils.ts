import Delta, { AttributeMap } from 'quill-delta';

/**
 * Minimal insight interface for formatting operations.
 * Used instead of 'LynxInsight' in web worker to avoid importing Angular dependencies to worker.
 */
export interface WorkerLynxInsight {
  id: string;
  type: string;
  range: {
    index: number;
    length: number;
  };
  // Other properties as needed
  [key: string]: any;
}

/**
 * Represents a formatting operation to be applied to text.
 */
export interface FormatOperation {
  typeKey: string;
  index: number;
  length: number;
  formatValue: WorkerLynxInsight[];
}

/**
 * Result of overlap analysis for format operations.
 */
export interface OverlapAnalysis {
  nonOverlapping: FormatOperation[];
  overlappingGroups: FormatOperation[][];
}

/**
 * Analyzes format operations to detect insight range overlaps and group them accordingly.
 */
export function analyzeOverlaps(sortedOps: FormatOperation[]): OverlapAnalysis {
  const nonOverlapping: FormatOperation[] = [];
  const overlappingGroups: FormatOperation[][] = [];

  let currentGroup: FormatOperation[] | null = null;
  let lastEnd: number = -1;

  for (const op of sortedOps) {
    const opStart: number = op.index;
    const opEnd: number = op.index + op.length;

    // Check if this operation overlaps with the previous one
    if (opStart < lastEnd) {
      // Overlapping - ensure we have a group
      if (currentGroup == null) {
        // Start new overlapping group, include the previous non-overlapping op
        const prevOp: FormatOperation | undefined = nonOverlapping.pop();
        currentGroup = prevOp != null ? [prevOp, op] : [op];
      } else {
        currentGroup.push(op);
      }
    } else {
      // Non-overlapping
      if (currentGroup != null) {
        // Close current overlapping group
        overlappingGroups.push(currentGroup);
        currentGroup = null;
      }
      nonOverlapping.push(op);
    }

    lastEnd = Math.max(lastEnd, opEnd);
  }

  // Don't forget the last group if it exists
  if (currentGroup != null) {
    overlappingGroups.push(currentGroup);
  }

  return { nonOverlapping, overlappingGroups };
}

/**
 * Applies non-overlapping operations efficiently by building delta operations directly
 * (not calling `delta.compose()` after each).
 */
export function applyNonOverlappingOperations(baseDelta: Delta, operations: FormatOperation[]): Delta {
  if (operations.length === 0) return baseDelta;

  // Build operations array directly without compose
  const newOps: Array<{ retain: number; attributes?: { [key: string]: any } }> = [];
  let currentIndex: number = 0;

  for (const op of operations) {
    // Add retain operation to reach the operation index
    if (op.index > currentIndex) {
      newOps.push({ retain: op.index - currentIndex });
    }

    // Add the format operation
    newOps.push({
      retain: op.length,
      attributes: { [op.typeKey]: op.formatValue }
    });

    currentIndex = op.index + op.length;
  }

  const directDelta: Delta = new Delta(newOps);
  return baseDelta.compose(directDelta);
}

/**
 * Applies overlapping operations using `delta.compose()` after each.
 * Handles merging of same-type insights in overlapping regions.
 */
export function applyOverlappingGroup(baseDelta: Delta, group: FormatOperation[]): Delta {
  if (group.length === 0) {
    return baseDelta;
  }

  if (group.length === 1) {
    // Single operation, use simple compose
    const operation: FormatOperation = group[0];
    const deltaToApply: Delta = new Delta()
      .retain(operation.index)
      .retain(operation.length, { [operation.typeKey]: operation.formatValue });
    return baseDelta.compose(deltaToApply);
  }

  // For multiple overlapping operations, we need custom merging logic
  // to handle same-type insights properly
  let result: Delta = baseDelta;

  // Apply operations one by one, but with custom attribute merging
  for (const operation of group) {
    const deltaToApply: Delta = new Delta()
      .retain(operation.index)
      .retain(operation.length, { [operation.typeKey]: operation.formatValue });

    // Custom compose that merges insight arrays of the same type
    result = composeWithInsightMerging(result, deltaToApply);
  }

  return result;
}

/**
 * Custom compose function that merges insight arrays when the same insight type
 * appears in overlapping regions, rather than overwriting them.
 */
function composeWithInsightMerging(baseDelta: Delta, otherDelta: Delta): Delta {
  // Check if we need custom merging at all
  const needsMerging: boolean = otherDelta.ops.some(
    op => op.attributes && Object.keys(op.attributes).some(key => key.startsWith('lynx-insight-'))
  );

  if (!needsMerging) {
    return baseDelta.compose(otherDelta);
  }

  // Temporarily override AttributeMap.compose to use our custom merging
  const originalCompose = Delta.AttributeMap.compose;

  try {
    Delta.AttributeMap.compose = (a?: AttributeMap, b?: AttributeMap, keepNull?: boolean) => {
      // Use our custom merging for insight attributes
      const merged: AttributeMap | undefined = mergeInsightAttributes(a, b);

      // For null handling, follow the original logic
      if (!keepNull && merged) {
        // Filter out null/undefined values
        const filtered: any = {};
        for (const key in merged) {
          if (merged[key] != null) {
            filtered[key] = merged[key];
          }
        }
        return filtered;
      }

      return Object.keys(merged || {}).length > 0 ? merged : undefined;
    };

    // Use Delta's standard compose with our custom attribute merging
    return baseDelta.compose(otherDelta);
  } finally {
    // Always restore the original function
    Delta.AttributeMap.compose = originalCompose;
  }
}

/**
 * Merges attributes, with special handling for insight arrays.
 */
function mergeInsightAttributes(
  baseAttrs: AttributeMap | null | undefined,
  otherAttrs: AttributeMap | null | undefined
): AttributeMap | undefined {
  if (baseAttrs == null && otherAttrs == null) {
    return undefined;
  }

  if (baseAttrs == null) {
    return { ...otherAttrs };
  }

  if (otherAttrs == null) {
    return { ...baseAttrs };
  }

  const merged: AttributeMap = { ...baseAttrs };

  for (const key in otherAttrs) {
    if (key.startsWith('lynx-insight-') && merged[key] != null) {
      // Merge insight arrays - ensure both are arrays
      const baseInsights: WorkerLynxInsight[] = Array.isArray(merged[key])
        ? (merged[key] as WorkerLynxInsight[])
        : [merged[key] as WorkerLynxInsight];
      const otherInsights: WorkerLynxInsight[] = Array.isArray(otherAttrs[key])
        ? (otherAttrs[key] as WorkerLynxInsight[])
        : [otherAttrs[key] as WorkerLynxInsight];

      // Deduplicate by insight id and merge
      const seenIds = new Set(baseInsights.map((insight: WorkerLynxInsight) => insight.id));
      const newInsights = otherInsights.filter((insight: WorkerLynxInsight) => !seenIds.has(insight.id));

      merged[key] = [...baseInsights, ...newInsights];
    } else {
      // For non-insight attributes or when base doesn't have this key, use other's value
      merged[key] = otherAttrs[key];
    }
  }

  return merged;
}

/**
 * Main processing function that applies format operations efficiently.
 * Handles both overlapping and non-overlapping operations optimally.
 */
export function processFormatOperations(baseDelta: Delta, formatOperations: FormatOperation[]): Delta {
  // Sort operations by index for overlap detection
  const sortedOps: FormatOperation[] = [...formatOperations].sort((a, b) => a.index - b.index);

  // Detect and group overlapping operations - overlapping insights need 'delta.compose()' after each
  // in order for quill to process them correctly
  const { nonOverlapping, overlappingGroups } = analyzeOverlaps(sortedOps);

  let delta: Delta = baseDelta;

  // Process non-overlapping operations efficiently (no 'delta.compose()' needed)
  if (nonOverlapping.length > 0) {
    delta = applyNonOverlappingOperations(delta, nonOverlapping);
  }

  // Process overlapping groups - each group gets applied with insight merging
  for (const group of overlappingGroups) {
    // Apply the group to a clean delta, then merge with accumulated result
    const cleanBaseDelta = new Delta().retain(delta.length());
    const groupDelta: Delta = applyOverlappingGroup(cleanBaseDelta, group);
    delta = composeWithInsightMerging(delta, groupDelta);
  }

  return delta;
}
