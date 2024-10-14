import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { fakeAsync, TestBed } from '@angular/core/testing';
import { anything, mock, verify } from 'ts-mockito';
import { CommandService } from 'xforge-common/command.service';
import { RealtimeService } from 'xforge-common/realtime.service';
import { RetryingRequestService } from 'xforge-common/retrying-request.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { PARATEXT_API_NAMESPACE } from 'xforge-common/url-constants';
import { ServalAdministrationService } from './serval-administration.service';

const mockedCommandService = mock(CommandService);
const mockedRealtimeService = mock(RealtimeService);
const mockedRetryingRequestService = mock(RetryingRequestService);

describe('ServalAdministrationService', () => {
  configureTestingModule(() => ({
    providers: [
      { provide: CommandService, useMock: mockedCommandService },
      { provide: RealtimeService, useMock: mockedRealtimeService },
      { provide: RetryingRequestService, useMock: mockedRetryingRequestService },
      provideHttpClient(withInterceptorsFromDi()),
      provideHttpClientTesting()
    ]
  }));

  describe('downloadProject', () => {
    it('should return a blob', () => {
      const env = new TestEnvironment();
      const projectId = 'project01';
      const mockBlob = new Blob();
      env.service.downloadProject(projectId).subscribe(blob => {
        expect(blob).toEqual(mockBlob);
      });

      const request = env.httpTestingController.expectOne(`${PARATEXT_API_NAMESPACE}/projects/${projectId}/download`);
      expect(request.request.method).toBe('GET');
      request.flush(mockBlob);
      env.httpTestingController.verify();
    });
  });

  describe('onlineRetrievePreTranslationStatus', () => {
    it('should invoke the command service', fakeAsync(async () => {
      const env = new TestEnvironment();
      const id = '1234567890abcdef';
      await env.service.onlineRetrievePreTranslationStatus(id);
      verify(mockedCommandService.onlineInvoke(anything(), 'retrievePreTranslationStatus', anything())).once();
      expect().nothing();
    }));
  });

  class TestEnvironment {
    readonly httpTestingController: HttpTestingController;
    readonly service: ServalAdministrationService;

    constructor() {
      this.httpTestingController = TestBed.inject(HttpTestingController);
      this.service = TestBed.inject(ServalAdministrationService);
    }
  }
});
