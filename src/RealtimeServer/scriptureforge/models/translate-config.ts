import { WritingSystem } from '../../common/models/writing-system';

export enum ProjectType {
  Standard = 'Standard',
  BackTranslation = 'BackTranslation',
  Daughter = 'Daughter',
  Transliteration = 'Transliteration',
  TransliterationManual = 'TransliterationManual',
  TransliterationWithEncoder = 'TransliterationWithEncoder',
  StudyBible = 'StudyBible',
  ConsultantNotes = 'ConsultantNotes',
  StudyBibleAdditions = 'StudyBibleAdditions',
  Auxiliary = 'Auxiliary',
  Xml = 'Xml',
  SourceLanguage = 'SourceLanguage',
  Dictionary = 'Dictionary',
  EnhancedResource = 'EnhancedResource'
}

export enum TranslateShareLevel {
  Anyone = 'anyone',
  Specific = 'specific'
}

export interface BaseProject {
  paratextId: string;
  shortName: string;
}

/**
 * A per-project scripture range.
 */
export interface ProjectScriptureRange {
  projectId: string;
  scriptureRange: string;
}

export interface DraftConfig {
  additionalTrainingData: boolean;
  additionalTrainingSourceEnabled: boolean;
  additionalTrainingSource?: TranslateSource;
  alternateSourceEnabled: boolean;
  alternateSource?: TranslateSource;
  alternateTrainingSourceEnabled: boolean;
  alternateTrainingSource?: TranslateSource;
  lastSelectedTrainingBooks: number[];
  lastSelectedTrainingDataFiles: string[];
  lastSelectedTrainingScriptureRange?: string;
  lastSelectedTrainingScriptureRanges?: ProjectScriptureRange[];
  lastSelectedTranslationBooks: number[];
  lastSelectedTranslationScriptureRange?: string;
  lastSelectedTranslationScriptureRanges?: ProjectScriptureRange[];
  servalConfig?: string;
}

export interface TranslateConfig {
  translationSuggestionsEnabled: boolean;
  source?: TranslateSource;
  defaultNoteTagId?: number;
  preTranslate: boolean;
  draftConfig: DraftConfig;
  projectType?: ProjectType;
  baseProject?: BaseProject;
}

export interface TranslateSource {
  paratextId: string;
  projectRef: string;
  name: string;
  shortName: string;
  writingSystem: WritingSystem;
  isRightToLeft?: boolean;
}
