// Ordered by severity, lowest to highest
export const LynxInsightTypes = ['info', 'warning', 'error'] as const;
export type LynxInsightType = (typeof LynxInsightTypes)[number];

// Ordered from widest to narrowest scope
export const LynxInsightFilterScopes = ['project', 'book', 'chapter'] as const;
export type LynxInsightFilterScope = (typeof LynxInsightFilterScopes)[number];

export const LynxInsightSortOrders = ['severity', 'appearance'] as const;
export type LynxInsightSortOrder = (typeof LynxInsightSortOrders)[number];

export interface LynxInsightFilter {
  types: LynxInsightType[];
  scope: LynxInsightFilterScope;
  includeDismissed?: boolean;
}
