import { PROJECT_DATA_INDEX_PATHS, ProjectData } from '../../common/models/project-data';
import { EditorTabPersistData } from './editor-tab-persist-data';
import { LynxUserConfig } from './lynx-config';
import { LynxInsightUserData } from './lynx-insight-user-data';

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
  selectedBiblicalTermsCategory?: string;
  selectedBiblicalTermsFilter?: string;
  isTargetTextRight: boolean;
  confidenceThreshold: number;
  biblicalTermsEnabled?: boolean;
  transliterateBiblicalTerms: boolean;
  translationSuggestionsEnabled: boolean;
  numSuggestions: number;
  selectedSegment: string;
  selectedSegmentChecksum?: number;
  noteRefsRead: string[];
  questionRefsRead: string[];
  answerRefsRead: string[];
  commentRefsRead: string[];
  editorTabsOpen: EditorTabPersistData[];
  lynxInsightState: LynxInsightUserData;
  lynxUserConfig: LynxUserConfig;
}
