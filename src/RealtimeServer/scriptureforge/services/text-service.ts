import { ConnectSession } from '../../common/connect-session';
import { Operation } from '../../common/models/project-rights';
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

  constructor() {
    super(TEXT_MIGRATIONS);
  }

  async allowRead(docId: string, doc: TextData, session: ConnectSession): Promise<boolean> {
    if (session.isServer || Object.keys(doc).length === 0) {
      return true;
    }

    const role = await this.getUserProjectRole(session, docId);
    if (role == null) {
      return false;
    }

    return this.hasRight(role, Operation.View);
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

    const role = await this.getUserProjectRole(session, docId);
    if (role == null) {
      return false;
    }

    return this.hasRight(role, Operation.Edit);
  }

  private hasRight(role: string, operation: Operation): boolean {
    return SF_PROJECT_RIGHTS.hasRight(role, { projectDomain: SFProjectDomain.Texts, operation });
  }

  private getUserProjectRole(session: ConnectSession, docId: string): Promise<string | undefined> {
    const parts = docId.split(':');
    const projectId = parts[0];
    if (this.server == null) {
      throw new Error('The doc service has not been initialized.');
    }
    return this.server.getUserProjectRole(session, projectId);
  }
}
