import { PROJECT_DATA_INDEX_PATHS, ProjectData } from '../../common/models/project-data';

export const SF_PROJECT_USER_CONFIGS_COLLECTION = 'sf_project_user_configs';
export const SF_PROJECT_USER_CONFIG_INDEX_PATHS: string[] = PROJECT_DATA_INDEX_PATHS;

export function getSFProjectUserConfigDocId(projectId: string, userId: string): string {
  return `${projectId}:${userId}`;
}

export interface SFProjectUserConfig extends ProjectData {
  selectedTask?: string;
  selectedQuestionRef?: string;
  selectedBookNum?: number;
  selectedChapterNum?: number;
  isTargetTextRight: boolean;
  confidenceThreshold: number;
  translationSuggestionsEnabled: boolean;
  numSuggestions: number;
  selectedSegment: string;
  selectedSegmentChecksum?: number;
  noteRefsRead: string[];
  questionRefsRead: string[];
  answerRefsRead: string[];
  commentRefsRead: string[];
}
