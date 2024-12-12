import { ValidationSchema } from '../../common/models/validation-schema';
import { ProjectDomainConfig } from '../../common/services/project-data-service';
import { BIBLICAL_TERM_COLLECTION, BIBLICAL_TERM_INDEX_PATHS, BiblicalTerm } from '../models/biblical-term';
import { SFProjectDomain } from '../models/sf-project-rights';
import { BIBLICAL_TERM_MIGRATIONS } from './biblical-term-migrations';
import { SFProjectDataService } from './sf-project-data-service';

export class BiblicalTermService extends SFProjectDataService<BiblicalTerm> {
  readonly collection = BIBLICAL_TERM_COLLECTION;

  protected readonly indexPaths = BIBLICAL_TERM_INDEX_PATHS;
  protected readonly listenForUpdates = true;
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
        pattern: '[a-z0-9]+'
      },
      termId: {
        bsonType: 'string'
      },
      transliteration: {
        bsonType: 'string'
      },
      renderings: {
        bsonType: 'array',
        items: {
          bsonType: 'string'
        }
      },
      description: {
        bsonType: 'string'
      },
      language: {
        bsonType: 'string'
      },
      links: {
        bsonType: 'array',
        items: {
          bsonType: 'string'
        }
      },
      references: {
        bsonType: 'array',
        items: {
          bsonType: 'int'
        }
      },
      definitions: {
        bsonType: 'object',
        patternProperties: {
          '^[A-Za-z-]+$': {
            bsonType: 'object',
            required: ['categories', 'domains', 'gloss', 'notes'],
            properties: {
              categories: {
                bsonType: 'array',
                items: {
                  bsonType: 'string'
                }
              },
              domains: {
                bsonType: 'array',
                items: {
                  bsonType: 'string'
                }
              },
              gloss: {
                bsonType: 'string'
              },
              notes: {
                bsonType: 'string'
              }
            },
            additionalProperties: false
          }
        },
        additionalProperties: false
      }
    },
    additionalProperties: false
  };

  constructor() {
    super(BIBLICAL_TERM_MIGRATIONS);

    // Only renderings and description are user updatable
    const immutableProps = [
      this.pathTemplate(t => t.projectRef),
      this.pathTemplate(t => t.dataId),
      this.pathTemplate(t => t.termId),
      this.pathTemplate(t => t.transliteration),
      this.pathTemplate(t => t.language),
      this.pathTemplate(t => t.links),
      this.pathTemplate(t => t.references),
      this.pathTemplate(t => t.definitions)
    ];
    this.immutableProps.push(...immutableProps);
  }

  protected setupDomains(): ProjectDomainConfig[] {
    return [
      {
        projectDomain: SFProjectDomain.BiblicalTerms,
        pathTemplate: this.pathTemplate()
      }
    ];
  }
}
