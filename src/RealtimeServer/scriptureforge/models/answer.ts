import { Comment } from './comment';
import { Like } from './like';
import { TextAudioValue } from './text-audio-value';
import { VerseRefData } from './verse-ref-data';

export enum AnswerStatus {
  None = '',
  Resolved = 'resolved',
  Exportable = 'export'
}

export interface Answer extends Comment, TextAudioValue {
  verseRef?: VerseRefData;
  scriptureText?: string;
  selectionStartClipped?: boolean;
  selectionEndClipped?: boolean;
  likes: Like[];
  comments: Comment[];
  status?: AnswerStatus;
}
