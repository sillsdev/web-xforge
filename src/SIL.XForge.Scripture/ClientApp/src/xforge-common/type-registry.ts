import { FileType } from './models/file-offline-data';
import { RealtimeDocConstructor } from './models/realtime-doc';

/**
 * This class is used to register all real-time doc and file types.
 * This class should be registered with the Angular DI container.
 */
export class TypeRegistry {
  private readonly _docTypes: Map<string, RealtimeDocConstructor>;
  private readonly _fileTypes: FileType[];

  constructor(docTypes: RealtimeDocConstructor[], fileTypes: FileType[]) {
    this._docTypes = new Map<string, RealtimeDocConstructor>(
      docTypes.map(r => [r.COLLECTION, r] as [string, RealtimeDocConstructor])
    );
    this._fileTypes = fileTypes;
  }

  get docTypes(): Iterable<RealtimeDocConstructor> {
    return this._docTypes.values();
  }

  get fileTypes(): Iterable<FileType> {
    return this._fileTypes;
  }

  getDocType(collection: string): RealtimeDocConstructor | undefined {
    return this._docTypes.get(collection);
  }
}
