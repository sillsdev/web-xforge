import { ConnectSession } from '../../common/connect-session';
import { Project } from '../../common/models/project';
import { Operation } from '../../common/models/project-rights';
import { DocService } from '../../common/services/doc-service';
import { SFProjectDomain, SF_PROJECT_RIGHTS } from '../models/sf-project-rights';
import { TextData, TEXTS_COLLECTION, TEXT_INDEX_PATHS } from '../models/text-data';
import { TEXT_MIGRATIONS } from './text-migrations';

/**
 * This class manages text docs.
 */
export class TextService extends DocService<TextData> {
  readonly collection = TEXTS_COLLECTION;

  protected readonly indexPaths = TEXT_INDEX_PATHS;

  constructor() {
    super(TEXT_MIGRATIONS);
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
