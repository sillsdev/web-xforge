import { RealtimeDocConstructor } from './models/realtime-doc';
import { UserDoc } from './models/user-doc';
import { UserProfileDoc } from './models/user-profile-doc';

/**
 * This class is used to register all real-time doc types so that {@link RealtimeService} can create them dynamically.
 * This class should be registered with the Angular DI container.
 */
export class RealtimeDocTypes {
  private readonly _docTypes: Map<string, RealtimeDocConstructor>;

  constructor(docTypes: RealtimeDocConstructor[]) {
    this._docTypes = new Map<string, RealtimeDocConstructor>(
      docTypes.map(r => [r.TYPE, r] as [string, RealtimeDocConstructor])
    );
    this._docTypes.set(UserDoc.TYPE, UserDoc);
    this._docTypes.set(UserProfileDoc.TYPE, UserProfileDoc);
  }

  get docTypes(): IterableIterator<string> {
    return this._docTypes.keys();
  }

  getDocType(recordType: string): RealtimeDocConstructor {
    return this._docTypes.get(recordType);
  }
}
