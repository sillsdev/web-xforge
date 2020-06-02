import { OfflineData } from './offline-data';

export const AUDIO_COLLECTION = 'audio';

export class AudioData extends OfflineData {
  static readonly COLLECTION = AUDIO_COLLECTION;

  static createUploadData(
    dataId: string,
    projectRef: string,
    realtimeDocRef: string,
    blob: Blob,
    filename: string
  ): AudioData {
    const audioData = new AudioData(dataId, projectRef, realtimeDocRef);
    audioData.blob = blob;
    audioData.filename = filename;
    return audioData;
  }

  static createDeletionData(dataId: string, projectRef: string, ownerRef: string): AudioData {
    const audioData = new AudioData(dataId, projectRef, undefined);
    audioData.deleteRef = ownerRef;
    return audioData;
  }

  realtimeDocRef?: string;
  blob?: Blob;
  filename?: string;
  deleteRef?: string;

  private _collection: string;

  constructor(dataId: string, projectRef: string, realtimeDocRef?: string) {
    super(dataId, projectRef, realtimeDocRef);
    this._collection = AUDIO_COLLECTION;
  }

  get collection(): string {
    return this._collection;
  }
}
