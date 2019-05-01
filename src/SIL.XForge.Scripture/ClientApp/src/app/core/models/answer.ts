import { VerseRefData } from './verse-ref-data';
import { UserRef } from 'xforge-common/models/user';

export interface Answer {
  id: string;
  ownerRef: string;
  scriptureStart?: VerseRefData;
  scriptureEnd?: VerseRefData;
  text?: string;
  audioUrl?: string;
  likes: string[];
}
