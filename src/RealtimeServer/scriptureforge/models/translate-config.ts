import { WritingSystem } from '../../common/models/writing-system';

export interface TranslateConfig {
  translationSuggestionsEnabled: boolean;
  source?: TranslateSource;
  shareEnabled: boolean;
}

export interface TranslateSource {
  paratextId: string;
  projectRef: string;
  name: string;
  shortName: string;
  writingSystem: WritingSystem;
  isRightToLeft?: boolean;
}
