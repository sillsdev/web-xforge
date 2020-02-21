export const AUDIO_COLLECTION = 'audio';

export interface AudioBase {
  realtimeDocRef: string;
  projectRef: string;
  dataId: string;
  blob: Blob;
  filename: string;
}
