import { EditorTabGroupType, EditorTabType } from './editor-tab';

/**
 * Minimal data to persist and reconstruct an editor tab.
 */
export interface EditorTabPersistData {
  tabType: EditorTabType;
  groupId: EditorTabGroupType;
  isSelected?: boolean;

  /**
   * The SF project id if tab is a project/resource tab.
   */
  projectId?: string;
}
