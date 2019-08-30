import { OwnedData } from '../../common/models/owned-data';
import { Answer } from './answer';
import { VerseRefData } from './verse-ref-data';

export interface Question extends OwnedData {
  id: string;
  scriptureStart?: VerseRefData;
  scriptureEnd?: VerseRefData;
  text?: string;
  audioUrl?: string;
  answers: Answer[];
  isArchived?: boolean;
  dateArchived?: string;
}
