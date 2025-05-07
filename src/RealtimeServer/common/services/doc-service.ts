import { CreateIndexesOptions, Db, IndexSpecification } from 'mongodb';
import { ConnectSession } from '../connect-session';
import { Migration, MigrationConstructor } from '../migration';
import { ValidationSchema } from '../models/validation-schema';
import { RealtimeServer } from '../realtime-server';

/**
 * This is the abstract base class for all doc services. Doc services are responsible for managing data for a
 * particular doc type.
 */
export abstract class DocService<T = any> {
  readonly schemaVersion: number;
  protected server?: RealtimeServer;
  private readonly migrations = new Map<number, MigrationConstructor>();

  // This is a base schema that covers the minimum required properties for a ShareDB collection
  // NOTE: Schemas that use this must implement the property "_id"
  static readonly validationSchema: ValidationSchema = {
    bsonType: 'object',
    required: ['_id', '_type', '_v', '_m', '_o'],
    properties: {
      _type: {
        bsonType: ['null', 'string']
      },
      _v: {
        bsonType: 'int'
      },
      _m: {
        bsonType: 'object',
        required: ['ctime', 'mtime'],
        properties: {
          ctime: {
            bsonType: 'number'
          },
          mtime: {
            bsonType: 'number'
          },
          _create: {
            bsonType: 'object',
            required: ['src', 'seq', 'v'],
            properties: {
              src: {
                bsonType: 'string'
              },
              seq: {
                bsonType: 'number'
              },
              v: {
                bsonType: 'number'
              }
            },
            additionalProperties: false
          }
        },
        additionalProperties: false
      },
      _o: {
        bsonType: 'objectId'
      }
    }
  };

  constructor(migrations: MigrationConstructor[]) {
    let maxVersion = 0;
    for (const migration of migrations) {
      maxVersion = Math.max(maxVersion, migration.VERSION);
      this.migrations.set(migration.VERSION, migration);
    }
    this.schemaVersion = maxVersion;
  }

  abstract get collection(): string;
  protected abstract get indexPaths(): (string | IndexSpecification | [string, CreateIndexesOptions])[];
  validationSchema: ValidationSchema | undefined = undefined;

  init(server: RealtimeServer): void {
    this.server = server;
    server.allowCreate(this.collection, (docId, doc, session) => this.allowCreate(docId, doc, session));
    server.allowDelete(this.collection, (docId, doc, session) => this.allowDelete(docId, doc, session));
    server.allowRead(this.collection, (docId, doc, session) => this.allowRead(docId, doc, session));
    server.allowUpdate(this.collection, (docId, oldDoc, newDoc, ops, session) =>
      this.allowUpdate(docId, oldDoc, newDoc, ops, session)
    );
  }

  getMigration(version: number): Migration {
    const MigrationType = this.migrations.get(version);
    if (MigrationType == null) {
      throw new Error('The specified migration is not registered.');
    }
    return new MigrationType();
  }

  async createIndexes(db: Db): Promise<void> {
    for (const path of this.indexPaths) {
      const collection = db.collection(this.collection);
      if (typeof path === 'string') {
        await collection.createIndex({ [path]: 1 });
      } else if (Array.isArray(path)) {
        await collection.createIndex({ [path[0]]: 1 }, path[1] as CreateIndexesOptions);
      } else {
        await collection.createIndex(path);
      }
    }
  }

  async addValidationSchema(db: Db): Promise<void> {
    if (this.validationSchema != null) {
      const collectionExists = await db.listCollections({ name: this.collection }).hasNext();
      if (!collectionExists) await db.createCollection(this.collection);
      await db.command({
        collMod: this.collection,
        validator: {
          $jsonSchema: this.validationSchema
        },
        validationAction: 'warn',
        validationLevel: 'strict'
      });
    }
  }

  protected addUpdateListener(server: RealtimeServer, handler: (docId: string, ops: any) => Promise<void>): void {
    server.use('afterWrite', (context, callback) => {
      if (context.collection === this.collection) {
        handler(context.id, context.op.op)
          .then(() => callback())
          .catch(err => callback(err));
      } else {
        callback();
      }
    });
  }

  protected allowCreate(_docId: string, _doc: T, session: ConnectSession): Promise<boolean> | boolean {
    return session.isServer;
  }

  protected allowDelete(_docId: string, _doc: T, session: ConnectSession): Promise<boolean> | boolean {
    return session.isServer;
  }

  protected allowRead(_docId: string, _doc: T, session: ConnectSession): Promise<boolean> | boolean {
    return session.isServer;
  }

  protected allowUpdate(
    _docId: string,
    _oldDoc: T,
    _newDoc: T,
    _ops: any,
    session: ConnectSession
  ): Promise<boolean> | boolean {
    return session.isServer;
  }
}
