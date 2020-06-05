import { OfflineData } from './offline-data';

export const AUDIO_COLLECTION = 'audio';

export class AudioData extends OfflineData {
  static readonly COLLECTION = AUDIO_COLLECTION;

  static createUploadData(
    dataCollection: string,
    dataId: string,
    projectRef: string,
    realtimeDocRef: string,
    blob: Blob,
    filename: string
  ): AudioData {
    const audioData = new AudioData(dataCollection, dataId, projectRef, realtimeDocRef);
    audioData.blob = blob;
    audioData.filename = filename;
    return audioData;
  }

  static createDeletionData(dataCollection: string, dataId: string, projectRef: string, ownerRef: string): AudioData {
    const audioData = new AudioData(dataCollection, dataId, projectRef, undefined);
    audioData.deleteRef = ownerRef;
    return audioData;
  }

  realtimeDocRef?: string;
  blob?: Blob;
  filename?: string;
  deleteRef?: string;

  constructor(dataCollection: string, dataId: string, projectRef: string, realtimeDocRef?: string) {
    super(dataCollection, dataId, projectRef, realtimeDocRef);
  }

  get collection(): string {
    return AudioData.COLLECTION;
  }
}
