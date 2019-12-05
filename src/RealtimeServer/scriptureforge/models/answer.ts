import { Comment } from './comment';
import { Like } from './like';
import { VerseRefData } from './verse-ref-data';

export interface Answer extends Comment {
  verseRef?: VerseRefData;
  scriptureText?: string;
  selectionStartClipped?: boolean;
  selectionEndClipped?: boolean;
  audioUrl?: string;
  likes: Like[];
  comments: Comment[];
}
