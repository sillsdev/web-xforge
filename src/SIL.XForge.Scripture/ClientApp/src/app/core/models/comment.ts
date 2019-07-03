import { VerseRefData } from './verse-ref-data';

export interface Comment {
  id: string;
  ownerRef: string;
  projectRef: string;
  syncUserRef?: string;
  answerRef?: string;
  scriptureStart?: VerseRefData;
  scriptureEnd?: VerseRefData;
  text?: string;
  audioUrl?: string;
  dateModified: string;
  dateCreated: string;
}
