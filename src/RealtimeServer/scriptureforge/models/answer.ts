import { Comment } from './comment';
import { DynamicValue } from './dynamic-value';
import { Like } from './like';
import { VerseRefData } from './verse-ref-data';

export enum AnswerStatus {
  None = '',
  Resolved = 'resolved',
  Exportable = 'export'
}

export interface Answer extends Comment, DynamicValue {
  verseRef?: VerseRefData;
  scriptureText?: string;
  selectionStartClipped?: boolean;
  selectionEndClipped?: boolean;
  likes: Like[];
  comments: Comment[];
  status?: AnswerStatus;
}
