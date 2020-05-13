import { OfflineData } from './offline-data';

export const AUDIO_COLLECTION = 'audio';

export class AudioData extends OfflineData {
  static readonly COLLECTION = AUDIO_COLLECTION;
  realtimeDocRef?: string;
  blob?: Blob;
  filename?: string;
  deleteRef?: string;

  get collection(): string {
    return AUDIO_COLLECTION;
  }

  setUploadContents(realtimeDocRef: string, blob: Blob, filename: string): void {
    this.realtimeDocRef = realtimeDocRef;
    this.blob = blob;
    this.filename = filename;
  }

  setDeletionContents(ownerRef: string): void {
    this.deleteRef = ownerRef;
  }
}
