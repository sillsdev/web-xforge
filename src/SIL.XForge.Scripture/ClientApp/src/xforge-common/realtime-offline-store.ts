import { ModelDefinition, Record, RecordIdentity, Schema } from '@orbit/data';
import { Dict } from '@orbit/utils';
import { Snapshot } from 'sharedb/lib/client';
import { XForgeIndexedDBSource } from './indexeddb/xforge-indexeddb-source';
import { DomainModel } from './models/domain-model';
import { getCollectionName } from './utils';

/** Structure of a record in the xforge-realtime IndexedDB database. */
export interface RealtimeOfflineData {
  snapshot: Snapshot;
  pendingOps: any[];
}

/**
 * This class is an abstraction for the offline storage of realtime documents. The implementation uses the Orbit
 * IndexedDB source. This abstraction can be mocked for easier unit testing.
 */
export class RealtimeOfflineStore {
  private readonly source: XForgeIndexedDBSource;

  constructor(domainModel: DomainModel) {
    const models: Dict<ModelDefinition> = {};
    for (const docType of domainModel.realtimeDocTypes) {
      models[getCollectionName(docType)] = {
        attributes: {
          snapshot: { type: 'object' },
          pendingOps: { type: 'array' }
        }
      };
    }
    const schema = new Schema({ models });
    this.source = new XForgeIndexedDBSource({ schema, namespace: 'xforge-realtime' });
  }

  async keys(type: string): Promise<RecordIdentity[]> {
    await this.source.openDB();
    return await this.source.getRecords(getCollectionName(type));
  }

  async getItem(identity: RecordIdentity): Promise<RealtimeOfflineData> {
    await this.source.openDB();
    try {
      const record = await this.source.getRecord({ type: getCollectionName(identity.type), id: identity.id });
      return record.attributes as RealtimeOfflineData;
    } catch (err) {
      return null;
    }
  }

  async setItem(identity: RecordIdentity, offlineData: RealtimeOfflineData): Promise<RealtimeOfflineData> {
    await this.source.openDB();
    const record: Record = {
      type: getCollectionName(identity.type),
      id: identity.id,
      attributes: offlineData
    };
    await this.source.putRecord(record);
    return offlineData;
  }

  async delete(identity: RecordIdentity): Promise<void> {
    await this.source.openDB();
    await this.source.removeRecord({ type: getCollectionName(identity.type), id: identity.id });
  }

  deleteDB(): Promise<void> {
    return this.source.deleteDB();
  }
}
