import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../environments/environment';
import { AUDIO_COLLECTION, AudioData } from './models/audio-data';
import { PwaService } from './pwa.service';
import { RealtimeService } from './realtime.service';

export function formatAudioSource(source: string): string {
  if (!source.includes('://')) {
    if (source.startsWith('/')) {
      source = source.substring(1);
    }
    source = environment.assets.audio + source;
  }
  return source;
}

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
   */
  async findOrUpdateCache(dataCollection: string, dataId: string, url?: string): Promise<AudioData | undefined> {
    let audioData = await this.realtimeService.offlineStore.getData<AudioData>(AUDIO_COLLECTION, dataId);
    if (url == null) {
      if (audioData != null && audioData.deleteRef == null) {
        this.realtimeService.removeOfflineData(AudioData.COLLECTION, dataId);
      }
      return;
    }
    // The cache needs to be updated if no audio exists or the onlineUrl does not match a valid request url
    const needsUpdate = (audioData == null || audioData.onlineUrl !== url) && !url.includes('://');
    if (needsUpdate && this.pwaService.isOnline) {
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
    return Promise.reject('The requested audio file does not exist.');
  }

  private async onlineRequestAudio(url: string): Promise<Blob> {
    let headers: HttpHeaders = new HttpHeaders();
    headers = headers.append('Range', 'bytes=0-');
    const response: Blob = await this.http
      .get(url, { headers: headers, observe: 'body', responseType: 'blob' })
      .toPromise();
    return response;
  }
}
