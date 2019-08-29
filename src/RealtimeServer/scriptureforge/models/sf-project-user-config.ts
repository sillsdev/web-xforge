import { OwnedData } from '../../common/models/owned-data';

export const SF_PROJECT_USER_CONFIGS_COLLECTION = 'sf_project_user_configs';

export interface SFProjectUserConfig extends OwnedData {
  selectedTask?: string;
  selectedBookId?: string;
  selectedChapter?: number;
  isTargetTextRight?: boolean;
  confidenceThreshold?: number;
  translationSuggestionsEnabled?: boolean;
  selectedSegment?: string;
  selectedSegmentChecksum?: number;
  questionRefsRead?: string[];
  answerRefsRead?: string[];
  commentRefsRead?: string[];
}
