import { OfflineDataConstructor } from './models/offline-data';
import { RealtimeDocConstructor } from './models/realtime-doc';

/**
 * This class is used to register all real-time doc types so that {@link RealtimeService} can create them dynamically.
 * This class should be registered with the Angular DI container.
 */
export class RealtimeDocTypes {
  private readonly _docTypes: Map<string, RealtimeDocConstructor>;

  constructor(docTypes: RealtimeDocConstructor[]) {
    this._docTypes = new Map<string, RealtimeDocConstructor>(
      docTypes.map(r => [r.COLLECTION, r] as [string, RealtimeDocConstructor])
    );
  }

  get docTypes(): IterableIterator<RealtimeDocConstructor> {
    return this._docTypes.values();
  }

  getDocType(collection: string): RealtimeDocConstructor | undefined {
    return this._docTypes.get(collection);
  }
}

/**
 * This class is used to register components of real-time docs data that cannot be represented as a string (i.e. audio).
 */
export class OfflineDataTypes {
  private readonly _dataTypes: Map<string, OfflineDataConstructor>;

  constructor(dataTypes: OfflineDataConstructor[]) {
    this._dataTypes = new Map<string, OfflineDataConstructor>(
      dataTypes.map(d => [d.COLLECTION, d] as [string, OfflineDataConstructor])
    );
  }

  get dataTypes(): IterableIterator<OfflineDataConstructor> {
    return this._dataTypes.values();
  }
}
