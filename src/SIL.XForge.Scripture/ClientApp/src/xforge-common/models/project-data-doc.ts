import { ProjectData } from 'realtime-server/lib/common/models/project-data';
import { getValue, PathItem } from 'realtime-server/lib/common/utils/obj-path';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { FileType } from './file-offline-data';
import { JsonRealtimeDoc } from './json-realtime-doc';

export abstract class ProjectDataDoc<T extends ProjectData = ProjectData> extends JsonRealtimeDoc<T> {
  private updateFileCacheSub?: Subscription;

  async getFileContents(fileType: FileType, dataId: string): Promise<Blob | undefined> {
    if (this.realtimeService.fileService == null) {
      return undefined;
    }

    const path = this.getFileUrlPath(fileType, dataId);
    if (path == null) {
      return undefined;
    }
    let url = getValue<string>(this.data, path);
    if (url === null) {
      url = undefined;
    }
    const fileData = await this.realtimeService.fileService.findOrUpdateCache(fileType, this.collection, dataId, url);
    return fileData != null ? fileData.blob : undefined;
  }

  async uploadFile(fileType: FileType, dataId: string, blob: Blob, filename: string): Promise<string | undefined> {
    if (this.realtimeService.fileService == null || this.data == null) {
      return undefined;
    }
    return await this.realtimeService.fileService.uploadFile(
      fileType,
      this.data.projectRef,
      this.collection,
      dataId,
      this.id,
      blob,
      filename,
      this.alwaysKeepFileOffline(fileType, dataId)
    );
  }

  async deleteFile(fileType: FileType, dataId: string, ownerId: string): Promise<void> {
    if (this.realtimeService.fileService == null || this.data == null) {
      return;
    }
    await this.realtimeService.fileService.deleteFile(fileType, this.data.projectRef, this.collection, dataId, ownerId);
  }

  async updateFileUrl(fileType: FileType, dataId: string, url?: string): Promise<void> {
    const path = this.getFileUrlPath(fileType, dataId);
    if (path != null) {
      await this.submitJson0Op(op => op.pathSet(path, url));
    }
  }

  alwaysKeepFileOffline(_fileType: FileType, _dataId: string): boolean {
    return false;
  }

  async updateFileCache(): Promise<void> {
    return Promise.resolve();
  }

  onRemovedFromSubscribeQuery(): void {
    super.onRemovedFromSubscribeQuery();
    if (!this.subscribed && this.updateFileCacheSub != null) {
      this.updateFileCacheSub.unsubscribe();
      this.updateFileCacheSub = undefined;
    }
  }

  async dispose(): Promise<void> {
    await super.dispose();
    if (this.updateFileCacheSub != null) {
      this.updateFileCacheSub.unsubscribe();
      this.updateFileCacheSub = undefined;
    }
  }

  protected async onSubscribe(): Promise<void> {
    if (this.realtimeService.pwaService == null || this.updateFileCacheSub != null) {
      return;
    }

    if (this.realtimeService.pwaService.isOnline) {
      await this.updateFileCache();
    }

    this.updateFileCacheSub = this.realtimeService.pwaService.onlineStatus
      .pipe(filter(isOnline => isOnline))
      .subscribe(async () => await this.updateFileCache());
  }

  protected getFileUrlPath(_fileType: FileType, _dataId: string): PathItem[] | undefined {
    return undefined;
  }
}
