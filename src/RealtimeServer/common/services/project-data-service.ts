import ShareDB = require('sharedb');
import { ConnectSession } from '../connect-session';
import { OwnedData } from '../models/owned-data';
import { Operation, ProjectRights } from '../models/project-rights';
import { PathTemplate } from '../path-template';
import { JsonDocService } from './json-doc-service';

export interface ProjectDomainConfig {
  projectDomain: number;
  pathTemplate: PathTemplate;
}

/**
 * This is the abstract base class for all doc services that manage JSON0 project data.
 */
export abstract class ProjectDataService<T> extends JsonDocService<T> {
  protected abstract get projectRights(): ProjectRights;
  private readonly domains: ProjectDomainConfig[];

  constructor() {
    super();
    this.domains = this.setupDomains();
    this.domains.sort((a, b) => {
      if (a.pathTemplate.template.length > b.pathTemplate.template.length) {
        return -1;
      } else if (a.pathTemplate.template.length < b.pathTemplate.template.length) {
        return 1;
      } else {
        return 0;
      }
    });
  }

  async allowRead(docId: string, doc: T, session: ConnectSession): Promise<boolean> {
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

    for (const domain of this.domains) {
      if (
        !this.hasRight(role, domain, Operation.View) &&
        (((doc as unknown) as OwnedData).ownerRef !== session.userId || !this.hasRight(role, domain, Operation.ViewOwn))
      ) {
        return false;
      }
    }
    return true;
  }

  async allowUpdate(docId: string, oldDoc: T, newDoc: T, ops: any, session: ConnectSession): Promise<boolean> {
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

    for (const op of ops) {
      const index = this.getMatchingPathTemplate(this.domains.map(dc => dc.pathTemplate), op.p);
      if (index === -1) {
        return false;
      }
      const domain = this.domains[index];

      if (domain.pathTemplate.template.length < op.p.length) {
        // property update
        const entityPath = op.p.slice(0, domain.pathTemplate.template.length);
        const oldEntity = this.deepGet(entityPath, oldDoc);
        const newEntity = this.deepGet(entityPath, newDoc);
        if (!this.checkJsonEditRight(session.userId, role, domain, oldEntity, newEntity)) {
          return false;
        }
      } else {
        const listOp = op as ShareDB.ListReplaceOp;
        if (listOp.li != null && listOp.ld != null) {
          // replace
          if (!this.checkJsonEditRight(session.userId, role, domain, listOp.ld, listOp.li)) {
            return false;
          }
        } else if (listOp.li != null) {
          // create
          if (!this.checkJsonCreateRight(session.userId, role, domain, listOp.li)) {
            return false;
          }
        } else if (listOp.ld != null) {
          // delete
          if (!this.checkJsonDeleteRight(session.userId, role, domain, listOp.ld)) {
            return false;
          }
        }
      }

      // check if trying to update an immutable property
      if (!this.checkImmutableProps(ops)) {
        return false;
      }
    }
    return true;
  }

  protected abstract setupDomains(): ProjectDomainConfig[];

  private hasRight(role: string, domainConfig: ProjectDomainConfig, operation: Operation): boolean {
    return this.projectRights.hasRight(role, { projectDomain: domainConfig.projectDomain, operation });
  }

  private checkJsonEditRight(
    userId: string,
    role: string,
    domain: ProjectDomainConfig,
    oldEntity: OwnedData,
    newEntity: OwnedData
  ): boolean {
    if (oldEntity.ownerRef !== newEntity.ownerRef) {
      return false;
    }

    if (this.hasRight(role, domain, Operation.Edit)) {
      return true;
    }

    return this.hasRight(role, domain, Operation.EditOwn) && oldEntity.ownerRef === userId;
  }

  private checkJsonCreateRight(
    userId: string,
    role: string,
    domain: ProjectDomainConfig,
    newEntity: OwnedData
  ): boolean {
    return this.hasRight(role, domain, Operation.Create) && newEntity.ownerRef === userId;
  }

  private checkJsonDeleteRight(
    userId: string,
    role: string,
    domain: ProjectDomainConfig,
    oldEntity: OwnedData
  ): boolean {
    if (this.hasRight(role, domain, Operation.Delete)) {
      return true;
    }

    return this.hasRight(role, domain, Operation.DeleteOwn) && oldEntity.ownerRef === userId;
  }

  private deepGet(path: (string | number)[], obj: any): any {
    let curValue = obj;
    for (let i = 0; i < path.length; i++) {
      curValue = curValue[path[i]];
    }
    return curValue;
  }
}
