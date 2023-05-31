import { ValidationSchema } from '../../common/models/validation-schema';
import { ProjectDomainConfig } from '../../common/services/project-data-service';
import { SFProjectDomain } from '../models/sf-project-rights';
import {
  SF_PROJECT_USER_CONFIG_INDEX_PATHS,
  SF_PROJECT_USER_CONFIGS_COLLECTION,
  SFProjectUserConfig
} from '../models/sf-project-user-config';
import { SFProjectDataService } from './sf-project-data-service';
import { SF_PROJECT_USER_CONFIG_MIGRATIONS } from './sf-project-user-config-migrations';

/**
 * This class manages project-user configuration docs.
 */
export class SFProjectUserConfigService extends SFProjectDataService<SFProjectUserConfig> {
  readonly collection = SF_PROJECT_USER_CONFIGS_COLLECTION;

  protected readonly indexPaths = SF_PROJECT_USER_CONFIG_INDEX_PATHS;
  readonly validationSchema: ValidationSchema = {
    bsonType: 'object',
    required: ['_id', '_type', '_v', '_m', '_o'],
    properties: {
      _id: {
        bsonType: 'string',
        pattern: '^[0-9a-f]+:[0-9a-f]+$'
      },
      selectedTask: {
        bsonType: 'string'
      },
      selectedQuestionRef: {
        bsonType: 'string'
      },
      selectedBookNum: {
        bsonType: 'int'
      },
      selectedChapterNum: {
        bsonType: 'int'
      },
      isTargetTextRight: {
        bsonType: 'bool'
      },
      confidenceThreshold: {
        bsonType: 'number'
      },
      translationSuggestionsEnabled: {
        bsonType: 'bool'
      },
      numSuggestions: {
        bsonType: 'int'
      },
      selectedSegment: {
        bsonType: 'string'
      },
      selectedSegmentChecksum: {
        bsonType: 'int'
      },
      noteRefsRead: {
        bsonType: 'array',
        items: {
          bsonType: 'string'
        }
      },
      questionRefsRead: {
        bsonType: 'array',
        items: {
          bsonType: 'string'
        }
      },
      answerRefsRead: {
        bsonType: 'array',
        items: {
          bsonType: 'string'
        }
      },
      commentRefsRead: {
        bsonType: 'array',
        items: {
          bsonType: 'string'
        }
      },
      projectRef: {
        bsonType: 'string',
        pattern: '^[0-9a-f]+$'
      },
      ownerRef: {
        bsonType: 'string',
        pattern: '^[0-9a-f]*$'
      },
      _type: {
        bsonType: ['null', 'string']
      },
      _v: {
        bsonType: 'int'
      },
      _m: {
        bsonType: 'object',
        required: ['ctime', 'mtime'],
        properties: {
          ctime: {
            bsonType: 'number'
          },
          mtime: {
            bsonType: 'number'
          }
        },
        additionalProperties: false
      },
      _o: {
        bsonType: 'objectId'
      }
    },
    additionalProperties: false
  };

  constructor() {
    super(SF_PROJECT_USER_CONFIG_MIGRATIONS);
  }

  protected setupDomains(): ProjectDomainConfig[] {
    return [{ projectDomain: SFProjectDomain.ProjectUserConfigs, pathTemplate: this.pathTemplate() }];
  }
}
