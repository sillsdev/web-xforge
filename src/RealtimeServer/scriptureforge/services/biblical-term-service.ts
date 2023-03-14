import { ProjectDomainConfig } from '../../common/services/project-data-service';
import { BiblicalTerm, BIBLICAL_TERM_COLLECTION, BIBLICAL_TERM_INDEX_PATHS } from '../models/biblical-term';
import { SFProjectDomain } from '../models/sf-project-rights';
import { BIBLICAL_TERM_MIGRATIONS } from './biblical-term-migrations';
import { SFProjectDataService } from './sf-project-data-service';

export class BiblicalTermService extends SFProjectDataService<BiblicalTerm> {
  readonly collection = BIBLICAL_TERM_COLLECTION;

  protected readonly indexPaths = BIBLICAL_TERM_INDEX_PATHS;
  protected readonly listenForUpdates = true;
  protected readonly validationSchema = {
    bsonType: 'object',
    required: [
      '_id',
      'dataId',
      'termId',
      'transliteration',
      'renderings',
      'description',
      'language',
      'links',
      'references',
      'definitions',
      'projectRef'
    ],
    properties: {
      _id: {
        bsonType: 'string',
        pattern: '[a-z0-9]+:[a-z0-9]+'
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
        minItems: 1,
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
      },
      projectRef: {
        bsonType: 'string',
        pattern: '[a-z0-9]+'
      },
      ownerRef: {
        bsonType: 'string',
        pattern: '[a-z0-9]?'
      },
      _type: {
        bsonType: 'string'
      },
      _v: {
        bsonType: 'int'
      },
      _m: {
        bsonType: 'object',
        required: ['ctime', 'mtime'],
        properties: {
          ctime: {
            bsonType: 'double'
          },
          mtime: {
            bsonType: 'double'
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
