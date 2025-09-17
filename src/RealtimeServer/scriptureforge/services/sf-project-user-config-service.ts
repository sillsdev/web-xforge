import { MigrationConstructor } from '../../common/migration';
import { ValidationSchema } from '../../common/models/validation-schema';
import { ProjectDomainConfig } from '../../common/services/project-data-service';
import { SFProjectDomain } from '../models/sf-project-rights';
import {
  SF_PROJECT_USER_CONFIG_INDEX_PATHS,
  SF_PROJECT_USER_CONFIGS_COLLECTION,
  SFProjectUserConfig
} from '../models/sf-project-user-config';
import { SFProjectDataService } from './sf-project-data-service';

/**
 * This class manages project-user configuration docs.
 */
export class SFProjectUserConfigService extends SFProjectDataService<SFProjectUserConfig> {
  readonly collection = SF_PROJECT_USER_CONFIGS_COLLECTION;

  protected readonly indexPaths = SF_PROJECT_USER_CONFIG_INDEX_PATHS;
  readonly validationSchema: ValidationSchema = {
    bsonType: SFProjectDataService.validationSchema.bsonType,
    required: SFProjectDataService.validationSchema.required,
    properties: {
      ...SFProjectDataService.validationSchema.properties,
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
      selectedBiblicalTermsCategory: {
        bsonType: 'string'
      },
      selectedBiblicalTermsFilter: {
        bsonType: 'string'
      },
      isTargetTextRight: {
        bsonType: 'bool'
      },
      confidenceThreshold: {
        bsonType: 'number'
      },
      biblicalTermsEnabled: {
        bsonType: 'bool'
      },
      transliterateBiblicalTerms: {
        bsonType: 'bool'
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
      editorTabsOpen: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          required: ['tabType', 'groupId'],
          properties: {
            tabType: {
              bsonType: 'string'
            },
            groupId: {
              bsonType: 'string'
            },
            isSelected: {
              bsonType: 'bool'
            },
            projectId: {
              bsonType: 'string'
            }
          },
          additionalProperties: false
        }
      },
      lynxInsightState: {
        bsonType: 'object',
        properties: {
          panelData: {
            bsonType: 'object',
            required: ['isOpen', 'filter', 'sortOrder'],
            properties: {
              isOpen: {
                bsonType: 'bool'
              },
              filter: {
                bsonType: 'object',
                required: ['types', 'scope'],
                properties: {
                  types: {
                    bsonType: 'array',
                    items: {
                      bsonType: 'string'
                    }
                  },
                  scope: {
                    bsonType: 'string'
                  }
                }
              },
              sortOrder: {
                bsonType: 'string'
              }
            }
          },
          assessmentsEnabled: {
            bsonType: 'bool'
          },
          autoCorrectionsEnabled: {
            bsonType: 'bool'
          }
        },
        additionalProperties: false
      }
    },
    additionalProperties: false
  };

  constructor(sfProjectUserConfigMigrations: MigrationConstructor[]) {
    super(sfProjectUserConfigMigrations);
  }

  protected setupDomains(): ProjectDomainConfig[] {
    return [{ projectDomain: SFProjectDomain.ProjectUserConfigs, pathTemplate: this.pathTemplate() }];
  }
}
