import { Db } from 'mongodb';
import ShareDB from 'sharedb';
import shareDBAccess from 'sharedb-access';
import { Connection, Doc, RawOp } from 'sharedb/lib/client';
import { ConnectSession } from './connect-session';
import { Project } from './models/project';
import { SchemaVersionRepository } from './schema-version-repository';
import { DocService } from './services/doc-service';
import { createFetchQuery, docFetch } from './utils/sharedb-utils';

export const XF_USER_ID_CLAIM = 'http://xforge.org/userid';
export const XF_ROLE_CLAIM = 'http://xforge.org/role';

export type RealtimeServerConstructor = new (
  siteId: string,
  migrationsDisabled: boolean,
  db: ShareDB.DB,
  schemaVersions: SchemaVersionRepository
) => RealtimeServer;

/**
 * This class extends the ShareDB connection class to preserve the migration version property in the request.
 */
class MigrationConnection extends Connection {
  sendOp(doc: Doc, op: RawOp): void {
    this._addDoc(doc);
    const message: any = {
      a: 'op',
      c: doc.collection,
      d: doc.id,
      v: doc.version,
      src: op.src,
      seq: op.seq
    };
    if (op.op != null) {
      message.op = op.op;
    }
    if (op.create != null) {
      message.create = op.create;
    }
    if (op.del != null) {
      message.del = op.del;
    }
    if (op.mv != null) {
      message.mv = op.mv;
    }
    this.send(message);
  }
}

/**
 * This class extends the ShareDB agent class to preserve the migration version property from the request.
 * Note: Because this overrides behavior of ShareDB.Agent, when there are changes to ShareDB.Agent
 * this class may need to be updated.
 */
class MigrationAgent extends ShareDB.Agent {
  _handleMessage(request: any, callback: any): void {
    if (request.a === 'op') {
      const errMessage = this._checkRequest(request);
      if (errMessage != null) {
        callback({ code: 4000, message: errMessage });
        return;
      }

      // src can be provided if it is not the same as the current agent,
      // such as a resubmission after a reconnect, but it usually isn't needed
      const src = request.src || this._src();
      // c, d, and m arguments are intentionally undefined. These are set later
      const op: any = { src, seq: request.seq, v: request.v, mv: request.mv, c: undefined, d: undefined, m: undefined };
      if (request.op != null) {
        op.op = request.op;
      } else if (request.create != null) {
        op.create = request.create;
      } else if (request.del != null) {
        op.del = request.del;
      } else {
        callback({ code: 4000, message: 'Invalid op message' });
        return;
      }
      this._submit(request.c, request.d, op, callback);
    } else {
      super._handleMessage(request, callback);
    }
  }
}

/**
 * Submits a migration op to the specified doc.
 *
 * @param {number} version The migration version.
 * @param {Doc} doc The doc.
 * @param {*} component The op.
 * @returns {Promise<void>}
 */
export function submitMigrationOp(version: number, doc: Doc, component: any): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const op: RawOp = { op: component, mv: version };
    doc._submit(op, undefined, err => {
      if (err != null) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

export interface RealtimeServer extends ShareDB, shareDBAccess.AccessControlBackend {}

/**
 * This class represents the real-time server. It extends ShareDB and adds support for migrations and access control.
 */
export class RealtimeServer extends ShareDB {
  private readonly docServices = new Map<string, DocService>();
  private defaultConnection?: Connection;

  constructor(
    private readonly siteId: string,
    readonly migrationsDisabled: boolean,
    docServices: DocService[],
    private readonly projectsCollection: string,
    db: ShareDB.DB,
    private readonly schemaVersions: SchemaVersionRepository
  ) {
    super({
      db,
      presence: true,
      disableDocAction: true,
      disableSpaceDelimitedActions: true
    });
    shareDBAccess(this);

    this.use('connect', (context, done) => {
      context.stream.checkServerAccess = true;
      this.setConnectSession(context)
        .then(() => done())
        .catch(err => done(err));
    });

    for (const docService of docServices) {
      docService.init(this);
      this.docServices.set(docService.collection, docService);
    }

    this.use('submit', (context, done) => {
      context.op.c = context.collection;
      if (context.op.mv != null) {
        context.op.m.migration = context.op.mv;
        delete context.op.mv;
      }
      done();
    });

    const origTransform = ShareDB.ot.transform;
    ShareDB.ot.transform = (type: string, op: ShareDB.RawOp, appliedOp: ShareDB.RawOp) => {
      if (op.c != null && op.v != null && appliedOp.m.migration != null) {
        const docService = this.docServices.get(op.c);
        const migration = docService!.getMigration(appliedOp.m.migration);
        try {
          migration.migrateOp(op);
          op.v++;
        } catch (err) {
          return err;
        }
      } else {
        return origTransform(type, op, appliedOp);
      }
    };
    this.use('apply', (context, done) => {
      delete context.op.c;
      done();
    });

    this.defaultConnection = this.connect();
  }

  async createIndexes(db: Db): Promise<void> {
    await this.schemaVersions.createIndex();
    for (const docService of this.docServices.values()) {
      await docService.createIndexes(db);
    }
  }

  connect(userId?: string): Connection;
  connect(connection?: Connection, req?: any): Connection;
  connect(connectionOrUserId?: Connection | string, req?: any): Connection {
    let connection: Connection;
    if (connectionOrUserId instanceof Connection) {
      connection = connectionOrUserId;
    } else {
      connection = new MigrationConnection({
        close: () => {
          // do nothing
        }
      } as WebSocket);
      if (connectionOrUserId != null) {
        req = { userId: connectionOrUserId };
      }
    }
    return super.connect(connection, req);
  }

  listen(stream: any, req?: any): ShareDB.Agent {
    const agent = new MigrationAgent(this, stream);
    this.trigger('connect', agent, { stream, req }, err => {
      if (err) {
        return agent.close(err);
      }
      agent._open();
    });
    return agent;
  }

  async getProject(projectId: string): Promise<Project | undefined> {
    const projectDoc = this.defaultConnection!.get(this.projectsCollection, projectId);
    await docFetch(projectDoc);
    return projectDoc.data as Project | undefined;
  }

  async migrateIfNecessary(): Promise<void> {
    if (this.migrationsDisabled) {
      return;
    }
    const versionMap = new Map<string, number>();
    for (const schemaVersion of await this.schemaVersions.getAll()) {
      versionMap.set(schemaVersion.collection, schemaVersion.version);
    }
    for (const docService of this.docServices.values()) {
      let curVersion = versionMap.get(docService.collection);
      if (curVersion == null) {
        curVersion = 0;
      }
      const version = docService.schemaVersion;
      if (curVersion === version) {
        continue;
      }
      const query = await createFetchQuery(this.defaultConnection!, docService.collection, {});
      while (curVersion < version) {
        curVersion++;
        const promises: Promise<void>[] = [];
        const migration = docService.getMigration(curVersion);
        for (const doc of query.results) {
          promises.push(migration.migrateDoc(doc));
        }
        await Promise.all(promises);
      }

      await this.schemaVersions.set(docService.collection, version);
    }
  }

  private async setConnectSession(context: ShareDB.middleware.ConnectContext): Promise<void> {
    let session: ConnectSession;
    if (context.req != null && context.req.user != null) {
      const userId = context.req.user[XF_USER_ID_CLAIM];
      const role = context.req.user[XF_ROLE_CLAIM];
      session = {
        userId,
        role,
        isServer: false
      };
    } else {
      let userId = '';
      if (context.req != null && context.req.userId != null) {
        userId = context.req.userId;
      }
      session = { isServer: true, userId };
    }
    context.agent.connectSession = session;
  }
}
