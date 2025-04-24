import { InjectionToken } from '@angular/core';
import { Op } from 'quill';
import {
  LynxInsightFilter,
  LynxInsightSortOrder,
  LynxInsightType
} from 'realtime-server/lib/esm/scriptureforge/models/lynx-insight';
import { TextDocId } from '../../../../core/models/text-doc';

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

export interface LynxInsight {
  id: string;
  type: LynxInsightType;
  textDocId: TextDocId;
  range: LynxInsightRange;
  code: string;
  source: string;
  data?: unknown;
  description: string;
  moreInfo?: string; // Verbose information about the insight (markdown?)
}

export interface LynxInsightNode {
  code: string;
  children?: LynxInsight[];
}

export interface LynxInsightConfig {
  filter: LynxInsightFilter;
  sortOrder: LynxInsightSortOrder;
  queryParamName: string;
  /** The link text length as an approximate goal.  Actual may be slightly smaller or larger due to word boundaries. */
  panelLinkTextGoalLength: number;
  actionOverlayApplyPrimaryActionChord: Partial<KeyboardEvent>;
}

export interface LynxInsightAction {
  id: string;
  insight: LynxInsight;
  label: string;
  description?: string;
  isPrimary?: boolean;
  ops: Op[];
}

export const EDITOR_INSIGHT_DEFAULTS = new InjectionToken<LynxInsightConfig>('EDITOR_INSIGHT_DEFAULTS', {
  providedIn: 'root',
  factory: () => ({
    filter: { types: ['info', 'warning', 'error'], scope: 'chapter' },
    sortOrder: 'severity',
    queryParamName: 'insight',
    panelLinkTextGoalLength: 30,
    actionOverlayApplyPrimaryActionChord: { altKey: true, shiftKey: true, key: 'Enter' }
  })
});
