import { Connection, Doc } from 'sharedb/lib/client';
import { OwnedData } from '../../common/models/owned-data';
import { ValidationSchema } from '../../common/models/validation-schema';
import { ProjectDomainConfig } from '../../common/services/project-data-service';
import { ANY_INDEX } from '../../common/utils/obj-path';
import { createFetchQuery, docSubmitJson0Op } from '../../common/utils/sharedb-utils';
import { Note } from '../models/note';
import { NOTE_THREAD_COLLECTION, NOTE_THREAD_INDEX_PATHS, NoteThread } from '../models/note-thread';
import { SFProjectDomain } from '../models/sf-project-rights';
import { SF_PROJECT_USER_CONFIGS_COLLECTION, SFProjectUserConfig } from '../models/sf-project-user-config';
import { NOTE_THREAD_MIGRATIONS } from './note-thread-migrations';
import { SFProjectDataService } from './sf-project-data-service';

export class NoteThreadService extends SFProjectDataService<NoteThread> {
  readonly collection = NOTE_THREAD_COLLECTION;

  protected readonly indexPaths = NOTE_THREAD_INDEX_PATHS;
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
        bsonType: 'string'
      },
      threadId: {
        bsonType: 'string'
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
      notes: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          required: ['threadId', 'type', 'status', 'dataId', 'deleted', 'dateModified', 'dateCreated'],
          properties: {
            threadId: {
              bsonType: 'string'
            },
            type: {
              bsonType: 'string'
            },
            conflictType: {
              bsonType: 'string'
            },
            status: {
              enum: ['', 'todo', 'done', 'deleted']
            },
            tagId: {
              bsonType: 'int'
            },
            reattached: {
              bsonType: 'string'
            },
            assignment: {
              bsonType: 'string'
            },
            content: {
              bsonType: 'string'
            },
            acceptedChangeXml: {
              bsonType: 'string'
            },
            dataId: {
              bsonType: 'string',
              pattern: '^.+$'
            },
            deleted: {
              bsonType: 'bool'
            },
            syncUserRef: {
              bsonType: 'string'
            },
            dateModified: {
              bsonType: 'string'
            },
            dateCreated: {
              bsonType: 'string'
            },
            editable: {
              bsonType: 'bool'
            },
            versionNumber: {
              bsonType: 'int'
            },
            ownerRef: {
              bsonType: 'string',
              pattern: '^.*$'
            }
          },
          additionalProperties: false
        }
      },
      originalSelectedText: {
        bsonType: 'string'
      },
      originalContextBefore: {
        bsonType: 'string'
      },
      originalContextAfter: {
        bsonType: 'string'
      },
      position: {
        bsonType: 'object',
        required: ['start', 'length'],
        properties: {
          start: {
            bsonType: 'int'
          },
          length: {
            bsonType: 'int'
          }
        },
        additionalProperties: false
      },
      status: {
        enum: ['', 'todo', 'done', 'deleted']
      },
      publishedToSF: {
        bsonType: 'bool'
      },
      assignment: {
        bsonType: 'string'
      },
      biblicalTermId: {
        bsonType: 'string'
      },
      extraHeadingInfo: {
        bsonType: 'object',
        properties: {
          gloss: {
            bsonType: 'string'
          },
          language: {
            bsonType: 'string'
          },
          lemma: {
            bsonType: 'string'
          },
          transliteration: {
            bsonType: 'string'
          }
        },
        additionalProperties: false
      }
    },
    additionalProperties: false
  };

  constructor() {
    super(NOTE_THREAD_MIGRATIONS);

    const immutableProps = [
      this.pathTemplate(t => t.dataId),
      this.pathTemplate(t => t.verseRef),
      this.pathTemplate(t => t.originalSelectedText),
      this.pathTemplate(t => t.notes[ANY_INDEX].dataId),
      this.pathTemplate(t => t.notes[ANY_INDEX].ownerRef),
      this.pathTemplate(t => t.notes[ANY_INDEX].editable),
      this.pathTemplate(t => t.notes[ANY_INDEX].versionNumber),
      this.pathTemplate(t => t.notes[ANY_INDEX].dateCreated),
      this.pathTemplate(t => t.biblicalTermId),
      this.pathTemplate(t => t.extraHeadingInfo)
    ];
    this.immutableProps.push(...immutableProps);
  }

  protected setupDomains(): ProjectDomainConfig[] {
    return [
      {
        projectDomain: SFProjectDomain.PTNoteThreads,
        pathTemplate: this.pathTemplate()
      },
      {
        projectDomain: SFProjectDomain.SFNoteThreads,
        pathTemplate: this.pathTemplate()
      },
      {
        projectDomain: SFProjectDomain.Notes,
        pathTemplate: this.pathTemplate(t => t.notes[ANY_INDEX])
      }
    ];
  }

  protected getApplicableDomains(entity?: OwnedData): ProjectDomainConfig[] {
    const domains: ProjectDomainConfig[] = super.getApplicableDomains(entity);
    const noteThread = entity as NoteThread | undefined;
    if (noteThread == null) return domains;
    const applicableDomains: ProjectDomainConfig[] = [];

    for (const domain of domains) {
      if (noteThread.publishedToSF === true && domain.projectDomain === SFProjectDomain.PTNoteThreads) {
        continue;
      }
      if (noteThread.publishedToSF !== true && domain.projectDomain === SFProjectDomain.SFNoteThreads) {
        continue;
      }
      applicableDomains.push(domain);
    }
    return applicableDomains;
  }

  protected async onDelete(userId: string, docId: string, projectDomain: string, entity: OwnedData): Promise<void> {
    if (projectDomain === SFProjectDomain.Notes) {
      await this.removeEntityHaveReadRefs(userId, docId, projectDomain, entity);
    }
    return Promise.resolve();
  }

  protected async onBeforeDelete(
    userId: string,
    docId: string,
    projectDomain: string,
    entity: OwnedData
  ): Promise<void> {
    // Process an incoming deletion for a NoteThread before it happens so we can look at its list of notes.
    if (projectDomain === SFProjectDomain.PTNoteThreads) {
      await this.removeEntityHaveReadRefs(userId, docId, projectDomain, entity);
    }
    return Promise.resolve();
  }

  private async removeEntityHaveReadRefs(
    userId: string,
    docId: string,
    projectDomain: SFProjectDomain,
    entity: OwnedData
  ): Promise<void> {
    if (this.server == null) {
      throw Error('Null server');
    }
    const parts: string[] = docId.split(':');
    const projectId: string = parts[0];
    const conn: Connection = this.server.connect(userId);
    const pucDocs: Doc[] = (await createFetchQuery(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, { projectRef: projectId }))
      .results;
    const promises: Promise<boolean>[] = [];
    for (const doc of pucDocs) {
      switch (projectDomain) {
        case SFProjectDomain.PTNoteThreads:
        case SFProjectDomain.SFNoteThreads:
          (entity as NoteThread).notes.forEach((note: Note) => promises.push(this.removeNoteHaveReadRefs(doc, note)));
          break;
        case SFProjectDomain.Notes:
          promises.push(this.removeNoteHaveReadRefs(doc, entity as Note));
          break;
      }
    }
    await Promise.all(promises);
  }

  private removeNoteHaveReadRefs(sfProjectUserConfigDoc: Doc, note: Note): Promise<boolean> {
    return docSubmitJson0Op<SFProjectUserConfig>(sfProjectUserConfigDoc, ops => {
      const data: SFProjectUserConfig = sfProjectUserConfigDoc.data;
      const index: number = data.noteRefsRead.indexOf(note.dataId);
      if (index !== -1) {
        ops.remove(puc => puc.noteRefsRead, index);
      }
    });
  }
}
