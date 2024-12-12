import { ValidationSchema } from '../../common/models/validation-schema';
import { ProjectDomainConfig } from '../../common/services/project-data-service';
import { SFProjectDomain } from '../models/sf-project-rights';
import { TEXT_AUDIO_COLLECTION, TEXT_AUDIO_INDEX_PATHS, TextAudio } from '../models/text-audio';
import { SFProjectDataService } from './sf-project-data-service';
import { TEXT_AUDIO_MIGRATIONS } from './text-audio-migrations';

/**
 * This class manages text audio timing docs.
 */
export class TextAudioService extends SFProjectDataService<TextAudio> {
  readonly collection = TEXT_AUDIO_COLLECTION;

  protected readonly indexPaths = TEXT_AUDIO_INDEX_PATHS;
  readonly validationSchema: ValidationSchema = {
    bsonType: SFProjectDataService.validationSchema.bsonType,
    required: SFProjectDataService.validationSchema.required,
    properties: {
      ...SFProjectDataService.validationSchema.properties,
      _id: {
        bsonType: 'string',
        pattern: '^[0-9a-f]+:[0-9A-Z]+:[0-9]+:target$'
      },
      dataId: {
        bsonType: 'string'
      },
      mimeType: {
        bsonType: 'string'
      },
      audioUrl: {
        bsonType: 'string'
      },
      timings: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          required: ['textRef', 'from', 'to'],
          properties: {
            textRef: {
              bsonType: 'string'
            },
            from: {
              bsonType: 'number'
            },
            to: {
              bsonType: 'number'
            }
          },
          additionalProperties: false
        }
      }
    },
    additionalProperties: false
  };

  constructor() {
    super(TEXT_AUDIO_MIGRATIONS);

    const immutableProps = [this.pathTemplate(t => t.dataId)];
    this.immutableProps.push(...immutableProps);
  }

  protected setupDomains(): ProjectDomainConfig[] {
    return [
      {
        projectDomain: SFProjectDomain.TextAudio,
        pathTemplate: this.pathTemplate()
      }
    ];
  }
}
