import { LynxInsight } from './lynx-insight';

/**
 * Gets the insight that has the earliest range start.
 */
export function getLeadingInsight(insights: LynxInsight[]): LynxInsight | undefined {
  return insights.sort((a, b) => a.range.index - b.range.index)[0];
}

/**
 * Gets the insight that has the earliest range end.  This is the insight that the action prompt with be anchored to.
 */
export function getMostNestedInsight(insights: LynxInsight[]): LynxInsight | undefined {
  return insights.sort((a, b) => a.range.index + a.range.length - (b.range.index + b.range.length))[0];
}
