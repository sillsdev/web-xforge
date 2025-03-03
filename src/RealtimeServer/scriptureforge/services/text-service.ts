import { ConnectSession } from '../../common/connect-session';
import { Project } from '../../common/models/project';
import { Operation } from '../../common/models/project-rights';
import { ValidationSchema } from '../../common/models/validation-schema';
import { DocService } from '../../common/services/doc-service';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from '../models/sf-project-rights';
import { TEXT_INDEX_PATHS, TextData, TEXTS_COLLECTION } from '../models/text-data';
import { TEXT_MIGRATIONS } from './text-migrations';

/**
 * This class manages text docs.
 */
export class TextService extends DocService<TextData> {
  readonly collection = TEXTS_COLLECTION;

  protected readonly indexPaths = TEXT_INDEX_PATHS;
  readonly validationSchema: ValidationSchema = {
    bsonType: DocService.validationSchema.bsonType,
    required: DocService.validationSchema.required,
    properties: {
      ...DocService.validationSchema.properties,
      _id: {
        bsonType: 'string',
        pattern: '^[0-9a-f]+:[0-9A-Z]+:[0-9]+:target$'
      },
      ops: {
        bsonType: 'array',
        items: {
          bsonType: 'object'
        }
      }
    },
    additionalProperties: false
  };

  constructor() {
    super(TEXT_MIGRATIONS);
  }

  async allowCreate(docId: string, doc: TextData, session: ConnectSession): Promise<boolean> {
    if (session.isServer || Object.keys(doc).length === 0) {
      return true;
    }

    const project = await this.getProject(docId);
    return project != null && this.hasRight(project, Operation.Create, session.userId);
  }

  async allowRead(docId: string, doc: TextData, session: ConnectSession): Promise<boolean> {
    if (session.isServer || Object.keys(doc).length === 0) {
      return true;
    }

    const project = await this.getProject(docId);
    return project != null && this.hasRight(project, Operation.View, session.userId);
  }

  async allowUpdate(
    docId: string,
    _oldDoc: TextData,
    _newDoc: TextData,
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
    return SF_PROJECT_RIGHTS.hasRight(project, userId, SFProjectDomain.Texts, operation);
  }

  private getProject(docId: string): Promise<Project | undefined> {
    if (this.server == null) {
      throw new Error('The doc service has not been initialized.');
    }
    const projectId = docId.split(':')[0];
    return this.server.getProject(projectId);
  }
}
