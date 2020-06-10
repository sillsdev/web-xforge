import { HttpClient } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController, RequestMatch } from '@angular/common/http/testing';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Answer } from 'realtime-server/lib/scriptureforge/models/answer';
import { getQuestionDocId, Question } from 'realtime-server/lib/scriptureforge/models/question';
import { fromVerseRef } from 'realtime-server/lib/scriptureforge/models/verse-ref-data';
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
import { anything, instance, mock, resetCalls, verify, when } from 'ts-mockito';
import { AudioService } from 'xforge-common/audio.service';
import { AuthService } from 'xforge-common/auth.service';
import { CommandService } from 'xforge-common/command.service';
import { AudioData } from 'xforge-common/models/audio-data';
import { PwaService } from 'xforge-common/pwa.service';
import { RealtimeService } from 'xforge-common/realtime.service';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, getAudioBlob } from 'xforge-common/test-utils';
import { COMMAND_API_NAMESPACE, PROJECTS_URL } from 'xforge-common/url-constants';
import { MachineHttpClient } from './machine-http-client';
import { QuestionDoc } from './models/question-doc';
import { SF_OFFLINE_DATA_TYPES } from './models/sf-offline-data-types';
import { SF_REALTIME_DOC_TYPES } from './models/sf-realtime-doc-types';
import { SFProjectService } from './sf-project.service';

const mockedCommandService = mock(CommandService);
const mockedMachineHttpClient = mock(MachineHttpClient);
const mockedAuthService = mock(AuthService);
const mockedHttpClient = mock(HttpClient);
const mockedAudioService = mock(AudioService);

describe('SFProject Service', () => {
  configureTestingModule(() => ({
    imports: [HttpClientTestingModule],
    providers: [
      SFProjectService,
      {
        provide: RealtimeService,
        useFactory: () => new TestRealtimeService(SF_REALTIME_DOC_TYPES)
      },
      { provide: CommandService, useMock: mockedCommandService },
      { provide: MachineHttpClient, useMock: mockedMachineHttpClient },
      { provide: PwaService, useFactory: () => new PwaService(instance(mockedHttpClient)) },
      { provide: AuthService, useMock: mockedAuthService },
      { provide: AudioService, useMock: mockedAudioService }
    ]
  }));

  it('should upload audio when online', async () => {
    const env = new TestEnvironment();
    env.establishWebSocket(true);
    const questionId = 'newQuestion01';
    const questionDocId = getQuestionDocId(env.projectId, questionId);
    const response = env.simulateUploadAudio(questionDocId, questionId);
    env.setupUploadResponse();
    const url = await response;
    expect(url).toBe('/path/to/test01.wav');
    env.httpMock.verify();
    verify(mockedAudioService.findOrUpdateCache(QuestionDoc.COLLECTION, questionId, url)).once();
  });

  it('should cache audio for questions and not answers on upload', async () => {
    const env = new TestEnvironment();
    env.establishWebSocket(true);
    let response = env.simulateCreateQuestionWithAudio();
    env.setupUploadResponse();
    let questionDoc = await response;
    env.httpMock.verify();
    verify(mockedAudioService.findOrUpdateCache(questionDoc.collection, anything(), anything())).once();
    response = env.simulateAnswerQuestionWithAudio(questionDoc);
    env.setupUploadResponse();
    questionDoc = await response;
    verify(mockedAudioService.findOrUpdateCache(questionDoc.collection, anything(), anything())).once();
    expect().nothing();
  });

  it('should store audio in offline store if webSocket is closed', async () => {
    const env = new TestEnvironment();
    env.establishWebSocket(false);
    const questionId = 'newQuestion01';
    const questionDocId = getQuestionDocId(env.projectId, questionId);
    await env.simulateUploadAudio(questionDocId, questionId);
    env.httpMock.verify();
    expect(await env.offlineAudioContentLength()).toEqual(1);
  });

  it('should upload when reconnected', fakeAsync(() => {
    const env = new TestEnvironment();
    const onlineAudioUrl = '/path/to/test01.wav';
    env.establishWebSocket(false);
    env.simulateCreateQuestionWithAudio();
    tick(1000);
    const questionDoc = env.getQuestionDoc(env.newQuestionId);
    const req: RequestMatch = { url: `${COMMAND_API_NAMESPACE}/${PROJECTS_URL}/audio`, method: 'POST' };
    env.httpMock.expectNone(req);
    expect(questionDoc.data!.audioUrl).not.toBe(onlineAudioUrl);
    env.establishWebSocket(true);
    tick(1000);
    env.setupUploadResponse();
    tick(1000);
    env.httpMock.verify();
    expect(questionDoc.data!.audioUrl).toBe(onlineAudioUrl);
    verify(mockedAudioService.findOrUpdateCache(QuestionDoc.COLLECTION, env.newQuestionId, onlineAudioUrl)).once();
  }));

  it('uploads answer audio on reconnect', fakeAsync(() => {
    const env = new TestEnvironment();
    env.establishWebSocket(false);
    const questionDoc = env.getQuestionDoc('question01');
    env.simulateAnswerQuestionWithAudio(questionDoc);
    tick(1000);
    const req: RequestMatch = { url: `${COMMAND_API_NAMESPACE}/${PROJECTS_URL}/audio`, method: 'POST' };
    env.httpMock.expectNone(req);
    env.establishWebSocket(true);
    tick(1000);
    env.setupUploadResponse();
    env.httpMock.verify();
    tick(1000);
    expect(questionDoc.data!.answers[0].audioUrl).toBe('/path/to/test01.wav');
  }));

  it('should remove audio from remote server when online', async () => {
    const env = new TestEnvironment();
    env.establishWebSocket(true);
    const response = env.simulateCreateQuestionWithAudio();
    env.setupUploadResponse();
    const questionDoc = await response;
    env.httpMock.verify();
    expect(questionDoc.data!.audioUrl).toBeDefined();
    verify(
      mockedAudioService.findOrUpdateCache(questionDoc.collection, questionDoc.data!.dataId, questionDoc.data!.audioUrl)
    ).once();
    resetCalls(mockedCommandService);
    await env.simulateResetAudioOnQuestion(questionDoc);
    verify(mockedCommandService.onlineInvoke(anything(), 'deleteAudio', anything())).once();
    verify(mockedAudioService.findOrUpdateCache(questionDoc.collection, questionDoc.data!.dataId, undefined));
  });

  it('should remove audio from local storage', async () => {
    const env = new TestEnvironment();
    env.establishWebSocket(false);
    const questionDoc = await env.simulateCreateQuestionWithAudio();
    expect(await env.offlineAudioContentLength()).toEqual(1);
    await env.simulateResetAudioOnQuestion(questionDoc);
    expect(await env.offlineAudioContentLength()).toEqual(0);
  });

  it('should store audio deletion data if offline', async () => {
    const env = new TestEnvironment();
    env.establishWebSocket(true);
    const response = env.simulateCreateQuestionWithAudio();
    env.setupUploadResponse();
    const questionDoc = await response;
    expect(await env.offlineAudioContentLength()).toEqual(1);
    env.establishWebSocket(false);
    await env.simulateResetAudioOnQuestion(questionDoc);
    expect(await env.offlineAudioContentLength()).toEqual(1);
    const audio = await env.getOfflineAudioData(questionDoc.data!.dataId);
    expect(audio).toBeDefined();
    expect(audio!.deleteRef).toEqual('user01');
  });
});

class TestEnvironment {
  readonly service: SFProjectService;
  readonly httpMock: HttpTestingController;
  readonly testRealtimeService: TestRealtimeService;
  readonly projectId = 'test01';
  readonly filename = 'file01.wav';
  readonly newQuestionId = 'newQuestion01';
  isOnline: boolean = false;

  constructor() {
    this.service = TestBed.get(SFProjectService);
    this.testRealtimeService = TestBed.get(RealtimeService);
    this.httpMock = TestBed.get(HttpTestingController);

    when(mockedAuthService.isLoggedIn).thenResolve(true);
    spyOnProperty(window.navigator, 'onLine').and.returnValue(this.isOnline);

    const dateNow = new Date().toJSON();
    this.testRealtimeService.addSnapshots<Question>(QuestionDoc.COLLECTION, [
      {
        id: getQuestionDocId(this.projectId, 'question01'),
        data: {
          dataId: 'question01',
          ownerRef: 'user01',
          projectRef: this.projectId,
          answers: [],
          verseRef: fromVerseRef(VerseRef.parse('MAT 1:1')),
          dateCreated: dateNow,
          dateModified: dateNow,
          isArchived: false,
          audioUrl: 'audiofile.mp3'
        }
      }
    ]);

    when(mockedAudioService.findOrUpdateCache(QuestionDoc.COLLECTION, anything(), anything()))
      .thenCall((dataCollection: string, dataId: string, url?: string) => {
        if (url == null) {
          this.testRealtimeService.removeOfflineData(AudioData.COLLECTION, dataId);
        } else {
          this.testRealtimeService.storeOfflineData(
            AudioData.createStorageData(dataCollection, dataId, url, this.audioBlob)
          );
        }
      })
      .thenResolve();
  }

  get audioBlob(): Blob {
    return getAudioBlob();
  }

  establishWebSocket(hasConnection: boolean): void {
    this.isOnline = hasConnection;
    window.dispatchEvent(new Event(hasConnection ? 'online' : 'offline'));
  }

  getQuestionDoc(dataId: string): QuestionDoc {
    return this.testRealtimeService.get<QuestionDoc>(QuestionDoc.COLLECTION, getQuestionDocId(this.projectId, dataId));
  }

  async offlineAudioContentLength(): Promise<number> {
    const content = await this.testRealtimeService.offlineStore.getAllData<AudioData>(AudioData.COLLECTION);
    return content.length;
  }

  getOfflineAudioData(dataId: string): Promise<AudioData | undefined> {
    return this.testRealtimeService.offlineStore.getData<AudioData>(AudioData.COLLECTION, dataId);
  }

  questionDocId(dataId: string): string {
    return getQuestionDocId(this.projectId, dataId);
  }

  async simulateAnswerQuestionWithAudio(questionDoc: QuestionDoc): Promise<QuestionDoc> {
    const dateNow = new Date().toJSON();
    const answer: Answer = {
      dataId: 'answer01',
      ownerRef: 'user02',
      text: 'answer 01',
      audioUrl: 'answerAudio.wav',
      likes: [],
      comments: [],
      dateModified: dateNow,
      dateCreated: dateNow
    };
    questionDoc.submitJson0Op(op => {
      op.insert(qd => qd.answers, 0, answer);
    });
    await this.simulateUploadAudio(questionDoc.id, answer.dataId);
    return questionDoc;
  }

  async simulateCreateQuestionWithAudio(): Promise<QuestionDoc> {
    const dateNow = new Date().toJSON();
    const question: Question = {
      dataId: this.newQuestionId,
      projectRef: this.projectId,
      ownerRef: 'user01',
      text: 'question 01',
      verseRef: fromVerseRef(VerseRef.parse('MAT 1:1')),
      answers: [],
      dateCreated: dateNow,
      dateModified: dateNow,
      isArchived: false
    };
    const questionDocId = getQuestionDocId(this.projectId, question.dataId);
    question.audioUrl = await this.simulateUploadAudio(questionDocId, question.dataId);
    return this.testRealtimeService.create<QuestionDoc>(QuestionDoc.COLLECTION, questionDocId, question);
  }

  async simulateResetAudioOnQuestion(questionDoc: QuestionDoc): Promise<void> {
    await questionDoc.submitJson0Op(op => op.unset(qd => qd.audioUrl!));
    return this.service.deleteAudio(
      this.projectId,
      questionDoc.collection,
      questionDoc.data!.dataId,
      questionDoc.data!.ownerRef
    );
  }

  simulateUploadAudio(questionDocId: string, dataId: string): Promise<string> {
    return this.service.uploadAudio(
      this.projectId,
      QuestionDoc.COLLECTION,
      dataId,
      questionDocId,
      this.audioBlob,
      this.filename
    );
  }

  setupUploadResponse(): void {
    const req: RequestMatch = { url: `${COMMAND_API_NAMESPACE}/${PROJECTS_URL}/audio`, method: 'POST' };
    const request = this.httpMock.expectOne(req);
    const obj: { [name: string]: string } = {};
    obj.Location = '/path/to/test01.wav';
    request.flush('some_string_response', { headers: obj });
  }
}
