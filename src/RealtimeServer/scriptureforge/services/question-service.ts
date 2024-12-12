import { Doc } from 'sharedb/lib/client';
import { OwnedData } from '../../common/models/owned-data';
import { ValidationSchema } from '../../common/models/validation-schema';
import { ProjectDomainConfig } from '../../common/services/project-data-service';
import { ANY_INDEX } from '../../common/utils/obj-path';
import { createFetchQuery, docSubmitJson0Op } from '../../common/utils/sharedb-utils';
import { Answer } from '../models/answer';
import { Comment } from '../models/comment';
import { Question, QUESTION_INDEX_PATHS, QUESTIONS_COLLECTION } from '../models/question';
import { SFProjectDomain } from '../models/sf-project-rights';
import { SF_PROJECT_USER_CONFIGS_COLLECTION, SFProjectUserConfig } from '../models/sf-project-user-config';
import { QUESTION_MIGRATIONS } from './question-migrations';
import { SFProjectDataService } from './sf-project-data-service';

/**
 * This class manages question list docs.
 */
export class QuestionService extends SFProjectDataService<Question> {
  readonly collection = QUESTIONS_COLLECTION;

  protected readonly indexPaths = QUESTION_INDEX_PATHS;
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
        pattern: '^[0-9a-f]+$'
      },
      verseRef: {
        bsonType: 'object',
        required: ['bookNum', 'chapterNum', 'verseNum'],
        properties: {
          bookNum: {
            bsonType: 'int'
          },
          chapterNum: {
            bsonType: 'int'
          },
          verseNum: {
            bsonType: 'int'
          },
          verse: {
            bsonType: 'string'
          }
        },
        additionalProperties: false
      },
      text: {
        bsonType: 'string'
      },
      audioUrl: {
        bsonType: 'string'
      },
      answers: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          required: ['dataId', 'deleted', 'dateModified', 'dateCreated'],
          properties: {
            verseRef: {
              bsonType: 'object',
              required: ['bookNum', 'chapterNum', 'verseNum'],
              properties: {
                bookNum: {
                  bsonType: 'int'
                },
                chapterNum: {
                  bsonType: 'int'
                },
                verseNum: {
                  bsonType: 'int'
                },
                verse: {
                  bsonType: 'string'
                }
              },
              additionalProperties: false
            },
            comments: {
              bsonType: 'array',
              items: {
                bsonType: 'object',
                required: ['dataId', 'deleted', 'dateModified', 'dateCreated'],
                properties: {
                  dataId: {
                    bsonType: 'string',
                    pattern: '^[0-9a-f]+$'
                  },
                  deleted: {
                    bsonType: 'bool'
                  },
                  syncUserRef: {
                    bsonType: 'string'
                  },
                  text: {
                    bsonType: 'string'
                  },
                  audioUrl: {
                    bsonType: 'string'
                  },
                  dateModified: {
                    bsonType: 'string'
                  },
                  dateCreated: {
                    bsonType: 'string'
                  },
                  ownerRef: {
                    bsonType: 'string',
                    pattern: '^[0-9a-f]*$'
                  }
                },
                additionalProperties: false
              }
            },
            likes: {
              bsonType: 'array',
              items: {
                bsonType: 'object',
                required: ['ownerRef'],
                properties: {
                  ownerRef: {
                    bsonType: 'string',
                    pattern: '^[0-9a-f]+$'
                  }
                },
                additionalProperties: false
              }
            },
            status: {
              enum: ['', 'resolved', 'export']
            },
            scriptureText: {
              bsonType: 'string'
            },
            selectionStartClipped: {
              bsonType: 'bool'
            },
            selectionEndClipped: {
              bsonType: 'bool'
            },
            audioUrl: {
              bsonType: 'string'
            },
            dataId: {
              bsonType: 'string',
              pattern: '^[0-9a-f]+$'
            },
            deleted: {
              bsonType: 'bool'
            },
            syncUserRef: {
              bsonType: 'string'
            },
            text: {
              bsonType: ['null', 'string']
            },
            dateModified: {
              bsonType: 'string'
            },
            dateCreated: {
              bsonType: 'string'
            },
            ownerRef: {
              bsonType: 'string',
              pattern: '^[0-9a-f]*$'
            }
          },
          additionalProperties: false
        }
      },
      isArchived: {
        bsonType: 'bool'
      },
      dateArchived: {
        bsonType: 'string'
      },
      dateModified: {
        bsonType: 'string'
      },
      dateCreated: {
        bsonType: 'string'
      },
      transceleratorQuestionId: {
        bsonType: 'string'
      }
    },
    additionalProperties: false
  };

  constructor() {
    super(QUESTION_MIGRATIONS);

    const immutableProps = [
      this.pathTemplate(q => q.dataId),
      this.pathTemplate(q => q.dateCreated),
      this.pathTemplate(q => q.answers[ANY_INDEX].dataId),
      this.pathTemplate(q => q.answers[ANY_INDEX].ownerRef),
      this.pathTemplate(q => q.answers[ANY_INDEX].syncUserRef!),
      this.pathTemplate(q => q.answers[ANY_INDEX].dateCreated),
      this.pathTemplate(q => q.answers[ANY_INDEX].comments[ANY_INDEX].dataId),
      this.pathTemplate(q => q.answers[ANY_INDEX].comments[ANY_INDEX].ownerRef),
      this.pathTemplate(q => q.answers[ANY_INDEX].comments[ANY_INDEX].syncUserRef!),
      this.pathTemplate(q => q.answers[ANY_INDEX].comments[ANY_INDEX].dateCreated),
      this.pathTemplate(q => q.answers[ANY_INDEX].likes[ANY_INDEX].ownerRef)
    ];
    this.immutableProps.push(...immutableProps);
  }

  protected setupDomains(): ProjectDomainConfig[] {
    return [
      {
        projectDomain: SFProjectDomain.Questions,
        pathTemplate: this.pathTemplate()
      },
      {
        projectDomain: SFProjectDomain.Answers,
        pathTemplate: this.pathTemplate(q => q.answers[ANY_INDEX])
      },
      {
        projectDomain: SFProjectDomain.AnswerComments,
        pathTemplate: this.pathTemplate(q => q.answers[ANY_INDEX].comments[ANY_INDEX])
      },
      {
        projectDomain: SFProjectDomain.AnswerStatus,
        pathTemplate: this.pathTemplate(q => q.answers[ANY_INDEX].status)
      },
      {
        projectDomain: SFProjectDomain.Likes,
        pathTemplate: this.pathTemplate(q => q.answers[ANY_INDEX].likes[ANY_INDEX])
      }
    ];
  }

  protected onDelete(userId: string, docId: string, projectDomain: SFProjectDomain, entity: OwnedData): Promise<void> {
    if (projectDomain === SFProjectDomain.Answers || projectDomain === SFProjectDomain.AnswerComments) {
      this.removeEntityReadRefs(userId, docId, projectDomain, entity);
    }
    return Promise.resolve();
  }

  private async removeEntityReadRefs(
    userId: string,
    docId: string,
    projectDomain: SFProjectDomain,
    entity: OwnedData
  ): Promise<void> {
    const parts = docId.split(':');
    const projectId = parts[0];
    const conn = this.server!.connect(userId);
    const query = await createFetchQuery(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, { projectRef: projectId });
    const promises: Promise<boolean>[] = [];
    for (const doc of query.results) {
      switch (projectDomain) {
        case SFProjectDomain.Answers:
          promises.push(this.removeAnswerReadRefs(doc, entity as Answer));
          break;
        case SFProjectDomain.AnswerComments:
          promises.push(this.removeCommentReadRefs(doc, entity as Comment));
          break;
      }
    }
    await Promise.all(promises);
  }

  private removeAnswerReadRefs(doc: Doc, answer: Answer): Promise<boolean> {
    return docSubmitJson0Op<SFProjectUserConfig>(doc, ops => {
      const data = doc.data as SFProjectUserConfig;
      const index = data.answerRefsRead.indexOf(answer.dataId);
      if (index !== -1) {
        ops.remove(puc => puc.answerRefsRead, index);
      }

      const commentIds = new Set<string>(answer.comments.map(c => c.dataId));
      for (let i = data.commentRefsRead.length - 1; i >= 0; i--) {
        if (commentIds.has(data.commentRefsRead[i])) {
          ops.remove(puc => puc.commentRefsRead, i);
        }
      }
    });
  }

  private removeCommentReadRefs(doc: Doc, comment: Comment): Promise<boolean> {
    return docSubmitJson0Op<SFProjectUserConfig>(doc, ops => {
      const data = doc.data as SFProjectUserConfig;
      const index = data.commentRefsRead.indexOf(comment.dataId);
      if (index !== -1) {
        ops.remove(puc => puc.commentRefsRead, index);
      }
    });
  }
}
