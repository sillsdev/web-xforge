import { Collection, Db } from 'mongodb';
import { SchemaVersion } from './models/schema-version';

export class SchemaVersionRepository {
  private readonly collection: Collection<SchemaVersion>;

  constructor(database: Db) {
    this.collection = database.collection<SchemaVersion>('schema_versions');
  }

  async init(): Promise<void> {
    await this.collection.createIndex({ collection: 1 });
  }

  getAll(): Promise<SchemaVersion[]> {
    return this.collection.find().toArray();
  }

  async set(collection: string, version: number): Promise<void> {
    await this.collection.updateOne({ collection }, { $set: { version } }, { upsert: true });
  }
}
