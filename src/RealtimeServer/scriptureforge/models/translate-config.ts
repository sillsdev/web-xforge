import { WritingSystem } from '../../common/models/writing-system';

export enum ProjectType {
  Standard = 'Standard',
  Resource = 'Resource',
  BackTranslation = 'BackTranslation',
  Daughter = 'Daughter',
  Transliteration = 'Transliteration',
  TransliterationManual = 'TransliterationManual',
  TransliterationWithEncoder = 'TransliterationWithEncoder',
  StudyBible = 'StudyBible',
  ConsultantNotes = 'ConsultantNotes',
  GlobalConsultantNotes = 'GlobalConsultantNotes',
  GlobalAnthropologyNotes = 'GlobalAnthropologyNotes',
  StudyBibleAdditions = 'StudyBibleAdditions',
  Auxiliary = 'Auxiliary',
  AuxiliaryResource = 'AuxiliaryResource',
  MarbleResource = 'MarbleResource',
  Xml = 'Xml',
  XmlResource = 'XmlResource',
  XmlDictionary = 'XmlDictionary',
  SourceLanguage = 'SourceLanguage',
  Dictionary = 'Dictionary',
  EnhancedResource = 'EnhancedResource'
}

export enum TranslateShareLevel {
  Anyone = 'anyone',
  Specific = 'specific'
}

export enum ParagraphBreakFormat {
  BestGuess = 'best_guess',
  Remove = 'remove',
  MoveToEnd = 'move_to_end'
}

export enum QuoteFormat {
  Automatic = 'automatic',
  Straight = 'straight'
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

export interface DraftUsfmConfig {
  paragraphFormat: ParagraphBreakFormat;
}

export interface DraftConfig {
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
  usfmConfig?: DraftUsfmConfig;
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
