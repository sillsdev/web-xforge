import { TabInfo } from '../../../shared/tab-state/tab-state.service';

export type EditorTabGroupType = 'source' | 'target';

export const editorTabTypes = ['history', 'draft', 'project-source', 'project'] as const;
export type EditorTabType = (typeof editorTabTypes)[number];

export interface EditorTabInfo extends TabInfo<EditorTabType> {
  /**
   * If set, only a single instance of this tab is allowed with uniqueness determined by tab type and projectId.
   */
  unique?: boolean;
}
