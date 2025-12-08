import { PROJECT_DATA_INDEX_PATHS, ProjectData } from '../../common/models/project-data';
import { obj } from '../../common/utils/obj-path';
import { Answer } from './answer';
import { VerseRefData } from './verse-ref-data';

export const QUESTIONS_COLLECTION = 'questions';
export const QUESTION_INDEX_PATHS = [
  ...PROJECT_DATA_INDEX_PATHS,
  // Index for CheckingQuestionsService.queryQuestions() and CheckingQuestionsService.queryAdjacentQuestions()
  {
    [obj<Question>().pathStr(n => n.projectRef)]: 1,
    [obj<Question>().pathStr(n => n.isArchived)]: 1,
    [obj<Question>().pathStr(n => n.verseRef.bookNum)]: 1,
    [obj<Question>().pathStr(n => n.verseRef.chapterNum)]: 1
  }
];

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
  transceleratorQuestionId?: string;
}
