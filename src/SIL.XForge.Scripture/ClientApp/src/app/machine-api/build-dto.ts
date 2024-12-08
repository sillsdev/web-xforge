import { ResourceDto } from './resource-dto';

export interface BuildDto extends ResourceDto {
  revision: number;
  engine: ResourceDto;
  percentCompleted: number;
  message: string;
  state: string;
  queueDepth: number;
  additionalInfo?: ServalBuildAdditionalInfo;
}

export interface ServalBuildAdditionalInfo {
  buildId: string;
  corporaIds?: string[];
  dateFinished?: string;
  parallelCorporaIds?: string[];
  step: number;
  translationEngineId: string;
}
