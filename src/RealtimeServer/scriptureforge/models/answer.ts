import { Comment } from './comment';
import { Like } from './like';
import { VerseRefData } from './verse-ref-data';

export enum AnswerStatus {
  None = '',
  Resolved = 'resolved',
  Exportable = 'export'
}

export interface Answer extends Comment {
  verseRef?: VerseRefData;
  scriptureText?: string;
  selectionStartClipped?: boolean;
  selectionEndClipped?: boolean;
  audioUrl?: string;
  likes: Like[];
  comments: Comment[];
  status?: AnswerStatus;
}
