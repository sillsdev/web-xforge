import { ProjectData } from '../../common/models/project-data';

export const SF_PROJECT_USER_CONFIGS_COLLECTION = 'sf_project_user_configs';

export function getSFProjectUserConfigDocId(projectId: string, userId: string): string {
  return `${projectId}:${userId}`;
}

export interface SFProjectUserConfig extends ProjectData {
  selectedTask?: string;
  selectedBookNum?: number;
  selectedChapterNum?: number;
  isTargetTextRight: boolean;
  confidenceThreshold: number;
  translationSuggestionsEnabled: boolean;
  selectedSegment: string;
  selectedSegmentChecksum?: number;
  questionRefsRead: string[];
  answerRefsRead: string[];
  commentRefsRead: string[];
}
