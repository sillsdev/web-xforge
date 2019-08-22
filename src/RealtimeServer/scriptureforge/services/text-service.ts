import { Delta } from 'rich-text';
import { ConnectSession } from '../../common/connect-session';
import { Operation } from '../../common/models/project-rights';
import { DocService } from '../../common/services/doc-service';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from '../models/sf-project-rights';

/**
 * This class manages text docs.
 */
export class TextService extends DocService<Delta> {
  readonly collection = 'texts';

  async allowRead(docId: string, doc: Delta, session: ConnectSession): Promise<boolean> {
    if (session.isServer || Object.keys(doc).length === 0) {
      return true;
    }

    if (this.server == null) {
      throw new Error('The doc service has not been initialized.');
    }
    const role = await this.server.getUserProjectRole(session, docId);
    if (role == null) {
      return false;
    }

    return this.hasRight(role, Operation.View);
  }

  async allowUpdate(
    docId: string,
    _oldDoc: Delta,
    _newDoc: Delta,
    _ops: any,
    session: ConnectSession
  ): Promise<boolean> {
    if (session.isServer) {
      return true;
    }

    if (this.server == null) {
      throw new Error('The doc service has not been initialized.');
    }
    const role = await this.server.getUserProjectRole(session, docId);
    if (role == null) {
      return false;
    }

    return this.hasRight(role, Operation.Edit);
  }

  private hasRight(role: string, operation: Operation): boolean {
    return SF_PROJECT_RIGHTS.hasRight(role, { projectDomain: SFProjectDomain.Texts, operation });
  }
}
