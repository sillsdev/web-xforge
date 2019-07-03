import { Like } from './like';
import { VerseRefData } from './verse-ref-data';

export interface Answer {
  id: string;
  ownerRef: string;
  syncUserRef?: string;
  scriptureStart?: VerseRefData;
  scriptureEnd?: VerseRefData;
  text?: string;
  audioUrl?: string;
  likes: Like[];
  dateModified: string;
  dateCreated: string;
}
