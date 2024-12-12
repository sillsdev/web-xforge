import { ValidationSchema } from '../../common/models/validation-schema';
import { ProjectDomainConfig } from '../../common/services/project-data-service';
import { SFProjectDomain } from '../models/sf-project-rights';
import { TRAINING_DATA_COLLECTION, TRAINING_DATA_INDEX_PATHS, TrainingData } from '../models/training-data';
import { SFProjectDataService } from './sf-project-data-service';
import { TRAINING_DATA_MIGRATIONS } from './training-data-migrations';

/**
 * This class manages Serval training data docs.
 */
export class TrainingDataService extends SFProjectDataService<TrainingData> {
  readonly collection = TRAINING_DATA_COLLECTION;

  protected readonly indexPaths = TRAINING_DATA_INDEX_PATHS;
  readonly validationSchema: ValidationSchema = {
    bsonType: SFProjectDataService.validationSchema.bsonType,
    required: SFProjectDataService.validationSchema.required,
    properties: {
      ...SFProjectDataService.validationSchema.properties,
      _id: {
        bsonType: 'string',
        pattern: '^[0-9a-f]+:[0-9a-f]+$'
      },
      dataId: {
        bsonType: 'string',
        pattern: '^[0-9a-f]+$'
      },
      fileUrl: {
        bsonType: 'string'
      },
      mimeType: {
        bsonType: 'string'
      },
      skipRows: {
        bsonType: 'int'
      },
      title: {
        bsonType: 'string'
      }
    },
    additionalProperties: false
  };

  constructor() {
    super(TRAINING_DATA_MIGRATIONS);

    const immutableProps = [this.pathTemplate(t => t.dataId)];
    this.immutableProps.push(...immutableProps);
  }

  protected setupDomains(): ProjectDomainConfig[] {
    return [
      {
        projectDomain: SFProjectDomain.TrainingData,
        pathTemplate: this.pathTemplate()
      }
    ];
  }
}
