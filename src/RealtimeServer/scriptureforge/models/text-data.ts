import { DeltaOperation } from 'rich-text';

export const TEXTS_COLLECTION = 'texts';

export interface TextData {
  ops: DeltaOperation[];
}
