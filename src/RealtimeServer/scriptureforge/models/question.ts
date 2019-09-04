import { ProjectData } from '../../common/models/project-data';
import { Answer } from './answer';
import { VerseRefData } from './verse-ref-data';

export const QUESTIONS_COLLECTION = 'questions';

export interface Question extends ProjectData {
  dataId: string;
  scriptureStart: VerseRefData;
  scriptureEnd?: VerseRefData;
  text?: string;
  audioUrl?: string;
  answers: Answer[];
  isArchived: boolean;
  dateArchived?: string;
  dateModified: string;
  dateCreated: string;
}
