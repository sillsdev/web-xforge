import Ajv from 'ajv';
import ajvBsonType from 'ajv-bsontype';
import { Db } from 'mongodb';
import ShareDB from 'sharedb';
import shareDBAccess from 'sharedb-access';
import { Connection, Doc, Op, RawOp } from 'sharedb/lib/client';
import { ConnectSession } from './connect-session';
import { Project } from './models/project';
import { SchemaProperties, ValidationSchema } from './models/validation-schema';
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

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */
// We merge these two declarations, as we want to extend two classes
export interface RealtimeServer extends ShareDB, shareDBAccess.AccessControlBackend {}

/**
 * This class represents the real-time server. It extends ShareDB and adds support for migrations and access control.
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
      disableSpaceDelimitedActions: true
    });
    shareDBAccess(this);

    this.use('connect', (context, done) => {
      context.stream.checkServerAccess = true;
      this.setConnectSession(context)
        .then(() => done())
        .catch(err => done(err));
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

      // Perform data validation, if enabled. It will be disabled during migration.
      // Also, do not validate if the connection is from the backend server - we can trust it
      const validationSchema: ValidationSchema | undefined = this.docServices.get(context.collection)?.validationSchema;
      if (
        !this.dataValidationDisabled &&
        validationSchema != null &&
        context.op.op != null &&
        !context.agent.connectSession.isServer
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
                done(`Invalid path for operation: ${JSON.stringify(op)}`);
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
                done(`Invalid operation data: ${JSON.stringify(op)}`);
                return;
              }
            } else {
              done(`Invalid path for operation: ${JSON.stringify(op)}`);
              return;
            }
          }
        }
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
    }
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
    context.agent.connectSession = session;
  }
}
