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

  get collections(): IterableIterator<string> {
    return this._docTypes.keys();
  }

  getDocType(collection: string): RealtimeDocConstructor {
    return this._docTypes.get(collection);
  }
}
