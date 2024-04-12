export const editorTabTypes = ['history', 'draft', 'project-source', 'project'] as const;
export type EditorTabType = typeof editorTabTypes[number];
export type EditorTabGroupType = 'source' | 'target';

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
