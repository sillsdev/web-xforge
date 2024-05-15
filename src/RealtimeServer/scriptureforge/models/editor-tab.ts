export const editorTabTypes = ['history', 'draft', 'project-source', 'project-target', 'project-resource'] as const;
type EditorTabTypes = typeof editorTabTypes;
export type EditorTabType = EditorTabTypes[number];
export type EditorTabGroupType = 'source' | 'target';
