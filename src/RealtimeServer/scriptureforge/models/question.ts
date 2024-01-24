import { ProjectData, PROJECT_DATA_INDEX_PATHS } from '../../common/models/project-data';
import { Answer } from './answer';
import { DynamicValue } from './dynamic-value';
import { VerseRefData } from './verse-ref-data';

export const QUESTIONS_COLLECTION = 'questions';
export const QUESTION_INDEX_PATHS: string[] = PROJECT_DATA_INDEX_PATHS;

export function getQuestionDocId(projectId: string, questionId: string): string {
  return `${projectId}:${questionId}`;
}

export interface Question extends ProjectData, DynamicValue {
  dataId: string;
  verseRef: VerseRefData;
  answers: Answer[];
  isArchived: boolean;
  dateArchived?: string;
  dateModified: string;
  dateCreated: string;
  transceleratorQuestionId?: string;
}
