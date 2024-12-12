import {
  TRAINING_DATA_COLLECTION,
  TRAINING_DATA_INDEX_PATHS,
  TrainingData
} from 'realtime-server/lib/esm/scriptureforge/models/training-data';
import { ProjectDataDoc } from 'xforge-common/models/project-data-doc';

export class TrainingDataDoc extends ProjectDataDoc<TrainingData> {
  static readonly COLLECTION = TRAINING_DATA_COLLECTION;
  static readonly INDEX_PATHS = TRAINING_DATA_INDEX_PATHS;
}
