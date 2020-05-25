import { OfflineDataConstructor } from './models/offline-data';

/**
 * This class is used to register components of real-time docs data that cannot be represented as a string i.e. audio.
 * This class should be registered with the Angular DI container.
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
