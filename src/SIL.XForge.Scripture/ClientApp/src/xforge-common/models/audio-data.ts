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

  constructor(dataId: string, projectRef: string, realtimeDocRef?: string) {
    super(AudioData.COLLECTION, dataId, projectRef, realtimeDocRef);
  }
}
