export const DEFAULT_TAG_ICON = '01flag1';
export const SF_TAG_ICON = '06star2';
export const SF_TAG_NAME = 'Scripture Forge Note';

export interface NoteTag {
  tagId: number;
  name: string;
  icon: string;
  creatorResolve: boolean;
}
