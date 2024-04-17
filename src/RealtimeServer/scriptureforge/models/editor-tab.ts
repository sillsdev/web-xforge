export const editorTabTypes = ['history', 'draft', 'project-source', 'project'] as const;
export type EditorTabType =  typeof editorTabTypes[number];
export type EditorTabGroupType = 'source' | 'target';
