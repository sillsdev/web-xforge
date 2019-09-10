import express = require('express');
import * as http from 'http';
import { JwtHeader, SigningKeyCallback, verify } from 'jsonwebtoken';
import jwks = require('jwks-rsa');
import { Db, MongoClient } from 'mongodb';
import ShareDB = require('sharedb');
import shareDBAccess = require('sharedb-access');
import { Connection, Doc } from 'sharedb/lib/client';
import WebSocketJSONStream = require('websocket-json-stream');
import ws = require('ws');
import { ConnectSession } from './connect-session';
import { MigrationBackend } from './migration-backend';
import { DocService } from './services/doc-service';
import { UserService } from './services/user-service';

const XF_USER_ID_CLAIM = 'http://xforge.org/userid';
const XF_ROLE_CLAIM = 'http://xforge.org/role';

function isLocalRequest(request: http.IncomingMessage): boolean {
  const addr = request.connection.remoteAddress;
  return addr === '127.0.0.1' || addr === '::ffff:127.0.0.1' || addr === '::1';
}

export type RealtimeServerConstructor = new (options: RealtimeServerOptions) => RealtimeServer;

export interface RealtimeServerOptions {
  appModuleName: string;
  connectionString: string;
  port: number;
  audience: string;
  scope: string;
  authority: string;
}

/**
 * This class represents the core real-time server. Each xForge app should provide an implementation of this class in a
 * "realtime-server" module.
 */
export abstract class RealtimeServer {
  readonly backend: MigrationBackend & shareDBAccess.AccessControlBackend;
  database?: Db;

  private readonly connectionString: string;
  private readonly port: number;
  private readonly audience: string;
  private readonly scope: string;
  private readonly httpServer: http.Server;
  private readonly jwksClient: jwks.JwksClient;
  private readonly connections = new Map<number, Connection>();
  private readonly docServices = new Map<string, DocService>();
  private connectionIndex = 0;

  constructor(docServices: DocService[], private readonly projectsCollection: string, options: RealtimeServerOptions) {
    this.connectionString = options.connectionString;
    this.port = options.port;
    this.audience = options.audience;
    this.scope = options.scope;

    // Create web servers to serve files and listen to WebSocket connections
    const app = express();
    app.use(express.static('static'));
    this.httpServer = http.createServer(app);

    this.jwksClient = jwks({
      cache: true,
      jwksUri: `${options.authority}.well-known/jwks.json`
    });

    docServices = docServices.concat(new UserService());

    const backend = new MigrationBackend(this.connectionString, docServices);
    shareDBAccess(backend);
    this.backend = backend as MigrationBackend & shareDBAccess.AccessControlBackend;
    this.backend.use('connect', (context, done) => {
      this.setConnectSession(context)
        .then(() => done())
        .catch(err => done(err));
    });

    for (const docService of docServices) {
      docService.init(this);
      this.docServices.set(docService.collection, docService);
    }

    // Connect any incoming WebSocket connection to ShareDB
    const wss = new ws.Server({
      server: this.httpServer,
      verifyClient: (info, done) => this.verifyToken(info, done)
    });
    wss.on('connection', (webSocket: WebSocket, req: http.IncomingMessage) => {
      const stream = new WebSocketJSONStream(webSocket);
      this.backend.listen(stream, req);
    });
  }

  async init(): Promise<RealtimeServer> {
    this.database = await MongoClient.connect(this.connectionString);
    await this.backend.migrateIfNecessary(this.database);
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
    const connection = this.backend.connect();
    const index = this.connectionIndex++;
    this.connections.set(index, connection);
    return index;
  }

  disconnect(handle: number): void {
    this.connections.delete(handle);
  }

  getDoc(handle: number, collection: string, id: string): Doc | undefined {
    const conn = this.connections.get(handle);
    if (conn != null) {
      return conn.get(collection, id);
    }
    return undefined;
  }

  async getUserProjectRole(session: ConnectSession, projectId: string): Promise<string | undefined> {
    let projectRole = session.projectRoles.get(projectId);
    if (projectRole == null) {
      session.projectRoles = await this.getUserProjectRoles(session.userId);
      projectRole = session.projectRoles.get(projectId);
    }
    return projectRole;
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
    const coll = this.database.collection(this.projectsCollection);
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
}
