import ShareDB from 'sharedb';
import { ConnectSession } from '../connect-session';
import { MigrationConstructor } from '../migration';
import { OwnedData } from '../models/owned-data';
import { Project } from '../models/project';
import { ProjectData } from '../models/project-data';
import { Operation, ProjectRights } from '../models/project-rights';
import { ValidationSchema } from '../models/validation-schema';
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
 * Whether a domain's entities are whole docs, such as a question, rather than entities within them, such as its answers.
 * Its path template is then empty, because the path from the root of the doc to the entity is empty.
 */
function isWholeDocDomain(domain: ProjectDomainConfig): boolean {
  return domain.pathTemplate.template.length === 0;
}

/**
 * This is the abstract base class for all doc services that manage JSON0 project data.
 */
export abstract class ProjectDataService<T extends ProjectData> extends JsonDocService<T> {
  protected abstract get projectRights(): ProjectRights;
  /**
   * Set this property to "true" in services that need to override "onInsert", "onUpdate", and "onDelete"
   */
  protected readonly listenForUpdates: boolean = false;
  private readonly domains: ProjectDomainConfig[];

  // NOTE: Schemas that use this must implement the property "_id"
  static readonly validationSchema: ValidationSchema = {
    bsonType: JsonDocService.validationSchema.bsonType,
    required: JsonDocService.validationSchema.required,
    properties: {
      ...JsonDocService.validationSchema.properties,
      projectRef: {
        bsonType: 'string',
        pattern: '^[0-9a-f]+$'
      },
      ownerRef: {
        bsonType: 'string',
        pattern: '^[0-9a-f]*$'
      }
    }
  };

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
      // Middleware actions are described at https://github.com/share/sharedb/blob/master/docs/middleware/actions.md
      server.use('apply', (context, callback) => {
        if (context.collection === this.collection) {
          this.handleApply(context)
            .then(() => callback())
            .catch(err => callback(err));
        } else {
          callback();
        }
      });
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
    const domain = this.getUpdatedDomain([], doc);
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
    const domain = this.getUpdatedDomain([], doc);
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

    for (const domain of this.getApplicableDomains(doc)) {
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

    // Each op is authorized against the doc that it applies to, rather than the old doc, where an index may be to a
    // different entity
    for (const { op, doc } of this.opsWithDocs(oldDoc, ops)) {
      const domain: ProjectDomainConfig | undefined = this.getUpdatedDomain(op.p, doc);
      if (domain == null) {
        return false;
      }

      let checkEditableProps = true;
      if (domain.pathTemplate.template.length < op.p.length) {
        // property update
        const entity = this.deepGet(op.p.slice(0, domain.pathTemplate.template.length), doc);

        // Changing the deleted property should be treated as a delete operation
        let operation: Operation = Operation.Edit;
        if (op.p[op.p.length - 1] === 'deleted') {
          operation = Operation.Delete;
        }

        if (!this.hasRight(project, domain, operation, session.userId, entity)) {
          return false;
        }
      } else {
        // The entity is taken from the doc, as JSON0 does not check that an op's "ld" is the entity that it deletes
        const entity = this.deepGet(op.p, doc);
        const listOp = op as ShareDB.ListReplaceOp;
        if (listOp.li != null && listOp.ld != null) {
          // replace
          if (entity == null || !this.hasRight(project, domain, Operation.Edit, session.userId, entity)) {
            return false;
          }
        } else if (listOp.li != null) {
          // create
          if (!this.hasRight(project, domain, Operation.Create, session.userId, listOp.li)) {
            return false;
          }
          checkEditableProps = false;
        } else if (listOp.ld != null) {
          // delete, which JSON0 also allows of an entity past the end of the list
          if (entity == null || !this.hasRight(project, domain, Operation.Delete, session.userId, entity)) {
            return false;
          }
          checkEditableProps = false;
        } else if (!this.hasRight(project, domain, Operation.Edit, session.userId, entity)) {
          // any other op on the entity, such as replacing it with "oi" or a property domain's value
          return false;
        }
      }

      if (checkEditableProps) {
        if (!this.changesOnlyEditableProps(op)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Whether a client may query the docs of one project, for services whose client code queries them. The query must
   * name the project by a top-level `projectRef`, as the client's queries do, so that it cannot match docs of any
   * other project. The user must also be able to view some kind of doc there: a right to view, or to view their own,
   * in a domain for whole docs. The read rules still decide which of the matching docs the user sees.
   */
  protected async allowProjectQuery(query: unknown, session: ConnectSession): Promise<boolean> {
    const projectId: string | undefined = this.getQueriedProjectId(query);
    if (projectId == null) {
      return false;
    }

    if (this.server == null) {
      throw new Error('The doc service has not been initialized.');
    }
    const project = await this.server.getProject(projectId);
    if (project == null) {
      return false;
    }

    return this.getApplicableDomains()
      .filter(isWholeDocDomain)
      .some(
        domain =>
          this.projectRights.hasRight(project, session.userId, domain.projectDomain, Operation.View) ||
          this.projectRights.hasRight(project, session.userId, domain.projectDomain, Operation.ViewOwn)
      );
  }

  /**
   * Returns the project that a query is limited to by a top-level `projectRef`, or undefined when it names no single
   * project that way.
   */
  protected getQueriedProjectId(query: unknown): string | undefined {
    if (typeof query === 'object' && query != null && 'projectRef' in query && typeof query.projectRef === 'string') {
      return query.projectRef;
    }
    return undefined;
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

  /**
   * Can be overriden to respond just before an entity is deleted. The "listenForUpdates" property must be set to
   * "true" in order for this method to get called.
   *
   * @param {string} _userId The user id.
   * @param {string} _docId The doc id.
   * @param {string} _projectDomain The project domain of the deleted entity.
   * @param {OwnedData} _entity The deleted entity.
   */
  protected onBeforeDelete(_userId: string, _docId: string, _projectDomain: string, _entity: OwnedData): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Gets the applicable domains based on the properties in the entity.
   * @param _entity A noteThread or note.
   * @returns
   */
  protected getApplicableDomains(_entity?: OwnedData): ProjectDomainConfig[] {
    return this.domains;
  }

  /**
   * Yields each op with the doc that it applies to, which is the old doc as the ops before it left it. The old doc is not
   * changed.
   */
  private *opsWithDocs(oldDoc: T, ops: ShareDB.Op[]): Generator<{ op: ShareDB.Op; doc: T }> {
    let doc: T = oldDoc;
    for (let i = 0; i < ops.length; i++) {
      const op: ShareDB.Op = ops[i];
      yield { op, doc };
      if (i < ops.length - 1) {
        // JSON0 applies an op in place, so the first op is applied to a copy of the old doc, which belongs to ShareDB, and
        // the later ops to that copy
        if (i === 0) {
          doc = structuredClone(oldDoc);
        }
        // The op is cloned, as applying it puts its values into the doc, where later ops would change them
        doc = ShareDB.types.map['json0'].apply(doc, [structuredClone(op)]);
      }
    }
  }

  private getUpdatedDomain(path: ShareDB.Path, entity: OwnedData): ProjectDomainConfig | undefined {
    const domainConfigs: ProjectDomainConfig[] = this.getApplicableDomains(entity);
    const index: number = this.getMatchingPathTemplate(
      domainConfigs.map(dc => dc.pathTemplate),
      path,
      entity
    );
    if (index !== -1) {
      return domainConfigs[index];
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

  private async handleApply(context: ShareDB.middleware.SubmitContext): Promise<void> {
    const connectSession: ConnectSession | undefined = context.agent?.connectSession;
    if (connectSession == null) {
      throw new Error('Op reached has no associated connection session.');
    }
    if (context.op.del != null) {
      const domain = this.getUpdatedDomain([], context.snapshot!.data);
      if (domain != null) {
        await this.onBeforeDelete(connectSession.userId, context.id, domain.projectDomain, context.snapshot!.data);
      }
    } else if (Array.isArray(context.op.op) && context.op.op.some(op => (op as ShareDB.ListDeleteOp).ld != null)) {
      // The deleted entities are kept for "onDelete", as JSON0 does not check that an op's "ld" is the entity it deletes
      const deletedEntities = new Map<ShareDB.Op, OwnedData>();
      for (const { op, doc } of this.opsWithDocs(context.snapshot!.data, context.op.op)) {
        if ((op as ShareDB.ListDeleteOp).ld != null) {
          deletedEntities.set(op, this.deepGet(op.p, doc));
        }
      }
      context.custom.deletedEntities = deletedEntities;
    }
  }

  private async handleAfterSubmit(context: ShareDB.middleware.SubmitContext): Promise<void> {
    const connectSession: ConnectSession | undefined = context.agent?.connectSession;
    if (connectSession == null) {
      throw new Error('Op reached has no associated connection session.');
    }
    if (context.op.create != null) {
      const domain = this.getUpdatedDomain([], context.op.create.data);
      if (domain != null) {
        await this.onInsert(connectSession.userId, context.id, domain.projectDomain, context.op.create.data);
      }
    } else if (context.op.del != null) {
      const domain = this.getUpdatedDomain([], context.snapshot!.data);
      if (domain != null) {
        await this.onDelete(connectSession.userId, context.id, domain.projectDomain, context.snapshot!.data);
      }
    } else if (context.op.op != null) {
      for (const op of context.op.op) {
        const domain = this.getUpdatedDomain(op.p, context.snapshot!.data);
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
            const entity: OwnedData | undefined = context.custom.deletedEntities.get(op);
            if (entity != null) {
              await this.onDelete(connectSession.userId, context.id, domain.projectDomain, entity);
            }
          }
          if (listOp.li != null) {
            await this.onInsert(connectSession.userId, context.id, domain.projectDomain, listOp.li);
          }
        }
      }
    }
  }
}
