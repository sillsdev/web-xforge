import { Db } from 'mongodb';
import ShareDB = require('sharedb');
import { Connection, Doc, RawOp } from 'sharedb/lib/client';
import { MetadataShareDBMongo } from './metadata-sharedb-mongo';
import { SchemaVersion } from './models/schema-version';
import { DocService } from './services/doc-service';

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
 */
class MigrationAgent extends ShareDB.Agent {
  _createOp(request: any): any {
    const op = super._createOp(request);
    if (request.mv != null) {
      op.mv = request.mv;
    }
    return op;
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

/**
 * This class extends the ShareDB backend to provide support for data migrations.
 */
export class MigrationBackend extends ShareDB {
  private readonly docServices = new Map<string, DocService>();

  constructor(connectionString: string, docServices: DocService[]) {
    super({
      db: new MetadataShareDBMongo(connectionString),
      disableDocAction: true,
      disableSpaceDelimitedActions: true
    });

    for (const docService of docServices) {
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
  }

  connect(connection?: any, req?: any): Connection {
    if (connection == null) {
      connection = new MigrationConnection({ close: () => {} } as WebSocket);
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

  async migrateIfNecessary(database: Db): Promise<void> {
    const schemaVersions = database.collection<SchemaVersion>('schema_versions');
    await schemaVersions.createIndex({ collection: 1 });
    const versionMap = new Map<string, number>();
    for (const schemaVersion of await schemaVersions.find().toArray()) {
      versionMap.set(schemaVersion.collection, schemaVersion.version);
    }
    const conn = this.connect();
    for (const docService of this.docServices.values()) {
      let curVersion = versionMap.get(docService.collection);
      if (curVersion == null) {
        curVersion = 0;
      }
      const version = docService.schemaVersion;
      if (curVersion === version) {
        continue;
      }
      const docs = await this.getDocs(conn, docService.collection);
      while (curVersion < version) {
        curVersion++;
        const promises: Promise<void>[] = [];
        const migration = docService.getMigration(curVersion);
        for (const doc of docs) {
          promises.push(migration.migrateDoc(doc));
        }
        await Promise.all(promises);
      }

      await schemaVersions.updateOne({ collection: docService.collection }, { $set: { version } }, { upsert: true });
    }
  }

  private getDocs(conn: Connection, collection: string): Promise<Doc[]> {
    return new Promise<Doc[]>((resolve, reject) => {
      conn.createFetchQuery(collection, {}, {}, (err, results) => {
        if (err != null) {
          reject(err);
        } else {
          resolve(results);
        }
      });
    });
  }
}
