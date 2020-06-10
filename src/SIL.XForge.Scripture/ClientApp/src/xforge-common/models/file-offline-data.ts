import { OfflineData } from '../offline-store';

export enum FileType {
  Audio = 'audio'
}

export function createUploadFileData(
  dataCollection: string,
  dataId: string,
  projectRef: string,
  realtimeDocRef: string,
  blob: Blob,
  filename: string
): FileOfflineData {
  return { dataCollection, id: dataId, projectRef, realtimeDocRef, blob, filename };
}

export function createDeletionFileData(
  dataCollection: string,
  dataId: string,
  projectRef: string,
  ownerRef: string
): FileOfflineData {
  return { dataCollection, id: dataId, projectRef, deleteRef: ownerRef };
}

export function createStorageFileData(
  dataCollection: string,
  dataId: string,
  onlineUrl: string,
  blob: Blob
): FileOfflineData {
  return { dataCollection, id: dataId, onlineUrl, blob };
}

export interface FileOfflineData extends OfflineData {
  dataCollection: string;
  projectRef?: string;
  realtimeDocRef?: string;
  blob?: Blob;
  /**
   * The url of the file stored on the server. This data instance is stale if onlineUrl does not match the audio url
   * stored in the real-time doc.
   */
  onlineUrl?: string;
  filename?: string;
  deleteRef?: string;
}
