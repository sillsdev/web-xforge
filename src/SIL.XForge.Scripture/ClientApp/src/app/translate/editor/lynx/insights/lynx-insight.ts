import { InjectionToken } from '@angular/core';
import {
  LynxInsightFilter,
  LynxInsightSortOrder,
  LynxInsightType
} from 'realtime-server/lib/esm/scriptureforge/models/lynx-insight';

export interface LynxInsightRange {
  index: number;
  length: number;
}

// Interface whose props are all boolean or undefined
export interface LynxInsightDisplayState {
  /** State on click. */
  activeInsightIds: string[];
  promptActive?: boolean;
  actionOverlayActive?: boolean;
  /** State on hover or keyboard caret over. */
  cursorActiveInsightIds: string[];
}

// TODO: include something like TextDocId?
export interface LynxInsight {
  id: string;
  type: LynxInsightType;
  chapter: number;
  book: number;
  range: LynxInsightRange;
  code: string;
}

export interface LynxInsightNode {
  code: string;
  children?: LynxInsight[];
}

export interface LynxInsightConfig {
  filter: LynxInsightFilter;
  sortOrder: LynxInsightSortOrder;
  queryParamName: string;
  panelLinkTextMaxLength: number;
  actionOverlayApplyPrimaryActionChord: Partial<KeyboardEvent>;
}

export const EDITOR_INSIGHT_DEFAULTS = new InjectionToken<LynxInsightConfig>('EDITOR_INSIGHT_DEFAULTS', {
  providedIn: 'root',
  factory: () => ({
    filter: { types: ['info', 'warning', 'error'], scope: 'chapter' },
    sortOrder: 'severity',
    queryParamName: 'insight',
    panelLinkTextMaxLength: 30,
    actionOverlayApplyPrimaryActionChord: { altKey: true, shiftKey: true, key: 'Enter' }
  })
});
