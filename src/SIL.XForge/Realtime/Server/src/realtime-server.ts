import express = require('express');
import * as http from 'http';
import { JwtHeader, SigningKeyCallback, verify } from 'jsonwebtoken';
import jwks = require('jwks-rsa');
import { Db, MongoClient } from 'mongodb';
import * as OTJson0 from 'ot-json0';
import * as RichText from 'rich-text';
import ShareDB = require('sharedb');
import shareDBAccess = require('sharedb-access');
import shareDBMongo = require('sharedb-mongo');
import WebSocketJSONStream = require('websocket-json-stream');
import ws = require('ws');
import { CollectionConfig, DomainConfig, PathTemplateConfig, RealtimeServerOptions } from './realtime-server-options';
import { ShareDBAccessControl } from './sharedb-access-control';

ShareDB.types.register(RichText.type);
ShareDB.types.register(OTJson0.type);

const XF_USER_ID_CLAIM = 'http://xforge.org/userid';
const XF_ROLE_CLAIM = 'http://xforge.org/role';

const SYSTEM_ADMIN_ROLE = 'system_admin';

const USER_PROFILE_FIELDS: ProjectionFields = {
  displayName: true,
  avatarUrl: true
};

// This should stay in sync with the corresponding enum in "Models/Operation.cs".
enum Operation {
  Create = 1,
  Edit = 2,
  Delete = 3,
  View = 4,

  EditOwn = 5,
  DeleteOwn = 6,
  ViewOwn = 7
}

interface ConnectSession {
  userId: string;
  role: string;
  projectRoles: Map<string, string>;
  isServer: boolean;
}

interface ProjectionFields {
  [propertyName: string]: true;
}

function isLocalRequest(request: http.IncomingMessage): boolean {
  const addr = request.connection.remoteAddress;
  return addr === '127.0.0.1' || addr === '::ffff:127.0.0.1' || addr === '::1';
}

function deepGet(path: (string | number)[], obj: any): any {
  let curValue = obj;
  for (let i = 0; i < path.length; i++) {
    curValue = curValue[path[i]];
  }
  return curValue;
}

function getProjectId(docId: string): string {
  const parts = docId.split(':');
  return parts[0];
}

export class RealtimeServer {
  protected readonly backend: ShareDB & ShareDBAccessControl<ConnectSession>;
  protected database?: Db;

  private readonly connectionString: string;
  private readonly port: number;
  private readonly projectsCollectionName: string;
  private readonly audience: string;
  private readonly scope: string;
  private readonly httpServer: http.Server;
  private readonly jwksClient: jwks.JwksClient;
  private readonly projectAdminRole: string;
  private readonly connections = new Map<number, ShareDB.Connection>();
  private readonly projectRoles = new Map<string, Set<number>>();
  private connectionIndex = 0;

  constructor(options: RealtimeServerOptions) {
    this.connectionString = options.connectionString;
    this.port = options.port;
    this.projectsCollectionName = options.projectsCollection.name;
    this.audience = options.audience;
    this.scope = options.scope;
    this.projectAdminRole = options.projectAdminRole;
    this.projectRoles = new Map();
    for (const role of options.projectRoles) {
      this.projectRoles.set(role.name, new Set(role.rights));
    }

    // Create web servers to serve files and listen to WebSocket connections
    const app = express();
    app.use(express.static('static'));
    this.httpServer = http.createServer(app);

    this.jwksClient = jwks({
      cache: true,
      jwksUri: `${options.authority}.well-known/jwks.json`
    });

    const backend = new ShareDB({
      db: shareDBMongo(this.connectionString),
      disableDocAction: true,
      disableSpaceDelimitedActions: true
    });
    shareDBAccess(backend);
    this.backend = backend as ShareDB & ShareDBAccessControl<ConnectSession>;
    this.backend.addProjection(options.userProfilesCollectionName, options.usersCollection.name, USER_PROFILE_FIELDS);
    this.backend.use('connect', (context, done) => {
      this.setConnectSession(context)
        .then(() => done())
        .catch(err => done(err));
    });

    // users access control
    this.addUsersAccessRules(options.usersCollection);

    // projects access control
    this.addProjectsAccessRules(options.projectsCollection);

    // project data access control
    for (const collectionConfig of options.projectDataCollections) {
      this.addProjectDataAccessRules(collectionConfig);
    }

    // Connect any incoming WebSocket connection to ShareDB
    const wss = new ws.Server({
      server: this.httpServer,
      verifyClient: (info, done) => this.verifyToken(info, done)
    });
    wss.on('connection', (webSocket: WebSocket, req: http.IncomingMessage) => {
      const stream = new WebSocketJSONStream(webSocket);
      (this.backend as any).listen(stream, req);
    });
  }

  async init(): Promise<RealtimeServer> {
    this.database = await MongoClient.connect(this.connectionString);
    return this;
  }

  start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.httpServer.once('error', err => {
        console.log('Error in Realtime Server:' + err);
        reject(err);
      });
      this.httpServer.once('listening', () => {
        console.log('Realtime Server is listening on http://localhost:' + this.port);
        resolve();
      });
      this.httpServer.listen(this.port);
    });
  }

  stop(): void {
    if (!this.httpServer.listening) {
      return;
    }

    if (this.database != null) {
      this.database.close();
    }
    this.backend.close();
    this.httpServer.close();
    console.log('Realtime Server stopped.');
  }

  connect(): number {
    const connection = this.backend.connect() as ShareDB.Connection;
    const index = this.connectionIndex++;
    this.connections.set(index, connection);
    return index;
  }

  disconnect(handle: number): void {
    this.connections.delete(handle);
  }

  getDoc(handle: number, collection: string, id: string): ShareDB.Doc | undefined {
    const conn = this.connections.get(handle);
    if (conn != null) {
      return conn.get(collection, id);
    }
    return undefined;
  }

  protected addProjectsAccessRules(collectionConfig: CollectionConfig): void {
    this.backend.allowCreate(collectionConfig.name, (_docId, _doc, session) => {
      return session.isServer;
    });
    this.backend.allowDelete(collectionConfig.name, (_docId, _doc, session) => {
      return session.isServer;
    });
    this.backend.allowRead(collectionConfig.name, (_docId, doc, session) => {
      if (session.isServer || session.role === SYSTEM_ADMIN_ROLE || Object.keys(doc).length === 0) {
        return true;
      }

      return session.userId in doc.userRoles;
    });
    this.backend.allowUpdate(collectionConfig.name, (_docId, _oldDoc, newDoc, ops, session) => {
      if (session.isServer || session.role === SYSTEM_ADMIN_ROLE) {
        return true;
      }

      const projectRole = newDoc.userRoles[session.userId];
      if (projectRole !== this.projectAdminRole) {
        return false;
      }

      for (const op of ops) {
        if (this.getMatchingPathTemplate(collectionConfig.immutableProps, op.p) !== -1) {
          return false;
        }
      }
      return true;
    });
  }

  protected addProjectDataAccessRules(collectionConfig: CollectionConfig): void {
    this.backend.allowCreate(collectionConfig.name, (_docId, _doc, session) => {
      return session.isServer;
    });
    this.backend.allowDelete(collectionConfig.name, (_docId, _doc, session) => {
      return session.isServer;
    });
    this.backend.allowRead(collectionConfig.name, async (docId, doc, session) => {
      if (session.isServer || Object.keys(doc).length === 0) {
        return true;
      }

      const projectId = getProjectId(docId);
      if (projectId === '') {
        return false;
      }
      const role = await this.getUserProjectRole(session, projectId);
      if (role == null) {
        return false;
      }

      for (const domainConfig of collectionConfig.domains) {
        if (
          !this.hasRight(role, domainConfig.domain, Operation.View) &&
          (doc.ownerRef !== session.userId || !this.hasRight(role, domainConfig.domain, Operation.ViewOwn))
        ) {
          return false;
        }
      }
      return true;
    });
    this.backend.allowUpdate(collectionConfig.name, async (docId, oldDoc, newDoc, ops, session) => {
      if (session.isServer) {
        return true;
      }

      const projectId = getProjectId(docId);
      const role = await this.getUserProjectRole(session, projectId);
      if (role == null) {
        return false;
      }

      switch (collectionConfig.otTypeName) {
        case RichText.type.name:
          if (!this.hasRight(role, collectionConfig.domains[0].domain, Operation.Edit)) {
            return false;
          }
          break;

        case OTJson0.type.name:
          for (const op of ops) {
            const index = this.getMatchingPathTemplate(collectionConfig.domains.map(dc => dc.pathTemplate), op.p);
            if (index === -1) {
              return false;
            }
            const domainConfig = collectionConfig.domains[index];

            if (domainConfig.pathTemplate.template.length < op.p.length) {
              // property update
              const entityPath = op.p.slice(0, domainConfig.pathTemplate.template.length);
              const oldEntity = deepGet(entityPath, oldDoc);
              const newEntity = deepGet(entityPath, newDoc);
              if (!this.checkJsonEditRight(session.userId, role, domainConfig, oldEntity, newEntity)) {
                return false;
              }
            } else {
              const listOp = op as ShareDB.ListReplaceOp;
              if (listOp.li != null && listOp.ld != null) {
                // replace
                if (!this.checkJsonEditRight(session.userId, role, domainConfig, listOp.ld, listOp.li)) {
                  return false;
                }
              } else if (listOp.li != null) {
                // create
                if (!this.checkJsonCreateRight(session.userId, role, domainConfig, listOp.li)) {
                  return false;
                }
              } else if (listOp.ld != null) {
                // delete
                if (!this.checkJsonDeleteRight(session.userId, role, domainConfig, listOp.ld)) {
                  return false;
                }
              }
            }

            // check if trying to update an immutable property
            if (this.getMatchingPathTemplate(collectionConfig.immutableProps, op.p) !== -1) {
              return false;
            }
          }
          break;
      }
      return true;
    });
  }

  private getKey(header: JwtHeader, done: SigningKeyCallback): void {
    if (header.kid == null) {
      done('No key ID.');
      return;
    }
    this.jwksClient.getSigningKey(header.kid, (err, key) => {
      if (err) {
        done(err);
      } else {
        const certKey = key as jwks.CertSigningKey;
        const rsaKey = key as jwks.RsaSigningKey;
        const signingKey = certKey.publicKey || rsaKey.rsaPublicKey;
        done(null, signingKey);
      }
    });
  }

  private verifyToken(
    info: { origin: string; secure: boolean; req: http.IncomingMessage },
    done: (res: boolean, code?: number, message?: string, headers?: http.OutgoingHttpHeaders) => void
  ): void {
    const url = info.req.url;
    if (url != null && url.includes('?access_token=')) {
      const token = url.split('?access_token=')[1];
      verify(
        token,
        (header, verifyDone) => this.getKey(header, verifyDone),
        { audience: this.audience },
        (err, decoded: any) => {
          if (err) {
            done(false, 401, 'Unauthorized');
          } else {
            const scopeClaim = decoded['scope'];
            if (scopeClaim != null && scopeClaim.split(' ').includes(this.scope)) {
              (info.req as any).user = decoded;
              done(true);
            } else {
              done(false, 401, 'A required scope has not been granted.');
            }
          }
        }
      );
    } else if (isLocalRequest(info.req)) {
      done(true);
    } else {
      done(false, 401, 'Unauthorized');
    }
  }

  private async getUserProjectRoles(userId: string): Promise<Map<string, string>> {
    if (this.database == null) {
      throw new Error('The server has not been initialized.');
    }
    const coll = this.database.collection(this.projectsCollectionName);
    const projects = await coll.find({ ['userRoles.' + userId]: { $exists: true } }).toArray();
    const projectRoles = new Map<string, string>();
    for (const project of projects) {
      const role = project.userRoles[userId];
      projectRoles.set(project._id, role);
    }
    return projectRoles;
  }

  private async setConnectSession(context: ShareDB.middleware.ConnectContext): Promise<void> {
    if (context.stream.isServer || context.req.user == null) {
      context.agent.connectSession = { isServer: true };
    } else {
      const userId = context.req.user[XF_USER_ID_CLAIM];
      const role = context.req.user[XF_ROLE_CLAIM];
      const session: ConnectSession = {
        userId,
        role,
        isServer: false,
        projectRoles: await this.getUserProjectRoles(userId)
      };
      context.agent.connectSession = session;
    }
  }

  private async getUserProjectRole(session: ConnectSession, projectId: string): Promise<string | undefined> {
    let projectRole = session.projectRoles.get(projectId);
    if (projectRole == null) {
      session.projectRoles = await this.getUserProjectRoles(session.userId);
      projectRole = session.projectRoles.get(projectId);
    }
    return projectRole;
  }

  private addUsersAccessRules(collectionConfig: CollectionConfig): void {
    this.backend.allowCreate(collectionConfig.name, (_docId, _doc, session) => {
      return session.isServer;
    });
    this.backend.allowDelete(collectionConfig.name, (_docId, _doc, session) => {
      return session.isServer;
    });
    this.backend.allowRead(collectionConfig.name, (docId, doc, session) => {
      if (session.isServer || session.role === SYSTEM_ADMIN_ROLE) {
        return true;
      }
      if (docId === session.userId) {
        return true;
      }

      for (const key of Object.keys(doc)) {
        if (!USER_PROFILE_FIELDS.hasOwnProperty(key)) {
          return false;
        }
      }

      return true;
    });
    this.backend.allowUpdate(collectionConfig.name, (docId, _oldDoc, _newDoc, ops, session) => {
      if (session.isServer || session.role === SYSTEM_ADMIN_ROLE) {
        return true;
      }
      if (docId !== session.userId) {
        return false;
      }

      for (const op of ops) {
        if (this.getMatchingPathTemplate(collectionConfig.immutableProps, op.p) !== -1) {
          return false;
        }
      }
      return true;
    });
  }

  private hasRight(role: string, domain: number, operation: Operation): boolean {
    const rights = this.projectRoles.get(role);
    if (rights == null) {
      return false;
    }
    return rights.has(domain + operation);
  }

  private checkJsonEditRight(
    userId: string,
    role: string,
    domainConfig: DomainConfig,
    oldEntity: any,
    newEntity: any
  ): boolean {
    if (oldEntity.ownerRef !== newEntity.ownerRef) {
      return false;
    }

    if (this.hasRight(role, domainConfig.domain, Operation.Edit)) {
      return true;
    }

    return this.hasRight(role, domainConfig.domain, Operation.EditOwn) && oldEntity.ownerRef === userId;
  }

  private checkJsonCreateRight(userId: string, role: string, domainConfig: DomainConfig, newEntity: any): boolean {
    return this.hasRight(role, domainConfig.domain, Operation.Create) && newEntity.ownerRef === userId;
  }

  private checkJsonDeleteRight(userId: string, role: string, domainConfig: DomainConfig, oldEntity: any): boolean {
    if (this.hasRight(role, domainConfig.domain, Operation.Delete)) {
      return true;
    }

    return this.hasRight(role, domainConfig.domain, Operation.DeleteOwn) && oldEntity.ownerRef === userId;
  }

  private getMatchingPathTemplate(pathTemplateConfigs: PathTemplateConfig[], path: ShareDB.Path): number {
    for (let i = 0; i < pathTemplateConfigs.length; i++) {
      const template = pathTemplateConfigs[i].template;
      const inherit = pathTemplateConfigs[i].inherit;
      if ((inherit && path.length < template.length) || (!inherit && path.length !== template.length)) {
        continue;
      }

      let match = true;
      for (let j = 0; j < template.length; j++) {
        if (template[j] === -1) {
          if (typeof path[j] !== 'number') {
            match = false;
            break;
          }
        } else if (template[j] !== '*' && template[j] !== path[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        return i;
      }
    }
    return -1;
  }
}
