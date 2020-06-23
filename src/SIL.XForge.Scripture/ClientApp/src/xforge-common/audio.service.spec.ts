import { HttpClientTestingModule, HttpTestingController, RequestMatch } from '@angular/common/http/testing';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { mock, when } from 'ts-mockito';
import { configureTestingModule, getAudioBlob } from 'xforge-common/test-utils';
import { environment } from '../environments/environment';
import { AudioService, formatAudioSource } from './audio.service';
import { AudioData } from './models/audio-data';
import { OfflineData } from './models/offline-data';
import { PwaService } from './pwa.service';
import { RealtimeDocTypes } from './realtime-doc-types';
import { RealtimeService } from './realtime.service';
import { TestRealtimeService } from './test-realtime.service';

const mockedPwaService = mock(PwaService);

describe('AudioService', () => {
  configureTestingModule(() => ({
    imports: [HttpClientTestingModule],
    providers: [
      AudioService,
      {
        provide: RealtimeService,
        useFactory: () => new TestRealtimeService(new RealtimeDocTypes([]))
      },
      { provide: PwaService, useMock: mockedPwaService }
    ]
  }));

  it('should fetch from server and update cache', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(env.getCachedValue(env.dataId)).toBeUndefined();
    env.service.findOrUpdateCache('questions', env.dataId, env.audioUrl);
    tick(1000);
    env.setupAudioResponse(env.audioUrl);
    tick(1000);
    env.httpMock.verify();
    let audio = env.getCachedValue(env.dataId);
    expect(audio).not.toBeNull();
    expect(audio!.onlineUrl).toBe(env.audioUrl);

    const serverFile = '/new/file.mp3';
    env.service.findOrUpdateCache('questions', env.dataId, serverFile);
    tick(1000);
    const requestUrl = env.setupAudioResponse(serverFile);
    expect(requestUrl).toBe(environment.assets.audio + 'new/file.mp3');
    tick(1000);
    env.httpMock.verify();
    audio = env.getCachedValue(env.dataId);
    expect(audio).not.toBeNull();
    expect(audio!.onlineUrl).toBe('/new/file.mp3');
  }));

  it('should return cached value', async () => {
    const env = new TestEnvironment();
    env.cacheAudioData(AudioData.createStorageData('questions', env.dataId, env.audioUrl, getAudioBlob()));
    expect(env.getCachedValue(env.dataId)).not.toBeNull();
    const response = env.service.findOrUpdateCache('questions', env.dataId, env.audioUrl);
    const req: RequestMatch = { url: formatAudioSource(env.audioUrl), method: 'GET' };
    env.httpMock.expectNone(req);
    const audioData = await response;
    env.httpMock.verify();
    expect(env.getCachedValue(env.dataId)).not.toBeNull();
    expect(audioData!.id).toBe(env.dataId);
  });

  it('should remove from cache unless deletion is indicated', async () => {
    const env = new TestEnvironment();
    env.cacheAudioData(AudioData.createStorageData('questions', env.dataId, env.audioUrl, getAudioBlob()));
    expect(env.getCachedValue(env.dataId)).not.toBeNull();
    let response = await env.service.findOrUpdateCache('questions', env.dataId, undefined);
    expect(response).toBeUndefined();
    env.httpMock.verify();
    expect(env.getCachedValue(env.dataId)).toBeUndefined();

    // The audio data stores a flag to delete from the server when the user returns online. Do not remove in this case
    env.cacheAudioData(AudioData.createDeletionData('questions', env.dataId, 'project01', 'owner01'));
    expect(env.getCachedValue(env.dataId)).not.toBeNull();
    response = await env.service.findOrUpdateCache('questions', env.dataId, undefined);
    expect(response).toBeUndefined();
    env.httpMock.verify();
    const deletionData = env.getCachedValue(env.dataId);
    expect(deletionData).not.toBeNull();
    expect(deletionData!.deleteRef).toBe('owner01');
  });

  it('does not cache if url is of a local object', async () => {
    const env = new TestEnvironment();
    expect(env.getCachedValue(env.dataId)).toBeUndefined();
    // URLs of local objects should not be requested
    const response = await env.service.findOrUpdateCache('questions', env.dataId, 'blob:http://localhost:5000');
    expect(response).toBeUndefined();
    env.httpMock.verify();
    expect(env.getCachedValue(env.dataId)).toBeUndefined();
  });
});

class TestEnvironment {
  readonly audioUrl = '/path/to/audio.mp3';
  readonly dataId = 'data01';
  service: AudioService;
  realtimeService: TestRealtimeService;
  httpMock: HttpTestingController;

  private isOnline = true;

  constructor() {
    this.realtimeService = TestBed.get(RealtimeService);
    this.service = TestBed.get(AudioService);
    this.httpMock = TestBed.get(HttpTestingController);
    when(mockedPwaService.isOnline).thenReturn(this.isOnline);
  }

  cacheAudioData(data: OfflineData): void {
    this.realtimeService.addOfflineData(AudioData.COLLECTION, data);
  }

  getCachedValue(dataId: string): AudioData | undefined {
    const collection = this.realtimeService.offlineDataCollection(AudioData.COLLECTION);
    return collection == null ? undefined : collection.get(dataId);
  }

  setupAudioResponse(url: string): string {
    const requestedUrl = formatAudioSource(url);
    const req: RequestMatch = { url: requestedUrl, method: 'GET' };
    const request = this.httpMock.expectOne(req);
    request.flush(getAudioBlob());
    return requestedUrl;
  }
}
