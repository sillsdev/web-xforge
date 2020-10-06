import { WritingSystem } from '../../common/models/writing-system';

export interface TranslateConfig {
  translationSuggestionsEnabled: boolean;
  source?: TranslateSource;
}

export interface TranslateSource {
  paratextId: string;
  name: string;
  shortName: string;
  writingSystem: WritingSystem;
  isRightToLeft?: boolean;
}
