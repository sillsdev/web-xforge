import { PROJECT_DATA_INDEX_PATHS, ProjectData } from '../../common/models/project-data';

export const TRAINING_DATA_COLLECTION = 'training_data';
export const TRAINING_DATA_INDEX_PATHS: string[] = PROJECT_DATA_INDEX_PATHS;

export function getTrainingDataId(projectId: string, dataId: string): string {
  return `${projectId}:${dataId}`;
}

export interface TrainingData extends ProjectData {
  dataId: string;
  fileUrl: string;
  mimeType: string;
  skipRows: number;
  title: string;
}
