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

  static createStorageData(dataCollection: string, dataId: string, onlineUrl: string, blob: Blob): AudioData {
    const audioData = new AudioData(dataCollection, dataId);
    audioData.onlineUrl = onlineUrl;
    audioData.blob = blob;
    return audioData;
  }

  blob?: Blob;
  /**
   * The url of the audio file stored on the server. This audio data instance is stale if onlineUrl does not
   * match the audio url stored in the realtime doc.
   */
  onlineUrl?: string;
  filename?: string;
  deleteRef?: string;

  get collection(): string {
    return AudioData.COLLECTION;
  }
}
