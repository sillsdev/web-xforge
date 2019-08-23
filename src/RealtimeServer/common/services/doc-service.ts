import { ConnectSession } from '../connect-session';
import { Migration, MigrationConstructor } from '../migration';
import { RealtimeServer } from '../realtime-server';

/**
 * This is the abstract base class for all doc services. Doc services are responsible for managing data for a
 * particular doc type.
 */
export abstract class DocService<T = any> {
  readonly schemaVersion: number;
  protected server?: RealtimeServer;
  private readonly migrations = new Map<number, MigrationConstructor>();

  constructor(migrations: MigrationConstructor[]) {
    let maxVersion = 0;
    for (const migration of migrations) {
      maxVersion = Math.max(maxVersion, migration.VERSION);
      this.migrations.set(migration.VERSION, migration);
    }
    this.schemaVersion = maxVersion;
  }

  abstract get collection(): string;

  init(server: RealtimeServer): void {
    this.server = server;
    server.backend.allowCreate(this.collection, (docId, doc, session) => this.allowCreate(docId, doc, session));
    server.backend.allowDelete(this.collection, (docId, doc, session) => this.allowDelete(docId, doc, session));
    server.backend.allowRead(this.collection, (docId, doc, session) => this.allowRead(docId, doc, session));
    server.backend.allowUpdate(this.collection, (docId, oldDoc, newDoc, ops, session) =>
      this.allowUpdate(docId, oldDoc, newDoc, ops, session)
    );
  }

  getMigration(version: number): Migration {
    const migrationType = this.migrations.get(version);
    if (migrationType == null) {
      throw new Error('The specified migration is not registered.');
    }
    return new migrationType();
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
