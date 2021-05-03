import ShareDB from 'sharedb';
import { ConnectSession } from '../connect-session';
import { MigrationConstructor } from '../migration';
import { OwnedData } from '../models/owned-data';
import { Project } from '../models/project';
import { ProjectData } from '../models/project-data';
import { Operation, ProjectRights } from '../models/project-rights';
import { RealtimeServer } from '../realtime-server';
import { ObjPathTemplate } from '../utils/obj-path';
import { JsonDocService } from './json-doc-service';

/**
 * This interface represents the configuration for a project domain. A project domain defines the object path to an
 * entity type stored in a JSON0 doc.
 */
export interface ProjectDomainConfig {
  projectDomain: string;
  pathTemplate: ObjPathTemplate;
}

/**
 * This is the abstract base class for all doc services that manage JSON0 project data.
 */
export abstract class ProjectDataService<T extends ProjectData> extends JsonDocService<T> {
  protected readonly immutableProps: ObjPathTemplate[] = [
    this.pathTemplate(pd => pd.projectRef),
    this.pathTemplate(pd => pd.ownerRef)
  ];
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
      server.use('afterWrite', (context, callback) => {
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

  protected async allowCreate(_docId: string, doc: T, session: ConnectSession): Promise<boolean> {
    if (session.isServer) {
      return true;
    }

    if (this.server == null) {
      throw new Error('The doc service has not been initialized.');
    }
    const project = await this.server.getProject(doc.projectRef);
    const domain = this.getUpdatedDomain([]);
    return project != null && domain != null && this.hasRight(project, domain, Operation.Create, session.userId, doc);
  }

  protected async allowDelete(_docId: string, doc: T, session: ConnectSession): Promise<boolean> {
    if (session.isServer) {
      return true;
    }

    if (this.server == null) {
      throw new Error('The doc service has not been initialized.');
    }
    const project = await this.server.getProject(doc.projectRef);
    const domain = this.getUpdatedDomain([]);
    return project != null && domain != null && this.hasRight(project, domain, Operation.Delete, session.userId, doc);
  }

  protected async allowRead(_docId: string, doc: T, session: ConnectSession): Promise<boolean> {
    if (session.isServer || Object.keys(doc).length === 0) {
      return true;
    }

    if (this.server == null) {
      throw new Error('The doc service has not been initialized.');
    }
    const project = await this.server.getProject(doc.projectRef);
    if (project == null) {
      return false;
    }

    for (const domain of this.domains) {
      if (!this.hasRight(project, domain, Operation.View, session.userId, doc)) {
        return false;
      }
    }
    return true;
  }

  protected async allowUpdate(
    _docId: string,
    oldDoc: T,
    _newDoc: T,
    ops: ShareDB.Op[],
    session: ConnectSession
  ): Promise<boolean> {
    if (session.isServer) {
      return true;
    }

    if (this.server == null) {
      throw new Error('The doc service has not been initialized.');
    }
    const project = await this.server.getProject(oldDoc.projectRef);
    if (project == null) {
      return false;
    }

    for (const op of ops) {
      const domain = this.getUpdatedDomain(op.p);
      if (domain == null) {
        return false;
      }

      let checkImmutableProps = true;
      if (domain.pathTemplate.template.length < op.p.length) {
        // property update
        const entityPath = op.p.slice(0, domain.pathTemplate.template.length);
        const oldEntity = this.deepGet(entityPath, oldDoc);
        // if the entity doesn't exist in the old doc, then it must be inserted by a previous op that the user has a
        // right to perform, so we don't need to check this edit right
        if (oldEntity != null && !this.hasRight(project, domain, Operation.Edit, session.userId, oldEntity)) {
          return false;
        }
      } else {
        const listOp = op as ShareDB.ListReplaceOp;
        if (listOp.li != null && listOp.ld != null) {
          // replace
          if (!this.hasRight(project, domain, Operation.Edit, session.userId, listOp.ld)) {
            return false;
          }
        } else if (listOp.li != null) {
          // create
          if (!this.hasRight(project, domain, Operation.Create, session.userId, listOp.li)) {
            return false;
          }
          checkImmutableProps = false;
        } else if (listOp.ld != null) {
          // delete
          if (!this.hasRight(project, domain, Operation.Delete, session.userId, listOp.ld)) {
            return false;
          }
          checkImmutableProps = false;
        }
      }

      if (checkImmutableProps) {
        if (!this.checkImmutableProps(op)) {
          return false;
        }
      }
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
   * @param {string} _userId The user id.
   * @param {string} _docId The doc id.
   * @param {string} _projectDomain The project domain of the inserted entity.
   * @param {OwnedData} _entity The inserted entity.
   */
  protected onInsert(_userId: string, _docId: string, _projectDomain: string, _entity: OwnedData): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Can be overriden to handle entity updates. The "listenForUpdates" property must be set to "true" in order for this
   * method to get called.
   *
   * @param {string} _userId The user id.
   * @param {string} _docId The doc id.
   * @param {string} _projectDomain The project domain of the updated entity.
   * @param {OwnedData} _entity The updated entity.
   */
  protected onUpdate(_userId: string, _docId: string, _projectDomain: string, _entity: OwnedData): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Can be overriden to handle entity deletes. The "listenForUpdates" property must be set to "true" in order for this
   * method to get called.
   *
   * @param {string} _userId The user id.
   * @param {string} _docId The doc id.
   * @param {string} _projectDomain The project domain of the deleted entity.
   * @param {OwnedData} _entity The deleted entity.
   */
  protected onDelete(_userId: string, _docId: string, _projectDomain: string, _entity: OwnedData): Promise<void> {
    return Promise.resolve();
  }

  private getUpdatedDomain(path: ShareDB.Path): ProjectDomainConfig | undefined {
    const index = this.getMatchingPathTemplate(
      this.domains.map(dc => dc.pathTemplate),
      path
    );
    if (index !== -1) {
      return this.domains[index];
    }

    return undefined;
  }

  private hasRight(
    project: Project,
    domain: ProjectDomainConfig,
    operation: Operation,
    userId: string,
    data: OwnedData
  ): boolean {
    return this.projectRights.hasRight(project, userId, domain.projectDomain, operation, data);
  }

  private deepGet(path: ShareDB.Path, obj: any): any {
    let curValue = obj;
    for (const part of path) {
      if (curValue == null) {
        return undefined;
      }
      curValue = curValue[part];
    }
    return curValue;
  }

  private async handleAfterSubmit(context: ShareDB.middleware.SubmitContext): Promise<void> {
    const connectSession = context.agent.connectSession as ConnectSession;
    if (context.op.create != null) {
      const domain = this.getUpdatedDomain([]);
      if (domain != null) {
        await this.onInsert(connectSession.userId, context.id, domain.projectDomain, context.op.create.data);
      }
    } else if (context.op.del != null) {
      const domain = this.getUpdatedDomain([]);
      if (domain != null) {
        await this.onDelete(connectSession.userId, context.id, domain.projectDomain, context.snapshot!.data);
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
          await this.onUpdate(connectSession.userId, context.id, domain.projectDomain, entity);
        } else {
          const listOp = op as ShareDB.ListReplaceOp;
          if (listOp.ld != null) {
            await this.onDelete(connectSession.userId, context.id, domain.projectDomain, listOp.ld);
          }
          if (listOp.li != null) {
            await this.onInsert(connectSession.userId, context.id, domain.projectDomain, listOp.li);
          }
        }
      }
    }
  }
}
