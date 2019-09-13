import { ProjectData } from '../../common/models/project-data';
import { Answer } from './answer';
import { VerseRefData } from './verse-ref-data';

export const QUESTIONS_COLLECTION = 'questions';

export function getQuestionDocId(projectId: string, questionId: string): string {
  return `${projectId}:${questionId}`;
}

export interface Question extends ProjectData {
  dataId: string;
  verseRef: VerseRefData;
  text?: string;
  audioUrl?: string;
  answers: Answer[];
  isArchived: boolean;
  dateArchived?: string;
  dateModified: string;
  dateCreated: string;
}
