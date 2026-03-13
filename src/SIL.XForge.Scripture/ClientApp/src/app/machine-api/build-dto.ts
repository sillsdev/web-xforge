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

/** Execution data from a Serval translation build. */
export interface BuildExecutionData {
  trainCount: number;
  pretranslateCount: number;
  sourceLanguageTag?: string;
  targetLanguageTag?: string;
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
