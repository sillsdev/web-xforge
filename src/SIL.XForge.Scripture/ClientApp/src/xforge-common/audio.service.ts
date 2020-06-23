import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../environments/environment';
import { AUDIO_COLLECTION, AudioData } from './models/audio-data';
import { PwaService } from './pwa.service';
import { RealtimeService } from './realtime.service';

// Urls containing this prefix are local blob not yet been uploaded to the server i.e. blob:http://localhost...
const LOCAL_BLOB_PREFIX = 'blob:http://';

/**
 * Formats the name of an audio file stored on the server into a URL a http client can use to request the data.
 */
export function formatAudioSource(source: string): string {
  if (!source.startsWith(LOCAL_BLOB_PREFIX)) {
    if (source.startsWith('/')) {
      source = source.substring(1);
    }
    source = environment.assets.audio + source;
  }
  return source;
}

/**
 * Provides access to locally cached audio data while keeping the cache up-to-date.
 */
@Injectable({
  providedIn: 'root'
})
export class AudioService {
  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly pwaService: PwaService,
    private readonly http: HttpClient
  ) {}

  /**
   * Finds the cached audio data if it exists, or updates the cache with new audio data from the server.
   * If the url parameter is undefined, the data is removed from the cache
   */
  async findOrUpdateCache(dataCollection: string, dataId: string, url?: string): Promise<AudioData | undefined> {
    let audioData = await this.realtimeService.offlineStore.getData<AudioData>(AUDIO_COLLECTION, dataId);
    if (url == null) {
      // Remove the data only if it is not storing a request to delete from the server
      if (audioData != null && audioData.deleteRef == null) {
        this.realtimeService.removeOfflineData(AudioData.COLLECTION, dataId);
      }
      return;
    }
    // The cache needs to be updated if no audio exists or the onlineUrl does not match a valid request url.
    const notYetUploaded = url.startsWith(LOCAL_BLOB_PREFIX);
    if (!this.pwaService.isOnline || notYetUploaded) {
      return audioData;
    }
    const cacheDataIsStale = audioData == null || audioData.onlineUrl !== url;
    if (cacheDataIsStale) {
      audioData = await this.onlineCacheAudio(url, dataCollection, dataId);
    }
    return audioData;
  }

  private async onlineCacheAudio(source: string, dataCollection: string, dataId: string): Promise<AudioData> {
    const url = formatAudioSource(source);
    const blob: Blob = await this.onlineRequestAudio(url);
    if (blob != null) {
      const audioData = AudioData.createStorageData(dataCollection, dataId, source, blob);
      return this.realtimeService.storeOfflineData(audioData);
    }
    return Promise.reject('Trouble downloading requested audio file. It may not exist.');
  }

  private async onlineRequestAudio(url: string): Promise<Blob> {
    let headers: HttpHeaders = new HttpHeaders();
    headers = headers.append('Range', 'bytes=0-');
    return this.http.get(url, { headers: headers, observe: 'body', responseType: 'blob' }).toPromise();
  }
}
