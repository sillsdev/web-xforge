// Editor tab types
export const editorTabTypes = [
  'biblical-terms',
  'blank-tab',
  'history',
  'draft',
  'project-source',
  'project-target',
  'project-resource'
] as const;
type EditorTabTypes = typeof editorTabTypes;
export type EditorTabType = EditorTabTypes[number];

// Editor tab group types
export const editorTabGroupTypes = ['source', 'target'] as const;
type EditorTabGroupTypes = typeof editorTabGroupTypes;
export type EditorTabGroupType = EditorTabGroupTypes[number];
