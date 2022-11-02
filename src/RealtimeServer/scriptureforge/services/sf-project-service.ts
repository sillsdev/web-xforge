import ShareDB from 'sharedb';
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
import { Operation } from '../../common/models/project-rights';
import { ConnectSession } from '../../common/connect-session';
import { SystemRole } from '../../common/models/system-role';
import { SF_PROJECT_MIGRATIONS } from './sf-project-migrations';

const SF_PROJECT_PROFILE_FIELDS: ShareDB.ProjectionFields = {
  name: true,
  paratextId: true,
  userRoles: true,
  userPermissions: true,
  shortName: true,
  writingSystem: true,
  isRightToLeft: true,
  editable: true,
  defaultFontSize: true,
  defaultFont: true,
  translateConfig: true,
  checkingConfig: true,
  texts: true,
  syncDisabled: true,
  sync: true,
  tagIcon: true
};

/**
 * This class manages SF project docs.
 */
export class SFProjectService extends ProjectService<SFProject> {
  readonly collection = SF_PROJECTS_COLLECTION;

  protected readonly indexPaths = SF_PROJECT_INDEX_PATHS;
  protected readonly projectAdminRole = SFProjectRole.ParatextAdministrator;

  constructor() {
    super(SF_PROJECT_MIGRATIONS);

    const immutableProps = [
      this.pathTemplate(p => p.sync),
      this.pathTemplate(p => p.paratextId),
      this.pathTemplate(p => p.paratextUsers),
      this.pathTemplate(p => p.texts),
      this.pathTemplate(p => p.translateConfig),
      this.pathTemplate(p => p.checkingConfig),
      this.pathTemplate(p => p.shortName),
      this.pathTemplate(p => p.writingSystem)
    ];
    this.immutableProps.push(...immutableProps);
  }

  init(server: RealtimeServer): void {
    server.addProjection(SF_PROJECT_PROFILES_COLLECTION, this.collection, SF_PROJECT_PROFILE_FIELDS);
    super.init(server);
  }

  protected allowRead(docId: string, doc: SFProject, session: ConnectSession): boolean {
    if (session.isServer || session.role === SystemRole.SystemAdmin || Object.keys(doc).length === 0) {
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
