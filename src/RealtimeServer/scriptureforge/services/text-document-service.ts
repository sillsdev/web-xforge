import { ConnectSession } from '../../common/connect-session';
import { Project } from '../../common/models/project';
import { Operation } from '../../common/models/project-rights';
import { ValidationSchema } from '../../common/models/validation-schema';
import { DocService } from '../../common/services/doc-service';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from '../models/sf-project-rights';
import { TEXT_DOCUMENT_INDEX_PATHS, TEXT_DOCUMENTS_COLLECTION, TextDocument } from '../models/text-document';
import { TEXT_DOCUMENT_MIGRATIONS } from './text-document-migrations';

/**
 * This class manages USJ-based text docs.
 */
export class TextDocumentService extends DocService<TextDocument> {
  readonly collection = TEXT_DOCUMENTS_COLLECTION;

  protected readonly indexPaths = TEXT_DOCUMENT_INDEX_PATHS;
  readonly validationSchema: ValidationSchema = {
    bsonType: DocService.validationSchema.bsonType,
    required: DocService.validationSchema.required,
    properties: {
      ...DocService.validationSchema.properties,
      _id: {
        bsonType: 'string',
        pattern: '^[0-9a-f]+:[0-9A-Z]+:[0-9]+:target$'
      },
      type: {
        bsonType: 'string'
      },
      version: {
        bsonType: 'string'
      },
      content: {
        bsonType: ['array', 'null'],
        items: {
          bsonType: ['object', 'string']
        }
      }
    },
    additionalProperties: false // TODO: Change to true after testing
  };

  constructor() {
    super(TEXT_DOCUMENT_MIGRATIONS);
  }

  async allowRead(docId: string, doc: TextDocument, session: ConnectSession): Promise<boolean> {
    if (session.isServer || Object.keys(doc).length === 0) {
      return true;
    }

    const project = await this.getProject(docId);
    return project != null && this.hasRight(project, Operation.View, session.userId);
  }

  async allowUpdate(
    docId: string,
    _oldDoc: TextDocument,
    _newDoc: TextDocument,
    _ops: any,
    session: ConnectSession
  ): Promise<boolean> {
    if (session.isServer) {
      return true;
    }

    const project = await this.getProject(docId);
    return project != null && this.hasRight(project, Operation.Edit, session.userId);
  }

  private hasRight(project: Project, operation: Operation, userId: string): boolean {
    return SF_PROJECT_RIGHTS.hasRight(project, userId, SFProjectDomain.TextDocuments, operation);
  }

  private getProject(docId: string): Promise<Project | undefined> {
    if (this.server == null) {
      throw new Error('The doc service has not been initialized.');
    }
    const projectId = docId.split(':')[0];
    return this.server.getProject(projectId);
  }
}
