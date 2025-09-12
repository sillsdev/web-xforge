import { LynxInsightFilter, LynxInsightSortOrder } from './lynx-insight';

export interface LynxInsightUserData {
  autoCorrectionsEnabled?: boolean;
  assessmentsEnabled?: boolean;
  panelData?: LynxInsightPanelUserData;
}

export interface LynxInsightPanelUserData {
  isOpen: boolean;
  filter: LynxInsightFilter;
  sortOrder: LynxInsightSortOrder;
}
