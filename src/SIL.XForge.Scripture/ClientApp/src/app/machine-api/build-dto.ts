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
}

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
  requestedByUserId?: string;
}
