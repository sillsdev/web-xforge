import { DeltaOperation } from 'rich-text';
import { Canon } from '@sillsdev/scripture';

export const TEXTS_COLLECTION = 'texts';
export const TEXT_INDEX_PATHS: string[] = [];

export type TextType = 'source' | 'target';

export function getTextDocId(projectId: string, book: number, chapter: number, textType: TextType = 'target'): string {
  return `${projectId}:${Canon.bookNumberToId(book)}:${chapter}:${textType}`;
}

export interface TextData {
  ops?: DeltaOperation[];
}
