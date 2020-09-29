import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { TranslocoService } from '@ngneat/transloco';
import { environment } from '../environments/environment';
import { AuthService } from './auth.service';
import { CommandService } from './command.service';
import {
  createDeletionFileData,
  createStorageFileData,
  createUploadFileData,
  FileOfflineData,
  FileType
} from './models/file-offline-data';
import { ProjectDataDoc } from './models/project-data-doc';
import { NoticeService } from './notice.service';
import { OfflineStore } from './offline-store';
import { PwaService } from './pwa.service';
import { RealtimeService } from './realtime.service';
import { SubscriptionDisposable } from './subscription-disposable';
import { TypeRegistry } from './type-registry';
import { COMMAND_API_NAMESPACE, PROJECTS_URL } from './url-constants';

/**
 * Formats the name of a file stored on the server into a URL that a http client can use to request the data.
 */
export function formatFileSource(fileType: FileType, source: string): string {
  if (!isLocalBlobUrl(source)) {
    if (source.startsWith('/')) {
      source = source.substring(1);
    }
    source = `${environment.assets}${fileType}/${source}`;
  }
  return source;
}

export function isLocalBlobUrl(url: string): boolean {
  return url.startsWith('blob:');
}

/**
 * Provides access to locally cached file data while keeping the cache up-to-date.
 */
@Injectable({
  providedIn: 'root'
})
export class FileService extends SubscriptionDisposable {
  private limitedStorageDialogPromise?: Promise<void>;

  constructor(
    private readonly typeRegistry: TypeRegistry,
    private readonly offlineStore: OfflineStore,
    private readonly pwaService: PwaService,
    private readonly http: HttpClient,
    private readonly authService: AuthService,
    private readonly commandService: CommandService,
    private readonly transloco: TranslocoService,
    private readonly noticeService: NoticeService
  ) {
    super();
  }

  init(realtimeService: RealtimeService): void {
    this.subscribe(this.pwaService.onlineStatus, async isOnline => {
      // Wait until logged in so that the remote store gets initialized
      if (isOnline && (await this.authService.isLoggedIn)) {
        for (const fileType of this.typeRegistry.fileTypes) {
          const files = await this.offlineStore.getAll<FileOfflineData>(fileType);
          for (const fileData of files) {
            if (fileData.deleteRef != null && fileData.projectRef != null) {
              await this.onlineDeleteFile(fileType, fileData.projectRef, fileData.id, fileData.deleteRef);
              await this.offlineStore.delete(fileType, fileData.id);
            } else if (fileData.onlineUrl == null && fileData.projectRef != null) {
              // The file has not been uploaded to the server
              const doc = await realtimeService.onlineFetch<ProjectDataDoc>(
                fileData.dataCollection,
                fileData.realtimeDocRef!
              );
              if (doc.isLoaded) {
                const url = await doc.uploadFile(fileType, fileData.id, fileData.blob!, fileData.filename!);
                await doc.updateFileUrl(fileType, fileData.id, url);
                if (!doc.alwaysKeepFileOffline(fileType, fileData.id)) {
                  // the file is not available offline, so delete it from offline store
                  await this.offlineStore.delete(fileType, fileData.id);
                }
              }
            }
          }
        }
      }
    });
  }

  async get(dataCollection: string, dataId: string): Promise<FileOfflineData | undefined> {
    return await this.offlineStore.get<FileOfflineData>(dataCollection, dataId);
  }

  async getAll(dataCollection: string): Promise<FileOfflineData[]> {
    return await this.offlineStore.getAll<FileOfflineData>(dataCollection);
  }

  /**
   * Uploads a file to the file server, or if offline, stores the file in IndexedDB and uploads next time there is a
   * valid connection.
   * @returns The url to the file content, or undefined if unable to save the file
   */
  async uploadFile(
    fileType: FileType,
    projectId: string,
    dataCollection: string,
    dataId: string,
    docId: string,
    blob: Blob,
    filename: string,
    alwaysKeepFileOffline: boolean
  ): Promise<string | undefined> {
    if (this.pwaService.isOnline) {
      // Try and upload it online and, failing that, do so in offline mode
      try {
        const onlineUrl = await this.onlineUploadFile(fileType, projectId, dataId, new File([blob], filename));
        if (alwaysKeepFileOffline) {
          await this.findOrUpdateCache(fileType, dataCollection, dataId, onlineUrl);
        }
        return onlineUrl;
      } catch {}
    }
    try {
      // Store the file in indexedDB until we go online again.
      // Use blob.slice() to get a copy of the original. It appears that blobs which references data from files
      // on disk cause a NotReadableError during upload when the user returns online using Chrome incognito mode.
      const localFileData = createUploadFileData(dataCollection, dataId, projectId, docId, blob.slice(), filename);
      await this.offlineStore.put(fileType, localFileData);
      return URL.createObjectURL(localFileData.blob);
    } catch (error) {
      await this.onCachingError(error);
    }
  }

  /**
   * Deletes a file from the file server, or if offline, deletes the file from IndexedDB if present. If the file is not
   * present in IndexedDB, delete the file from the file server next time there is a valid connection.
   */
  async deleteFile(
    fileType: FileType,
    projectId: string,
    dataCollection: string,
    dataId: string,
    ownerId: string
  ): Promise<void> {
    if (this.pwaService.isOnline) {
      await this.findOrUpdateCache(fileType, dataCollection, dataId);
      // Try and delete it online and, failing that, do so in offline mode
      try {
        await this.onlineDeleteFile(fileType, projectId, dataId, ownerId);
        return;
      } catch {}
    }
    const fileData = await this.offlineStore.get<FileOfflineData>(fileType, dataId);
    if (fileData != null && fileData.onlineUrl == null) {
      // The file existed locally and was never uploaded, remove it and return
      await this.findOrUpdateCache(fileType, fileData.dataCollection, fileData.id);
    } else {
      await this.offlineStore.put(fileType, createDeletionFileData(dataCollection, dataId, projectId, ownerId));
    }
  }

  /**
   * Finds the cached file data if it exists, or updates the cache with new file data from the server.
   * If the url parameter is undefined, the data is removed from the cache.
   */
  async findOrUpdateCache(
    fileType: FileType,
    dataCollection: string,
    dataId: string,
    url?: string
  ): Promise<FileOfflineData | undefined> {
    let fileData = await this.offlineStore.get<FileOfflineData>(fileType, dataId);
    if (url == null) {
      // Remove the data only if it is not storing a request to delete from the server
      if (fileData != null && fileData.deleteRef == null) {
        await this.offlineStore.delete(fileType, dataId);
      }
      return undefined;
    } else {
      // The cache needs to be updated if no file exists or the onlineUrl does not match a valid request url.
      const notYetUploaded = isLocalBlobUrl(url);
      if (!this.pwaService.isOnline || notYetUploaded) {
        return fileData;
      }
      const cacheDataIsStale = fileData == null || fileData.onlineUrl !== url;
      if (cacheDataIsStale) {
        fileData = await this.onlineCacheFile(fileType, url, dataCollection, dataId);
      }
      return fileData;
    }
  }

  async notifyUserIfStorageQuotaBelow(megabytes: number): Promise<void> {
    // The StorageManager API is not available on some browsers e.g. Safari. So just default to true.
    // See https://caniuse.com/#feat=mdn-api_storagemanager
    let hasAdequateSpace: boolean = true;
    if (navigator.storage && navigator.storage.estimate) {
      const quota = await navigator.storage.estimate();
      hasAdequateSpace =
        quota.usage == null || quota.quota == null ? true : quota.quota - quota.usage > megabytes * 1024 * 1024;
    }
    if (!hasAdequateSpace && this.limitedStorageDialogPromise == null) {
      this.limitedStorageDialogPromise = this.noticeService
        .showMessageDialog(() => this.transloco.translate('file_service.storage_space_is_limited'))
        .then(() => (this.limitedStorageDialogPromise = undefined));
    }
  }

  private onlineDeleteFile(fileType: FileType, projectId: string, dataId: string, ownerId: string): Promise<void> {
    const method = `delete${fileType.charAt(0).toUpperCase()}${fileType.substring(1)}`;
    return this.commandService.onlineInvoke(PROJECTS_URL, method, { projectId, ownerId, dataId });
  }

  private async onlineUploadFile(fileType: FileType, projectId: string, dataId: string, file: File): Promise<string> {
    const formData = new FormData();
    formData.append('projectId', projectId);
    formData.append('dataId', dataId);
    formData.append('file', file);
    const response = await this.http
      .post<HttpResponse<string>>(`${COMMAND_API_NAMESPACE}/${PROJECTS_URL}/${fileType}`, formData, {
        headers: { Accept: 'application/json' },
        observe: 'response'
      })
      .toPromise();
    const path = response.headers.get('Location')!;
    return path.replace(`${environment.assets}${fileType}/`, '/');
  }

  private async onlineCacheFile(
    fileType: FileType,
    source: string,
    dataCollection: string,
    dataId: string
  ): Promise<FileOfflineData> {
    const url = formatFileSource(fileType, source);
    const blob: Blob = await this.onlineRequestFile(url);
    if (blob != null) {
      const fileData = createStorageFileData(dataCollection, dataId, source, blob);
      await this.offlineStore.put(fileType, fileData);
      return fileData;
    }
    throw Error('Trouble downloading requested file. It may not exist.');
  }

  private onlineRequestFile(url: string): Promise<Blob> {
    let headers: HttpHeaders = new HttpHeaders();
    headers = headers.append('Range', 'bytes=0-');
    return this.http.get(url, { headers: headers, observe: 'body', responseType: 'blob' }).toPromise();
  }

  /**
   * Detects if the error is caused by exceeding the browser's storage quota, and prompt the user to free up space.
   */
  private async onCachingError(error: any): Promise<void> {
    if (!(error instanceof DOMException) || error.name !== 'QuotaExceededError') {
      return Promise.reject(error);
    }
    // Prompt the user to free up storage space
    await this.noticeService.showMessageDialog(
      () => this.transloco.translate('file_service.exceeded_storage_quota'),
      () => this.transloco.translate('file_service.i_understand')
    );
  }
}
