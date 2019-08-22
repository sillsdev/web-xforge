import { OwnedData } from '../../common/models/owned-data';
import { VerseRefData } from './verse-ref-data';

export interface Comment extends OwnedData {
  id: string;
  syncUserRef?: string;
  answerRef?: string;
  scriptureStart?: VerseRefData;
  scriptureEnd?: VerseRefData;
  text?: string;
  audioUrl?: string;
  dateModified: string;
  dateCreated: string;
}
