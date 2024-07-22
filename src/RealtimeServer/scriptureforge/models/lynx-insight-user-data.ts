import { LynxInsightFilter, LynxInsightSortOrder } from './lynx-insight';

export interface LynxInsightUserData {
  panelData?: LynxInsightPanelUserData;
  dismissedInsightIds?: string[];
}

export interface LynxInsightPanelUserData {
  isOpen: boolean;
  filter: LynxInsightFilter;
  sortOrder: LynxInsightSortOrder;
}
