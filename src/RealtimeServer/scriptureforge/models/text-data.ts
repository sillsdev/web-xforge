import { DeltaOperation } from 'rich-text';
import { Canon } from '../scripture-utils/canon';

export const TEXTS_COLLECTION = 'texts';

export type TextType = 'source' | 'target';

export function getTextDocId(projectId: string, book: number, chapter: number, textType: TextType = 'target'): string {
  return `${projectId}:${Canon.bookNumberToId(book)}:${chapter}:${textType}`;
}

export interface TextData {
  ops?: DeltaOperation[];
}
