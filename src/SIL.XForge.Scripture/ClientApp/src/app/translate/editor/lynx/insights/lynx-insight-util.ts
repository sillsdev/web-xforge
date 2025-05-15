import { LynxInsight } from './lynx-insight';

/**
 * Gets the insight that has the earliest range start.
 */
export function getLeadingInsight(insights: LynxInsight[]): LynxInsight | undefined {
  if (insights.length === 0) {
    return undefined;
  }

  return [...insights].sort((a, b) => a.range.index - b.range.index)[0];
}

/**
 * Gets the insight that has the earliest range end.  This is the insight that the action prompt with be anchored to.
 * When end positions are the same, the insight with the inner starting position should be preferred.
 */
export function getMostNestedInsight(insights: LynxInsight[]): LynxInsight | undefined {
  if (insights.length === 0) {
    return undefined;
  }

  return [...insights].sort((a, b) => {
    const aEnd = a.range.index + a.range.length;
    const bEnd = b.range.index + b.range.length;

    // If end positions are the same, prefer the insight with inner (later) starting position
    if (aEnd === bEnd) {
      // Reverse the comparison to prefer higher start index
      return b.range.index - a.range.index;
    }

    // Otherwise sort by end position
    return aEnd - bEnd;
  })[0];
}
