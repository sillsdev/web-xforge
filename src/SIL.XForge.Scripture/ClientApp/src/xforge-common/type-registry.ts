import { FileType } from './models/file-offline-data';
import { RealtimeDocConstructor } from './models/realtime-doc';

/**
 * This class is used to register all real-time doc and file types.
 * This class should be registered with the Angular DI container.
 */
export class TypeRegistry {
  private readonly _docTypes: Map<string, RealtimeDocConstructor>;
  private readonly _fileTypes: FileType[];
  private readonly _customTypes: string[];

  constructor(docTypes: RealtimeDocConstructor[], fileTypes: FileType[], customTypes: string[]) {
    this._docTypes = new Map<string, RealtimeDocConstructor>(
      docTypes.map(r => [r.COLLECTION, r] as [string, RealtimeDocConstructor])
    );
    this._fileTypes = fileTypes;
    this._customTypes = customTypes;
  }

  get docTypes(): Iterable<RealtimeDocConstructor> {
    return this._docTypes.values();
  }

  get fileTypes(): Iterable<FileType> {
    return this._fileTypes;
  }

  get customTypes(): Iterable<string> {
    return this._customTypes;
  }

  getDocType(collection: string): RealtimeDocConstructor | undefined {
    return this._docTypes.get(collection);
  }
}
