import Ajv from 'ajv';
import ajvBsonType from 'ajv-bsontype';
import { Db } from 'mongodb';
import ShareDB from 'sharedb';
import shareDBAccess from 'sharedb-access';
import { Connection, Doc, Op, RawOp } from 'sharedb/lib/client';
import { ActivityLogger } from './activity-logger';
import { ConnectSession } from './connect-session';
import { Project } from './models/project';
import { SchemaProperties, ValidationSchema } from './models/validation-schema';
import { ResourceMonitor, sizeof } from './resource-monitor';
import { SchemaVersionRepository } from './schema-version-repository';
import { DocService } from './services/doc-service';
import { createFetchQuery, docFetch } from './utils/sharedb-utils';

export const XF_USER_ID_CLAIM = 'http://xforge.org/userid';
export const XF_ROLE_CLAIM = 'http://xforge.org/role';

export type RealtimeServerConstructor = new (
  siteId: string,
  migrationsDisabled: boolean,
  dataValidationDisabled: boolean,
  db: ShareDB.DB,
  schemaVersions: SchemaVersionRepository,
  milestoneDb?: ShareDB.MilestoneDB
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
    if (doc.submitSource && op.source != null) {
      message.x = { source: op.source };
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
      const op: any = {
        src,
        seq: request.seq,
        v: request.v,
        mv: request.mv,
        x: request.x,
        c: undefined,
        d: undefined,
        m: undefined
      };
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
 * @param {Op[]} ops The ops.
 * @returns {Promise<void>}
 */
export function submitMigrationOp(version: number, doc: Doc, ops: Op[]): Promise<void> {
  if (ops.length === 0) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const op: RawOp = { op: ops, mv: version };
    doc._submit(op, undefined, err => {
      if (err != null) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Picks out the identifiers in a request received from a client over the ShareDB protocol.
 *
 * A request carries at most one id in `id` and one sequence number in `seq`, but what each means depends on the kind
 * of request: an op's sequence number, a query's id, the id a reconnecting client is asking to keep, or a presence
 * update's own id and sequence. Reporting them under a single name would mix those together, so each is named for the
 * kind of request it came from. Presence contributes none, its ids identifying nothing outside the presence exchange.
 */
export function identifiersInClientRequest(request: Record<string, any>): {
  opSeq?: number;
  queryId?: string;
  srcClientId?: string;
} {
  switch (request.a) {
    case 'op':
      return { opSeq: request.seq };
    case 'qf':
    case 'qs':
    case 'qu':
      return { queryId: request.id };
    case 'hs':
      // Absent when a client connects for the first time, having no earlier id to keep.
      return { srcClientId: request.id ?? undefined };
    default:
      return {};
  }
}

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */
// We merge these two declarations, as we want to extend two classes
export interface RealtimeServer extends ShareDB, shareDBAccess.AccessControlBackend {}

/**
 * This class represents the real-time server. It extends ShareDB and adds support for migrations and access control. Connections are handled from frontend clients, from the dotnet process, and from itself (defaultConnection). See also an API for dotnet in `RealtimeServer/common/index.ts`.
 */
export class RealtimeServer extends ShareDB {
  /* eslint-enable @typescript-eslint/no-unsafe-declaration-merging */
  private readonly docServices = new Map<string, DocService>();
  private defaultConnection?: Connection;

  constructor(
    private readonly siteId: string,
    readonly migrationsDisabled: boolean,
    readonly dataValidationDisabled: boolean,
    docServices: DocService[],
    private readonly projectsCollection: string,
    readonly db: ShareDB.DB,
    private readonly schemaVersions: SchemaVersionRepository,
    milestoneDb?: ShareDB.MilestoneDB
  ) {
    super({
      db,
      milestoneDb,
      presence: true,
      disableDocAction: true,
      disableSpaceDelimitedActions: true,
      doNotForwardSendPresenceErrorsToClient: true
    });
    shareDBAccess(this);

    this.use('connect', (context, done) => {
      context.stream.checkServerAccess = true;
      this.setConnectSession(context)
        .then(() => done())
        .catch(err => {
          ActivityLogger.instance.log('connectionRejected', { errorMessage: `${err}` });
          done(err);
        });
    });

    // Measure what every read of documents returned. Including frontend client reads, a query's results, and the server's own connection's reads.
    this.use('readSnapshots', (context, next) => {
      if (context.agent == null) {
        next();
        return;
      }
      ResourceMonitor.instance.recordSnapshotRead(
        context.agent.clientId,
        context.collection,
        context.snapshotType,
        context.snapshots,
        context.agent.connectSession?.userId,
        context.agent.connectSession?.isServer
      );
      next();
    });

    // Measure the operations that pass through a connection.
    this.use('op', (context, next) => {
      if (context.agent == null) {
        next();
        return;
      }
      ResourceMonitor.instance.recordOpLoaded(
        context.agent.clientId,
        context.collection,
        context.id,
        context.op,
        context.agent.connectSession?.userId,
        context.agent.connectSession?.isServer
      );
      next();
    });

    // Count the queries a connection asks for. ShareDB triggers this when a query is fetched or subscribed to, and not
    // for the re-polls a subscription then causes, which reach the database without passing through middleware.
    this.use('query', (context, next) => {
      if (context.agent == null) {
        next();
        return;
      }
      ResourceMonitor.instance.recordQueryRun(
        context.agent.clientId,
        context.collection,
        context.agent.connectSession?.userId,
        context.agent.connectSession?.isServer
      );
      next();
    });

    // Count the polls of subscribed queries. A subscription is polled again whenever a document that might match it
    // changes, so one subscription on a busy collection can put an unbounded number of queries on the database. Those
    // polls reach the database with no middleware running. But by watching the 'timing' event notices, we can see them
    // happen.
    this.on('timing', (action: string, durationMs: number, context: ShareDB.TimingContext) => {
      if (action !== 'queryEmitter.poll' && action !== 'queryEmitter.pollDoc') {
        return;
      }
      if (context.agent == null || context.collection == null) {
        return;
      }
      ResourceMonitor.instance.recordQueryPolled(
        context.agent.clientId,
        context.collection,
        action,
        durationMs,
        context.agent.connectSession?.userId,
        context.agent.connectSession?.isServer
      );
    });

    // Report what a client asks for.
    this.use('receive', (context, next) => {
      if (ActivityLogger.instance.enabled) {
        RealtimeServer.logClientRequest(context);
      }
      next();
    });

    // Configure op, snapshot, or milestone changes to be made just before the op is committed to the database
    this.use('commit', (context, callback) => {
      switch (context.collection) {
        case 'texts':
        case 'text_documents':
          // Save a milestone for texts, every 1000 ops (about 7-10 verses typed live)
          if (context.snapshot != null) {
            context.saveMilestoneSnapshot = context.snapshot.v % 1000 === 0;
          }
          // If a source was specified, and is a string, set this as metadata for the op
          // The source will reach the realtime server if submitSource was set to true for the document on the client
          if (typeof context.extra?.source === 'string') {
            context.op.m.source = context.extra.source;
          }
          break;
        default:
          // Don't save any milestones for collections not named here.
          // IMPORTANT: We have to set this to false to actively disable milestones
          // If left to null, then the default interval will still apply
          context.saveMilestoneSnapshot = false;
      }

      callback();
    });

    // Unlike 'commit', 'afterWrite' fires once the op has actually been persisted, so this is where we log
    // opCommitted rather than in the 'commit' hook above.
    this.use('afterWrite', (context, callback) => {
      ActivityLogger.instance.log('opCommitted', {
        collection: context.collection,
        docId: context.id,
        clientId: context.agent?.clientId,
        srcClientId: context.op.src,
        opSeq: context.op.seq,
        version: context.snapshot?.v,
        saveMilestoneSnapshot: context.saveMilestoneSnapshot,
        source: typeof context.extra?.source === 'string' ? context.extra.source : undefined
      });
      callback();
    });

    for (const docService of docServices) {
      docService.init(this);
      this.docServices.set(docService.collection, docService);
    }

    // Setup Ajv
    const ajv = new Ajv({ strict: false, allErrors: true, logger: false });
    ajvBsonType(ajv);

    this.use('submit', (context, done) => {
      context.op.c = context.collection;
      if (context.op.mv != null) {
        context.op.m.migration = context.op.mv;
        delete context.op.mv;
      }

      const failValidation = (message: string): void => {
        ActivityLogger.instance.log('opValidationFailed', {
          collection: context.collection,
          docId: context.id,
          // Needed here as well as on opSubmitted: a failed op never reaches the opSubmitted entry below, so this
          // entry has nothing else to be attributed by.
          clientId: context.agent?.clientId,
          srcClientId: context.op.src,
          opSeq: context.op.seq,
          errorMessage: message
        });
        done(message);
      };

      // Perform data validation, if enabled. It will be disabled during migration.
      // Also, do not validate if the connection is from the backend server - we can trust it
      const validationSchema: ValidationSchema | undefined = this.docServices.get(context.collection)?.validationSchema;
      if (
        !this.dataValidationDisabled &&
        validationSchema != null &&
        context.op.op != null &&
        !context.agent?.connectSession?.isServer
      ) {
        let ops;
        if (Array.isArray(context.op.op)) {
          ops = context.op.op;
        } else {
          ops = [context.op.op];
        }
        // Iterate over every operation
        for (const op of ops) {
          // Skip operations with a null path as they will not be applied
          if (op.p == null) {
            continue;
          }
          let properties: SchemaProperties | undefined = validationSchema.properties;
          let patternProperties = false;
          // For each property name in the path array
          for (let i = 0; i < op.p.length; i++) {
            const propertyName: string | number | symbol = op.p[i];
            let propertySchema: ValidationSchema | undefined;
            // If we have a valid property in our schema matching the current path
            if (typeof propertyName === 'string' && properties != undefined) {
              if (properties[propertyName] !== undefined) {
                // If this property has more properties, set the properties to use with the next property in the path
                if (properties[propertyName].properties !== undefined) {
                  patternProperties = false;

                  // If we are not at the end of the path, iterate over the next path property name
                  if (i < op.p.length - 1) {
                    properties = properties[propertyName].properties;
                    continue;
                  } else {
                    // Use the schema for the items, as we are at the end of the path
                    propertySchema = properties[propertyName];
                  }
                } else if (properties[propertyName].items !== undefined) {
                  // This is an array - skip the indexer
                  i++;
                  patternProperties = false;

                  // If we are not at the end of the path, iterate over the next path property name
                  if (i < op.p.length - 1) {
                    properties = properties[propertyName].items?.properties;
                    continue;
                  } else if (i == op.p.length) {
                    // i is past the end of the array (i.e. there is no indexer), so we are replacing the array
                    propertySchema = properties[propertyName];
                  } else if (properties[propertyName].items !== undefined) {
                    // Use the schema for the items, as we are at the end of the path
                    propertySchema = properties[propertyName].items;
                  }
                } else if (properties[propertyName].patternProperties !== undefined && i < op.p.length - 1) {
                  // This is a map - check that the next property name matches the pattern
                  properties = properties[propertyName].patternProperties!;
                  patternProperties = true;
                  continue;
                }
              }

              // Get the schema, by checking for the property name by pattern
              if (patternProperties) {
                for (const [key, value] of Object.entries(properties)) {
                  if (new RegExp(key).test(propertyName)) {
                    propertySchema = value;
                  }
                }
              }

              // No pattern matched, retrieve the schema by property name
              if (propertySchema === undefined) {
                propertySchema = properties[propertyName];
              }

              // If we still have no property schema, this is an invalid path
              if (propertySchema === undefined) {
                failValidation(`Invalid path for operation: ${JSON.stringify(op.p)}`);
                return;
              }

              let newValue: any;
              if ('li' in op) {
                newValue = op.li;
              } else if ('oi' in op) {
                newValue = op.oi;
              } else if ('na' in op) {
                newValue = op.na;
              } else {
                // Op does not require checking, continue with the next op
                continue;
              }

              // Check type via bsonType
              let validData = false;
              let bsonTypes: string[];
              if (Array.isArray(propertySchema.bsonType)) {
                bsonTypes = propertySchema.bsonType;
              } else if (typeof propertySchema.bsonType === 'string') {
                bsonTypes = [propertySchema.bsonType];
              } else {
                // No bson type, is valid
                bsonTypes = [];
                validData = true;
              }

              for (const bsonType of bsonTypes) {
                switch (bsonType) {
                  case 'number':
                  case 'int':
                  case 'double':
                  case 'long':
                  case 'decimal':
                    validData = typeof newValue === 'number';
                    break;
                  case 'bool':
                    validData = typeof newValue === 'boolean';
                    break;
                  case 'null':
                    validData = newValue == null;
                    break;
                  case 'string':
                    validData = typeof newValue === 'string';
                    // Check value for pattern
                    if (propertySchema.pattern != null) {
                      validData = new RegExp(propertySchema.pattern).test(newValue);
                    }
                    // Check for enum values
                    if (propertySchema.enum != null) {
                      validData = propertySchema.enum.includes(newValue);
                    }
                    break;
                  case 'object': {
                    const validate = ajv.compile(propertySchema);
                    validData = validate(newValue);
                    break;
                  }
                  default:
                    // This is a type we cannot check, so we assume the data is valid
                    validData = true;
                    break;
                }

                // We iterate over the bsonTypes until a valid value is found
                if (validData) {
                  break;
                }
              }

              if (!validData) {
                failValidation(`Invalid operation data with path: ${JSON.stringify(op.p)}`);
                return;
              }
            } else {
              failValidation(`Invalid path for operation: ${JSON.stringify(op.p)}`);
              return;
            }
          }
        }
      }

      let opType: 'create' | 'del' | 'op';
      if (context.op.create != null) {
        opType = 'create';
      } else if (context.op.del != null) {
        opType = 'del';
      } else {
        opType = 'op';
      }
      let opsCount: number;
      if (Array.isArray(context.op.op)) {
        opsCount = context.op.op.length;
      } else if (context.op.op != null) {
        opsCount = 1;
      } else {
        opsCount = 0;
      }
      ActivityLogger.instance.log('opSubmitted', {
        collection: context.collection,
        docId: context.id,
        // Which connection the op arrived on, matching the clientId that connectionEstablished reported.
        //
        // srcClientId is not a substitute for this, because the two are not always the same id. ShareDB gives each
        // agent a clientId when it is created, but agent.src stays null until the client's handshake message supplies
        // an id, which is after the 'connect' middleware has run - so the source is not even known at the point
        // connectionEstablished is logged. A client connecting for the first time has no id to supply, so its ops fall
        // back to the agent's clientId and the two agree. But a browser that reconnects does supply one: it keeps the
        // id from its previous session as the source of its ops. From then on its ops carry a srcClientId that no
        // connectionEstablished entry ever reported, and reporting both is what still ties them to a connection.
        clientId: context.agent?.clientId,
        // Together these identify the op, so that this entry can be matched up with the opCommitted or
        // opValidationFailed entry for the same op.
        srcClientId: context.op.src,
        opSeq: context.op.seq,
        // The version the op was submitted against. A commit of this op lands at the next version.
        version: context.op.v,
        userId: context.agent?.connectSession?.userId,
        isServer: context.agent?.connectSession?.isServer,
        opType: opType,
        opsCount: opsCount,
        migrationVersion: context.op.m.migration
      });
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

    this.defaultConnection = this.connectAsServer();

    if (!this.dataValidationDisabled) {
      ResourceMonitor.instance.setPubSub((this as any).pubsub);
      ResourceMonitor.instance.startMonitoringConnection(this.defaultConnection, {
        kind: 'default',
        owner: 'RealtimeServer.defaultConnection'
      });
    }
  }

  async addValidationSchema(db: Db): Promise<void> {
    for (const docService of this.docServices.values()) {
      await docService.addValidationSchema(db);
    }
  }

  async createIndexes(db: Db): Promise<void> {
    await this.schemaVersions.createIndex();
    for (const docService of this.docServices.values()) {
      await docService.createIndexes(db);
    }
  }

  /**
   * Creates a connection, described by `req`. `req` is later examined by `setConnectSession`, to produce a trusted
   * server session with or without user ID, or a user session limited by JWT claims (for unit tests).
   */
  connect(connection?: Connection, req?: any): Connection {
    if (connection != null) {
      // Our application does not make any calls to this method with a defined Connection.
      console.log(`Warning: realtime-server.ts RealtimeServer.connect unexpectedly received a connection argument.`);
      return super.connect(connection, req);
    }

    // Temporary socket that is used in constructing the Connection, but quickly replaced with a new socket in ShareDB
    // backend.js connect().
    const tmpSocket = {
      close: () => {
        // do nothing
      }
    } as WebSocket;
    const migrationConnection = new MigrationConnection(tmpSocket);
    return super.connect(migrationConnection, req);
  }

  /**
   * Creates a connection that is trusted as the server, optionally acting for a user (but not limited by their
   * permissions).
   *
   * Dotnet requests, this.defaultConnection, and other places in RealtimeServer reach this.
   *
   * @param interopHandle Identifies a dotnet caller's handle on this connection, so that logged activity can be
   * matched with the connection it was performed on.
   */
  connectAsServer(onBehalfOfUserId?: string, interopHandle?: number): Connection {
    if (onBehalfOfUserId == null && interopHandle == null) return this.connect();
    else return this.connect(undefined, { userId: onBehalfOfUserId, interopHandle: interopHandle });
  }

  listen(stream: any, req?: any): ShareDB.Agent {
    // Streams of types WebSocketJSONStream and ServerStream are received by this method.
    const agent = new MigrationAgent(this, stream);
    if (!this.dataValidationDisabled) {
      ResourceMonitor.instance.monitorAgent(agent, stream);
    }
    let disconnectReported = false;
    const reportDisconnect = (): void => {
      if (disconnectReported) {
        return;
      }
      disconnectReported = true;
      // The stream can close before the 'connect' middleware finishes (e.g. the client disconnects mid-handshake,
      // or authentication fails), so connectSession may not be set yet.
      ActivityLogger.instance.log('agentDisconnected', {
        clientId: agent.clientId,
        userId: agent.connectSession?.userId,
        isServer: agent.connectSession?.isServer,
        // What the connection was still holding as it went. These are counted rather than measured to be faster.
        subscribedCollectionsCount: Object.keys(agent.subscribedDocs).length,
        subscribedDocsCount: Object.values(agent.subscribedDocs).reduce(
          (total: number, docs: Record<string, unknown>) => total + Object.keys(docs).length,
          0
        ),
        subscribedQueriesCount: Object.keys(agent.subscribedQueries).length,
        subscribedPresencesCount: Object.keys(agent.subscribedPresences).length
      });
    };
    // A stream signals that it is finished with 'end' (the readable side reached its end) and 'close' (the stream was
    // destroyed), or with only one of them, and sometimes more than once.
    stream.once('end', reportDisconnect);
    stream.once('close', reportDisconnect);
    this.trigger('connect', agent, { stream, req }, err => {
      if (err) {
        return agent.close(err);
      }
      agent._open();
    });
    return agent;
  }

  /**
   * Override to measure, log, and pass on a request to rebuild a document at a past version or timestamp by replaying operations onto a milestone snapshot.
   *
   * Measured here as these ops do not pass through the 'op' middleware.
   */
  _buildSnapshotFromOps(
    id: string,
    startingSnapshot: ShareDB.Snapshot | undefined,
    ops: ShareDB.Op[],
    callback: (err: Error, snapshot: ShareDB.Snapshot) => void
  ): void {
    if (ActivityLogger.instance.enabled) {
      ActivityLogger.instance.log('snapshotRebuiltFromOps', {
        docId: id,
        fromVersion: startingSnapshot?.v ?? 0,
        opsCount: ops.length,
        opsBytes: sizeof(ops)
      });
    }
    super._buildSnapshotFromOps(id, startingSnapshot, ops, callback);
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
      curVersion ??= 0;
      const version = docService.schemaVersion;
      if (curVersion === version) {
        continue;
      }
      ActivityLogger.instance.log('migrationCollectionStarted', {
        collection: docService.collection,
        fromVersion: curVersion,
        toVersion: version
      });
      const limit = 10000;
      let skip = 0;
      let query = await createFetchQuery(this.defaultConnection!, docService.collection, {
        $sort: { _id: 1 },
        $skip: skip,
        $limit: limit
      });
      while (query.results.length > 0) {
        console.log(`Migrating ${docService.collection}: ${skip + 1} to ${skip + query.results.length}`);
        let docVersion = curVersion;
        while (docVersion < version) {
          docVersion++;
          const promises: Promise<void>[] = [];
          const migration = docService.getMigration(docVersion);
          for (const doc of query.results) {
            promises.push(migration.migrateDoc(doc));
          }
          await Promise.all(promises);
        }

        skip += limit;
        query = await createFetchQuery(this.defaultConnection!, docService.collection, {
          $sort: { _id: 1 },
          $skip: skip,
          $limit: limit
        });
      }

      await this.schemaVersions.set(docService.collection, version);
      ActivityLogger.instance.log('migrationCollectionCompleted', {
        collection: docService.collection,
        version: version
      });
    }
  }

  /**
   * Reports one request received over the ShareDB protocol.
   *
   * Every connection speaks this protocol, not only frontend clients, so entries carry isServer to tell them apart. A dotnet process's connection uses interop methods which drive an ordinary client underneath, and will come through here.
   *
   * An op is reported here as well as by opSubmitted and opCommitted. This is the only one of the three made before the
   * agent and ot.checkOp can turn the op away, so an op malformed enough to be rejected by either is reported here and
   * nowhere else.
   */
  private static logClientRequest(context: ShareDB.middleware.ReceiveContext): void {
    const request: Record<string, any> = context.data;
    const action: string = request.a;
    const agent: ShareDB.Agent | undefined = context.agent;
    const bulkIds: unknown = request.b;
    ActivityLogger.instance.log('clientRequest', {
      // The ShareDB message type.
      action: action,
      clientId: agent?.clientId,
      userId: agent?.connectSession?.userId,
      isServer: agent?.connectSession?.isServer,
      collection: request.c,
      docId: request.d,
      // A bulk request names several docs at once, as a map of doc id to version, or a list of doc ids.
      docsCount: bulkIds == null ? undefined : Array.isArray(bulkIds) ? bulkIds.length : Object.keys(bulkIds).length,
      ...identifiersInClientRequest(request),
      presenceChannel: request.ch
    });
  }

  private async setConnectSession(context: ShareDB.middleware.ConnectContext): Promise<void> {
    let session: ConnectSession;
    if (context.req != null && context.req.user != null) {
      const userId: string = context.req.user[XF_USER_ID_CLAIM];
      const role: string | string[] | undefined = context.req.user[XF_ROLE_CLAIM];
      const roles: string[] = typeof role === 'string' ? [role] : role || [];
      session = {
        userId,
        roles,
        isServer: false
      };
    } else {
      let userId = '';
      if (context.req != null && context.req.userId != null) {
        userId = context.req.userId;
      }
      session = { isServer: true, userId, roles: [] };
    }
    const agent: ShareDB.Agent | undefined = context.agent;
    if (agent == null) {
      throw new Error('Cannot establish a connection session without an agent.');
    }
    agent.connectSession = session;
    ActivityLogger.instance.log('connectionEstablished', {
      // The op source (agent.src) is not reported here: it is not set until the client's handshake message, which
      // arrives after this runs. See the opSubmitted entry, which reports both ids.
      clientId: agent.clientId,
      interopHandle: context.req?.interopHandle,
      userId: session.userId,
      roles: session.roles,
      isServer: session.isServer
    });
  }
}
