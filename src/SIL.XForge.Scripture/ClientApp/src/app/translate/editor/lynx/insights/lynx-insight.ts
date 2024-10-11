import { InjectionToken } from '@angular/core';

export interface LynxInsightRange {
  index: number;
  length: number;
}

// Ordered by severity, lowest to highest
export const LynxInsightTypes = ['info', 'warning', 'error'] as const;
export type LynxInsightType = (typeof LynxInsightTypes)[number];

// Interface whose props are all boolean or undefined
export interface LynxInsightDisplayState {
  promptActive?: boolean;
  actionMenuActive?: boolean;
  cursorActive?: boolean;
}

// TODO: include something like TextDocId?
export interface LynxInsight {
  id: string;
  type: LynxInsightType;
  chapter: number;
  book: number;
  range: LynxInsightRange;
  code: string;
  displayState?: LynxInsightDisplayState;
}

export interface LynxInsightNode {
  code: string;
  children?: LynxInsight[];
}

// Ordered from widest to narrowest scope
export const LynxInsightFilterScopes = ['project', 'book', 'chapter'] as const;
export type LynxInsightFilterScope = (typeof LynxInsightFilterScopes)[number];

export const LynxInsightSortOrders = ['severity', 'appearance'] as const;
export type LynxInsightSortOrder = (typeof LynxInsightSortOrders)[number];

export interface LynxInsightFilter {
  types: LynxInsightType[];
  scope: LynxInsightFilterScope;
}

export interface LynxInsightConfig {
  filter: LynxInsightFilter;
  sortOrder: LynxInsightSortOrder;
  queryParamName: string;
  panelLinkTextMaxLength: number;
}

export const EDITOR_INSIGHT_DEFAULTS = new InjectionToken<LynxInsightConfig>('EDITOR_INSIGHT_DEFAULTS', {
  providedIn: 'root',
  factory: () => ({
    filter: { types: ['info', 'warning', 'error'], scope: 'chapter' },
    sortOrder: 'severity',
    queryParamName: 'insight',
    panelLinkTextMaxLength: 30
  })
});
