import { HttpClientTestingModule, HttpTestingController, RequestMatch } from '@angular/common/http/testing';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { ProjectData } from 'realtime-server/lib/common/models/project-data';
import { obj, PathItem } from 'realtime-server/lib/common/utils/obj-path';
import { BehaviorSubject } from 'rxjs';
import { anything, mock, verify, when } from 'ts-mockito';
import { configureTestingModule, getAudioBlob, TestTranslocoModule } from 'xforge-common/test-utils';
import { environment } from '../environments/environment';
import { AuthService } from './auth.service';
import { CommandService } from './command.service';
import { FileService, formatFileSource } from './file.service';
import { createDeletionFileData, createStorageFileData, FileOfflineData, FileType } from './models/file-offline-data';
import { ProjectDataDoc } from './models/project-data-doc';
import { NoticeService } from './notice.service';
import { PwaService } from './pwa.service';
import { RealtimeService } from './realtime.service';
import { TestRealtimeModule } from './test-realtime.module';
import { TestRealtimeService } from './test-realtime.service';
import { TypeRegistry } from './type-registry';
import { COMMAND_API_NAMESPACE, PROJECTS_URL } from './url-constants';

const mockedPwaService = mock(PwaService);
const mockedAuthService = mock(AuthService);
const mockedCommandService = mock(CommandService);
const mockedNoticeService = mock(NoticeService);

describe('FileService', () => {
  configureTestingModule(() => ({
    imports: [
      HttpClientTestingModule,
      TestTranslocoModule,
      TestRealtimeModule.forRoot(new TypeRegistry([TestDataDoc], [FileType.Audio]))
    ],
    providers: [
      FileService,
      { provide: PwaService, useMock: mockedPwaService },
      { provide: AuthService, useMock: mockedAuthService },
      { provide: CommandService, useMock: mockedCommandService },
      { provide: NoticeService, useMock: mockedNoticeService }
    ]
  }));

  it('should fetch from server and update cache', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(env.getCachedValue(env.dataId)).toBeUndefined();
    env.service.findOrUpdateCache(FileType.Audio, TestDataDoc.COLLECTION, env.dataId, env.audioUrl);
    tick();
    env.setupAudioResponse(env.audioUrl);
    env.httpMock.verify();
    let audio = env.getCachedValue(env.dataId);
    expect(audio).not.toBeNull();
    expect(audio!.onlineUrl).toBe(env.audioUrl);

    const serverFile = '/new/file.mp3';
    env.service.findOrUpdateCache(FileType.Audio, TestDataDoc.COLLECTION, env.dataId, serverFile);
    tick();
    const requestUrl = env.setupAudioResponse(serverFile);
    expect(requestUrl).toBe(environment.assets + 'audio/new/file.mp3');
    env.httpMock.verify();
    audio = env.getCachedValue(env.dataId);
    expect(audio).not.toBeNull();
    expect(audio!.onlineUrl).toBe('/new/file.mp3');
  }));

  it('should return cached value', fakeAsync(() => {
    const env = new TestEnvironment();
    env.cacheAudioData(createStorageFileData(TestDataDoc.COLLECTION, env.dataId, env.audioUrl, getAudioBlob()));
    expect(env.getCachedValue(env.dataId)).not.toBeNull();
    let audioData: FileOfflineData | undefined;
    env.service
      .findOrUpdateCache(FileType.Audio, TestDataDoc.COLLECTION, env.dataId, env.audioUrl)
      .then(d => (audioData = d));
    const req: RequestMatch = { url: formatFileSource(FileType.Audio, env.audioUrl), method: 'GET' };
    env.httpMock.expectNone(req);
    tick();
    env.httpMock.verify();
    expect(env.getCachedValue(env.dataId)).not.toBeNull();
    expect(audioData!.id).toBe(env.dataId);
  }));

  it('should remove from cache unless deletion is indicated', fakeAsync(() => {
    const env = new TestEnvironment();
    env.cacheAudioData(createStorageFileData(TestDataDoc.COLLECTION, env.dataId, env.audioUrl, getAudioBlob()));
    expect(env.getCachedValue(env.dataId)).not.toBeNull();
    let audioData: FileOfflineData | undefined;
    env.service
      .findOrUpdateCache(FileType.Audio, TestDataDoc.COLLECTION, env.dataId, undefined)
      .then(d => (audioData = d));
    tick();
    expect(audioData).toBeUndefined();
    env.httpMock.verify();
    expect(env.getCachedValue(env.dataId)).toBeUndefined();

    // The audio data stores a flag to delete from the server when the user returns online. Do not remove in this case
    env.cacheAudioData(createDeletionFileData(TestDataDoc.COLLECTION, env.dataId, env.projectId, env.userId));
    expect(env.getCachedValue(env.dataId)).not.toBeNull();
    env.service
      .findOrUpdateCache(FileType.Audio, TestDataDoc.COLLECTION, env.dataId, undefined)
      .then(d => (audioData = d));
    tick();
    expect(audioData).toBeUndefined();
    env.httpMock.verify();
    const deletionData = env.getCachedValue(env.dataId);
    expect(deletionData).not.toBeNull();
    expect(deletionData!.deleteRef).toBe(env.userId);
  }));

  it('does not cache if url is of a local object', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(env.getCachedValue(env.dataId)).toBeUndefined();
    let audioData: FileOfflineData | undefined;
    // URLs of local objects should not be requested
    env.service
      .findOrUpdateCache(FileType.Audio, TestDataDoc.COLLECTION, env.dataId, 'blob://localhost:5000')
      .then(d => (audioData = d));
    tick();
    expect(audioData).toBeUndefined();
    env.httpMock.verify();
    expect(env.getCachedValue(env.dataId)).toBeUndefined();
  }));

  it('should upload audio when online', fakeAsync(() => {
    const env = new TestEnvironment();
    let url: string | undefined;
    env.simulateUploadAudio(env.doc!).then(u => (url = u));
    env.setupUploadResponse();
    env.setupAudioResponse(env.audioUrl);
    expect(url).toBe(env.audioUrl);
    env.httpMock.verify();
  }));

  it('should not cache file that is not available offline', fakeAsync(() => {
    const env = new TestEnvironment();
    env.simulateUploadAudio(env.doc!);
    env.setupUploadResponse();
    env.setupAudioResponse(env.audioUrl);
    env.httpMock.verify();
    env.simulateAddChildWithAudio(env.doc!);
    env.setupUploadResponse();
    env.httpMock.verify();
    expect(env.getCachedValue(env.childDataId)).toBeUndefined();
  }));

  it('should store file in offline store if offline', fakeAsync(() => {
    const env = new TestEnvironment(false);
    env.simulateUploadAudio(env.doc!);
    tick();
    expect(env.getCachedValue(env.dataId)).toBeDefined();
  }));

  it('should upload when reconnected', fakeAsync(() => {
    const env = new TestEnvironment(false);
    env.simulateUploadAudio(env.doc!);
    const req: RequestMatch = { url: `${COMMAND_API_NAMESPACE}/${PROJECTS_URL}/audio`, method: 'POST' };
    env.httpMock.expectNone(req);
    tick();
    expect(env.doc!.data!.audioUrl).not.toBe(env.audioUrl);
    env.onlineStatus = true;
    env.setupUploadResponse();
    env.setupAudioResponse(env.audioUrl);
    env.httpMock.verify();
    expect(env.doc!.data!.audioUrl).toBe(env.audioUrl);
  }));

  it('uploads child file on reconnect', fakeAsync(() => {
    const env = new TestEnvironment(false);
    env.simulateAddChildWithAudio(env.doc!);
    const req: RequestMatch = { url: `${COMMAND_API_NAMESPACE}/${PROJECTS_URL}/audio`, method: 'POST' };
    env.httpMock.expectNone(req);
    tick();
    env.onlineStatus = true;
    env.setupUploadResponse();
    env.httpMock.verify();
    expect(env.doc!.data!.child!.audioUrl).toBe(env.audioUrl);
  }));

  it('should remove file from remote server when online', fakeAsync(() => {
    const env = new TestEnvironment();
    env.simulateUploadAudio(env.doc!);
    env.setupUploadResponse();
    env.setupAudioResponse(env.audioUrl);
    env.httpMock.verify();
    expect(env.doc!.data!.audioUrl).toBeDefined();
    env.simulateDeleteFile(env.doc!);
    tick();
    verify(mockedCommandService.onlineInvoke(anything(), 'deleteAudio', anything())).once();
    env.httpMock.verify();
  }));

  it('should remove file from offline store', fakeAsync(() => {
    const env = new TestEnvironment(false);
    env.simulateUploadAudio(env.doc!);
    tick();
    expect(env.getCachedValue(env.dataId)).toBeDefined();
    env.simulateDeleteFile(env.doc!);
    tick();
    expect(env.getCachedValue(env.dataId)).toBeUndefined();
  }));

  it('should store file deletion data if offline', fakeAsync(() => {
    const env = new TestEnvironment();
    env.simulateUploadAudio(env.doc!);
    env.setupUploadResponse();
    env.setupAudioResponse(env.audioUrl);
    expect(env.getCachedValue(env.dataId)).toBeDefined();
    env.onlineStatus = false;
    env.simulateDeleteFile(env.doc!);
    tick();
    const data = env.getCachedValue(env.dataId);
    expect(data).toBeDefined();
    expect(data!.deleteRef).toEqual(env.userId);
  }));

  it('should show dialog when storage quota exceeded', fakeAsync(() => {
    const env = new TestEnvironment(false);
    env.realtimeService.offlineStorageQuotaStatus = true;
    when(mockedNoticeService.showMessageDialog(anything(), anything())).thenResolve();
    env.simulateUploadAudio(env.doc!);
    tick();
    verify(mockedNoticeService.showMessageDialog(anything(), anything())).once();
    expect(env.doc!.data!.audioUrl).toBeUndefined();
  }));
});

interface ChildData {
  dataId: string;
  audioUrl?: string;
}

interface TestData extends ProjectData {
  dataId: string;
  audioUrl?: string;
  child?: ChildData;
}

class TestDataDoc extends ProjectDataDoc<TestData> {
  static readonly COLLECTION = 'test';
  static readonly INDEX_PATHS = [];

  alwaysKeepFileOffline(fileType: FileType, dataId: string): boolean {
    return this.data != null && fileType === FileType.Audio && this.data.dataId === dataId;
  }

  async updateFileCache(): Promise<void> {
    if (this.realtimeService.fileService == null || this.data == null) {
      return;
    }

    if (this.data.audioUrl != null) {
      await this.realtimeService.fileService.findOrUpdateCache(
        FileType.Audio,
        this.collection,
        this.data.dataId,
        this.data.audioUrl
      );
    }
  }

  protected getFileUrlPath(fileType: FileType, dataId: string): PathItem[] | undefined {
    if (this.data == null || fileType !== FileType.Audio) {
      return undefined;
    }

    if (this.data.dataId === dataId) {
      return obj<TestData>().path(q => q.audioUrl!);
    } else if (this.data.child != null && this.data.child.dataId === dataId) {
      return obj<TestData>().path(q => q.child!.audioUrl!);
    }
    return undefined;
  }
}

class TestEnvironment {
  readonly audioUrl = '/path/to/audio.mp3';
  readonly dataId = 'data01';
  readonly filename = 'file01.wav';
  readonly newDataId = 'newData01';
  readonly projectId = 'project01';
  readonly userId = 'user01';
  readonly childDataId = 'child01';

  doc?: TestDataDoc;
  readonly service: FileService;
  readonly realtimeService: TestRealtimeService;
  readonly httpMock: HttpTestingController;

  private readonly isOnline: BehaviorSubject<boolean>;

  constructor(isOnline: boolean = true) {
    this.isOnline = new BehaviorSubject<boolean>(isOnline);
    when(mockedPwaService.isOnline).thenReturn(isOnline);
    when(mockedPwaService.onlineStatus).thenReturn(this.isOnline);
    when(mockedAuthService.isLoggedIn).thenResolve(true);

    this.realtimeService = TestBed.get(RealtimeService);
    this.service = TestBed.get(FileService);
    this.httpMock = TestBed.get(HttpTestingController);

    this.realtimeService.addSnapshot(TestDataDoc.COLLECTION, {
      id: this.dataId,
      data: { dataId: this.dataId, projectRef: this.projectId, ownerRef: this.userId }
    });
    this.realtimeService.subscribe<TestDataDoc>(TestDataDoc.COLLECTION, this.dataId).then(d => (this.doc = d));
    tick();
  }

  get audioBlob(): Blob {
    return getAudioBlob();
  }

  set onlineStatus(hasConnection: boolean) {
    when(mockedPwaService.isOnline).thenReturn(hasConnection);
    this.isOnline.next(hasConnection);
    tick();
  }

  cacheAudioData(data: FileOfflineData): void {
    this.realtimeService.addFileData(FileType.Audio, data);
  }

  getCachedValue(dataId: string): FileOfflineData | undefined {
    return this.realtimeService.getFileData(FileType.Audio, dataId);
  }

  async simulateUploadAudio(doc: TestDataDoc): Promise<string> {
    const url = await doc.uploadFile(FileType.Audio, doc.id, this.audioBlob, this.filename);
    await doc.submitJson0Op(op => {
      op.set(td => td.audioUrl, url);
    });
    return url!;
  }

  async simulateAddChildWithAudio(doc: TestDataDoc): Promise<void> {
    const url = await doc.uploadFile(FileType.Audio, this.childDataId, this.audioBlob, this.filename);
    const child: ChildData = {
      dataId: this.childDataId,
      audioUrl: url
    };
    await doc.submitJson0Op(op => {
      op.set(td => td.child!, child);
    });
  }

  async simulateDeleteFile(doc: TestDataDoc): Promise<void> {
    await doc.submitJson0Op(op => op.unset(td => td.audioUrl!));
    await doc.deleteFile(FileType.Audio, doc.data!.dataId, doc.data!.ownerRef);
  }

  setupUploadResponse(): void {
    const req: RequestMatch = { url: `${COMMAND_API_NAMESPACE}/${PROJECTS_URL}/audio`, method: 'POST' };
    const request = this.httpMock.expectOne(req);
    const object: { [name: string]: string } = {};
    object.Location = formatFileSource(FileType.Audio, this.audioUrl);
    request.flush('some_string_response', { headers: object });
    tick();
  }

  setupAudioResponse(url: string): string {
    const requestedUrl = formatFileSource(FileType.Audio, url);
    const req: RequestMatch = { url: requestedUrl, method: 'GET' };
    const request = this.httpMock.expectOne(req);
    request.flush(getAudioBlob());
    tick();
    return requestedUrl;
  }
}
