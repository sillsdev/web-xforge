import { WritingSystem } from '../../common/models/writing-system';

export enum TranslateShareLevel {
  Anyone = 'anyone',
  Specific = 'specific'
}

export interface TranslateConfig {
  translationSuggestionsEnabled: boolean;
  source?: TranslateSource;
  shareEnabled: boolean;
  shareLevel: TranslateShareLevel;
}

export interface TranslateSource {
  paratextId: string;
  projectRef: string;
  name: string;
  shortName: string;
  writingSystem: WritingSystem;
  isRightToLeft?: boolean;
}
