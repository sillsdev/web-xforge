import ShareDB from 'sharedb';
import { MigrationConstructor } from '../../common/migration';
import { ProjectDomainConfig } from '../../common/services/project-data-service';
import { RealtimeServer } from '../../common/realtime-server';
import { ProjectService } from '../../common/services/project-service';
import {
  SFProject,
  SF_PROJECTS_COLLECTION,
  SF_PROJECT_INDEX_PATHS,
  SF_PROJECT_PROFILES_COLLECTION
} from '../models/sf-project';
import { SFProjectRole } from '../models/sf-project-role';
import { SFProjectDomain, SF_PROJECT_RIGHTS } from '../models/sf-project-rights';
import { ConnectSession } from '../../common/connect-session';
import { Operation } from '../../common/models/project-rights';
import { SystemRole } from '../../common/models/system-role';
import { ValidationSchema } from '../../common/models/validation-schema';

const SF_PROJECT_PROFILE_FIELDS: ShareDB.ProjectionFields = {
  name: true,
  paratextId: true,
  userRoles: true,
  userPermissions: true,
  shortName: true,
  writingSystem: true,
  isRightToLeft: true,
  biblicalTermsConfig: true,
  editable: true,
  defaultFontSize: true,
  defaultFont: true,
  translateConfig: true,
  checkingConfig: true,
  texts: true,
  syncDisabled: true,
  sync: true,
  noteTags: true,
  copyrightBanner: true,
  copyrightNotice: true
};

/**
 * This class manages SF project docs.
 */
export class SFProjectService extends ProjectService<SFProject> {
  readonly collection = SF_PROJECTS_COLLECTION;

  protected readonly indexPaths = SF_PROJECT_INDEX_PATHS;
  protected readonly projectAdminRole = SFProjectRole.ParatextAdministrator;
  readonly validationSchema: ValidationSchema = {
    bsonType: ProjectService.validationSchema.bsonType,
    required: ProjectService.validationSchema.required,
    properties: {
      ...ProjectService.validationSchema.properties,
      paratextId: {
        bsonType: 'string'
      },
      shortName: {
        bsonType: 'string'
      },
      writingSystem: {
        bsonType: 'object',
        properties: {
          tag: {
            bsonType: 'string'
          }
        },
        additionalProperties: false
      },
      isRightToLeft: {
        bsonType: 'bool'
      },
      translateConfig: {
        bsonType: 'object',
        properties: {
          translationSuggestionsEnabled: {
            bsonType: 'bool'
          },
          source: {
            bsonType: 'object',
            properties: {
              paratextId: {
                bsonType: 'string'
              },
              projectRef: {
                bsonType: 'string',
                pattern: '^[0-9a-f]+$'
              },
              name: {
                bsonType: 'string'
              },
              shortName: {
                bsonType: 'string'
              },
              writingSystem: {
                bsonType: 'object',
                properties: {
                  tag: {
                    bsonType: 'string'
                  }
                },
                additionalProperties: false
              },
              isRightToLeft: {
                bsonType: 'bool'
              }
            },
            additionalProperties: false
          },
          shareEnabled: {
            bsonType: 'bool'
          },
          defaultNoteTagId: {
            bsonType: 'int'
          },
          preTranslate: {
            bsonType: 'bool'
          },
          draftConfig: {
            bsonType: 'object',
            properties: {
              additionalTrainingData: {
                bsonType: 'bool'
              },
              alternateSource: {
                bsonType: 'object',
                properties: {
                  paratextId: {
                    bsonType: 'string'
                  },
                  projectRef: {
                    bsonType: 'string',
                    pattern: '^[0-9a-f]+$'
                  },
                  name: {
                    bsonType: 'string'
                  },
                  shortName: {
                    bsonType: 'string'
                  },
                  writingSystem: {
                    bsonType: 'object',
                    properties: {
                      tag: {
                        bsonType: 'string'
                      }
                    },
                    additionalProperties: false
                  },
                  isRightToLeft: {
                    bsonType: 'bool'
                  }
                },
                additionalProperties: false
              },
              alternateTrainingSourceEnabled: {
                bsonType: 'bool'
              },
              alternateTrainingSource: {
                bsonType: 'object',
                properties: {
                  paratextId: {
                    bsonType: 'string'
                  },
                  projectRef: {
                    bsonType: 'string',
                    pattern: '^[0-9a-f]+$'
                  },
                  name: {
                    bsonType: 'string'
                  },
                  shortName: {
                    bsonType: 'string'
                  },
                  writingSystem: {
                    bsonType: 'object',
                    properties: {
                      tag: {
                        bsonType: 'string'
                      }
                    },
                    additionalProperties: false
                  },
                  isRightToLeft: {
                    bsonType: 'bool'
                  }
                },
                additionalProperties: false
              },
              lastSelectedTrainingBooks: {
                bsonType: 'array',
                items: {
                  bsonType: 'int'
                }
              },
              lastSelectedTrainingDataFiles: {
                bsonType: 'array',
                items: {
                  bsonType: 'string'
                }
              },
              lastSelectedTranslationBooks: {
                bsonType: 'array',
                items: {
                  bsonType: 'int'
                }
              },
              sendAllSegments: {
                bsonType: 'bool'
              },
              servalConfig: {
                bsonType: 'string'
              }
            },
            additionalProperties: false
          },
          projectType: {
            enum: [
              'Standard',
              'BackTranslation',
              'Daughter',
              'TransliterationManual',
              'TransliterationWithEncoder',
              'StudyBible',
              'ConsultantNotes',
              'StudyBibleAdditions',
              'Auxiliary',
              'Xml',
              'SourceLanguage',
              'Dictionary',
              'EnhancedResource'
            ]
          },
          baseProject: {
            bsonType: 'object',
            properties: {
              paratextId: {
                bsonType: 'string'
              },
              shortName: {
                bsonType: 'string'
              }
            },
            additionalProperties: false
          }
        },
        additionalProperties: false
      },
      checkingConfig: {
        bsonType: 'object',
        properties: {
          checkingEnabled: {
            bsonType: 'bool'
          },
          usersSeeEachOthersResponses: {
            bsonType: 'bool'
          },
          shareEnabled: {
            bsonType: 'bool'
          },
          answerExportMethod: {
            enum: ['', 'all', 'marked_for_export', 'none']
          },
          noteTagId: {
            bsonType: 'int'
          },
          hideCommunityCheckingText: {
            bsonType: 'bool'
          }
        },
        additionalProperties: false
      },
      resourceConfig: {
        bsonType: 'object',
        properties: {
          createdTimestamp: {
            bsonType: 'string'
          },
          manifestChecksum: {
            bsonType: 'string'
          },
          permissionsChecksum: {
            bsonType: 'string'
          },
          revision: {
            bsonType: 'int'
          }
        },
        additionalProperties: false
      },
      texts: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          required: ['bookNum', 'hasSource'],
          properties: {
            bookNum: {
              bsonType: 'int'
            },
            hasSource: {
              bsonType: 'bool'
            },
            chapters: {
              bsonType: 'array',
              items: {
                bsonType: 'object',
                required: ['number', 'lastVerse', 'isValid'],
                properties: {
                  number: {
                    bsonType: 'int'
                  },
                  lastVerse: {
                    bsonType: 'int'
                  },
                  hasAudio: {
                    bsonType: 'bool'
                  },
                  hasDraft: {
                    bsonType: 'bool'
                  },
                  isValid: {
                    bsonType: 'bool'
                  },
                  permissions: {
                    bsonType: 'object',
                    patternProperties: {
                      '^[0-9a-f]+$': {
                        bsonType: 'string'
                      }
                    },
                    additionalProperties: false
                  }
                },
                additionalProperties: false
              }
            },
            permissions: {
              bsonType: 'object',
              patternProperties: {
                '^[0-9a-f]+$': {
                  bsonType: 'string'
                }
              },
              additionalProperties: false
            }
          },
          additionalProperties: false
        }
      },
      noteTags: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          required: ['tagId', 'name', 'icon', 'creatorResolve'],
          properties: {
            tagId: {
              bsonType: 'int'
            },
            name: {
              bsonType: 'string'
            },
            icon: {
              bsonType: 'string'
            },
            creatorResolve: {
              bsonType: 'bool'
            }
          },
          additionalProperties: false
        }
      },
      sync: {
        bsonType: 'object',
        properties: {
          queuedCount: {
            bsonType: 'int'
          },
          lastSyncSuccessful: {
            bsonType: 'bool'
          },
          dateLastSuccessfulSync: {
            bsonType: 'string'
          },
          syncedToRepositoryVersion: {
            bsonType: 'string'
          },
          dataInSync: {
            bsonType: 'bool'
          }
        },
        additionalProperties: false
      },
      editable: {
        bsonType: 'bool'
      },
      defaultFontSize: {
        bsonType: 'int'
      },
      defaultFont: {
        bsonType: 'string'
      },
      maxGeneratedUsersPerShareKey: {
        bsonType: 'int'
      },
      biblicalTermsConfig: {
        bsonType: 'object',
        properties: {
          biblicalTermsEnabled: {
            bsonType: 'bool'
          },
          errorMessage: {
            bsonType: 'string'
          },
          hasRenderings: {
            bsonType: 'bool'
          }
        },
        additionalProperties: false
      },
      copyrightBanner: {
        bsonType: 'string'
      },
      copyrightNotice: {
        bsonType: 'string'
      },
      paratextUsers: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          required: ['username', 'opaqueUserId'],
          properties: {
            username: {
              bsonType: 'string'
            },
            opaqueUserId: {
              bsonType: 'string'
            },
            sfUserId: {
              bsonType: 'string'
            }
          },
          additionalProperties: false
        }
      }
    },
    additionalProperties: false
  };

  constructor(sfProjectMigrations: MigrationConstructor[]) {
    super(sfProjectMigrations);

    const immutableProps = [
      this.pathTemplate(p => p.sync),
      this.pathTemplate(p => p.paratextId),
      this.pathTemplate(p => p.paratextUsers),
      this.pathTemplate(p => p.texts),
      this.pathTemplate(p => p.translateConfig),
      this.pathTemplate(p => p.checkingConfig),
      this.pathTemplate(p => p.shortName),
      this.pathTemplate(p => p.writingSystem),
      this.pathTemplate(p => p.copyrightBanner),
      this.pathTemplate(p => p.copyrightNotice)
    ];
    this.immutableProps.push(...immutableProps);
  }

  init(server: RealtimeServer): void {
    server.addProjection(SF_PROJECT_PROFILES_COLLECTION, this.collection, SF_PROJECT_PROFILE_FIELDS);
    super.init(server);
  }

  protected allowRead(docId: string, doc: SFProject, session: ConnectSession): boolean {
    if (session.isServer || session.roles.includes(SystemRole.SystemAdmin) || Object.keys(doc).length === 0) {
      return true;
    }
    if (this.hasRight(session.userId, doc, Operation.View)) {
      return true;
    }
    for (const key of Object.keys(doc)) {
      if (!Object.prototype.hasOwnProperty.call(SF_PROJECT_PROFILE_FIELDS, key)) {
        return false;
      }
    }
    return super.allowRead(docId, doc, session);
  }

  protected setupDomains(): ProjectDomainConfig[] {
    return [{ projectDomain: SFProjectDomain.Project, pathTemplate: this.pathTemplate() }];
  }

  private hasRight(userId: string, doc: SFProject, operation: Operation): boolean {
    const projectRole = doc.userRoles[userId];
    return SF_PROJECT_RIGHTS.roleHasRight(projectRole, SFProjectDomain.Project, operation);
  }
}
