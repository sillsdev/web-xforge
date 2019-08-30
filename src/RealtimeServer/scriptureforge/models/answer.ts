import { Comment } from './comment';
import { Like } from './like';
import { VerseRefData } from './verse-ref-data';

export interface Answer extends Comment {
  scriptureStart?: VerseRefData;
  scriptureEnd?: VerseRefData;
  scriptureText?: string;
  audioUrl?: string;
  likes: Like[];
  comments: Comment[];
}
