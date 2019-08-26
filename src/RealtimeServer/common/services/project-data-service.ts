import ShareDB = require('sharedb');
import { ConnectSession } from '../connect-session';
import { MigrationConstructor } from '../migration';
import { OwnedData } from '../models/owned-data';
import { Operation, ProjectRights } from '../models/project-rights';
import { PathTemplate } from '../path-template';
import { RealtimeServer } from '../realtime-server';
import { JsonDocService } from './json-doc-service';

/**
 * This interface represents the configuration for a project domain. A project domain defines the object path to an
 * entity type stored in a JSON0 doc.
 */
export interface ProjectDomainConfig {
  projectDomain: number;
  pathTemplate: PathTemplate;
}

/**
 * This is the abstract base class for all doc services that manage JSON0 project data.
 */
export abstract class ProjectDataService<T> extends JsonDocService<T> {
  protected abstract get projectRights(): ProjectRights;
  /**
   * Set this property to "true" in services that need to override "onInsert", "onUpdate", and "onDelete"
   */
  protected readonly listenForUpdates: boolean = false;
  private readonly domains: ProjectDomainConfig[];

  constructor(migrations: MigrationConstructor[]) {
    super(migrations);
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

  init(server: RealtimeServer): void {
    super.init(server);
    if (this.listenForUpdates) {
      server.backend.use('afterSubmit', (context, callback) => {
        if (context.collection === this.collection) {
          this.handleAfterSubmit(context)
            .then(() => callback())
            .catch(err => callback(err));
        } else {
          callback();
        }
      });
    }
  }

  protected async allowRead(docId: string, doc: T, session: ConnectSession): Promise<boolean> {
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

  protected async allowUpdate(
    docId: string,
    oldDoc: T,
    newDoc: T,
    ops: ShareDB.Op[],
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

    for (const op of ops) {
      const domain = this.getUpdatedDomain(op.p);
      if (domain == null) {
        return false;
      }

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
    }

    // check if trying to update an immutable property
    if (!this.checkImmutableProps(ops)) {
      return false;
    }

    return true;
  }

  /**
   * Creates the project domain configs for this service.
   *
   * @returns {ProjectDomainConfig[]} The project domain configs.
   */
  protected abstract setupDomains(): ProjectDomainConfig[];

  /**
   * Can be overriden to handle entity inserts. The "listenForUpdates" property must be set to "true" in order for this
   * method to get called.
   *
   * @param {string} _docId The doc id.
   * @param {number} _projectDomain The project domain of the inserted entity.
   * @param {OwnedData} _entity The inserted entity.
   */
  protected onInsert(_docId: string, _projectDomain: number, _entity: OwnedData): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Can be overriden to handle entity updates. The "listenForUpdates" property must be set to "true" in order for this
   * method to get called.
   *
   * @param {string} _docId The doc id.
   * @param {number} _projectDomain The project domain of the updated entity.
   * @param {OwnedData} _entity The updated entity.
   */
  protected onUpdate(_docId: string, _projectDomain: number, _entity: OwnedData): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Can be overriden to handle entity deletes. The "listenForUpdates" property must be set to "true" in order for this
   * method to get called.
   *
   * @param {string} _docId The doc id.
   * @param {number} _projectDomain The project domain of the deleted entity.
   * @param {OwnedData} _entity The deleted entity.
   */
  protected onDelete(_docId: string, _projectDomain: number, _entity: OwnedData): Promise<void> {
    return Promise.resolve();
  }

  private getUpdatedDomain(path: ShareDB.Path): ProjectDomainConfig | undefined {
    const index = this.getMatchingPathTemplate(this.domains.map(dc => dc.pathTemplate), path);
    if (index !== -1) {
      return this.domains[index];
    }

    return undefined;
  }

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

  private deepGet(path: ShareDB.Path, obj: any): any {
    let curValue = obj;
    for (let i = 0; i < path.length; i++) {
      curValue = curValue[path[i]];
    }
    return curValue;
  }

  private async handleAfterSubmit(context: ShareDB.middleware.SubmitContext): Promise<void> {
    if (context.op.create != null) {
      const domain = this.getUpdatedDomain([]);
      if (domain != null) {
        await this.onInsert(context.id, domain.projectDomain, context.op.create.data);
      }
    } else if (context.op.del != null) {
      const domain = this.getUpdatedDomain([]);
      if (domain != null) {
        await this.onDelete(context.id, domain.projectDomain, context.snapshot!.data);
      }
    } else if (context.op.op != null) {
      for (const op of context.op.op) {
        const domain = this.getUpdatedDomain(op.p);
        if (domain == null) {
          return;
        }

        if (domain.pathTemplate.template.length < op.p.length) {
          const entityPath = op.p.slice(0, domain.pathTemplate.template.length);
          const entity = this.deepGet(entityPath, context.snapshot!.data);
          await this.onUpdate(context.id, domain.projectDomain, entity);
        } else {
          const listOp = op as ShareDB.ListReplaceOp;
          if (listOp.ld != null) {
            await this.onDelete(context.id, domain.projectDomain, listOp.ld);
          }
          if (listOp.li != null) {
            await this.onInsert(context.id, domain.projectDomain, listOp.li);
          }
        }
      }
    }
  }
}
