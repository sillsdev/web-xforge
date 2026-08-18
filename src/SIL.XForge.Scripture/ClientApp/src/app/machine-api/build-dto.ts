import { ProjectScriptureRange } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { BuildStates } from './build-states';
import { ResourceDto } from './resource-dto';

export interface BuildDto extends ResourceDto {
  revision: number;
  engine: ResourceDto;
  percentCompleted: number;
  message: string;
  state: BuildStates;
  queueDepth: number;
  additionalInfo?: ServalBuildAdditionalInfo;
  /** The Serval deployment version that executed this build. */
  deploymentVersion?: string;
  /** Execution data from the Serval build, including training/pretranslation counts and language tags. */
  executionData?: BuildExecutionData;
}

// Enum Definition
enum ServalDiagnosticSeverity {
  Info = 0,
  Warn = 1,
  Error = 2
}

/**
 * Not a comprehensive list of the build diagnostics, but the ones which we can correctly handle
 */
export enum ServalDiagnosticCode {
  LowConfidence = 'MODEL-0003'
}

// Model Interface
interface ServalBuildDiagnostic {
  code: string;
  category: string;
  message: string;
  severity: ServalDiagnosticSeverity;
  data: Record<string, any>;
}

/** Execution data from a Serval translation build. */
export interface BuildExecutionData {
  trainCount: number;
  pretranslateCount: number;
  isTrainFilteredByChapter?: boolean;
  isPretranslateFilteredByChapter?: boolean;
  sourceLanguageTag?: string;
  targetLanguageTag?: string;
  resolvedSourceLanguage?: string;
  resolvedTargetLanguage?: string;
  averagePretranslationConfidence?: number;
  diagnostics: ServalBuildDiagnostic[];
  diagnosticsTruncated?: boolean;
}

/** Additional information about a Serval build. */
export interface ServalBuildAdditionalInfo {
  buildId: string;
  corporaIds?: string[];
  dateFinished?: string;
  dateGenerated?: string;
  dateRequested?: string;
  parallelCorporaIds?: string[];
  step: number;
  trainingScriptureRanges: ProjectScriptureRange[];
  translationEngineId: string;
  translationScriptureRanges: ProjectScriptureRange[];
  trainingDataFileIds: string[];
  requestedByUserId?: string;
  canDenormalizeQuotes: boolean;
}
