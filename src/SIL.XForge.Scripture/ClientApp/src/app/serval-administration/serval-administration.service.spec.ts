import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { mock } from 'ts-mockito';
import { CommandService } from 'xforge-common/command.service';
import { RealtimeService } from 'xforge-common/realtime.service';
import { RetryingRequestService } from 'xforge-common/retrying-request.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { ServalAdministrationService } from './serval-administration.service';

const mockedCommandService = mock(CommandService);
const mockedRealtimeService = mock(RealtimeService);
const mockedRetryingRequestService = mock(RetryingRequestService);

describe('ServalAdministrationService', () => {
  configureTestingModule(() => ({
    imports: [HttpClientTestingModule],
    providers: [
      { provide: CommandService, useMock: mockedCommandService },
      { provide: RealtimeService, useMock: mockedRealtimeService },
      { provide: RetryingRequestService, useMock: mockedRetryingRequestService }
    ]
  }));

  describe('isResource', () => {
    it('should return true for a resource id', () => {
      const env = new TestEnvironment();
      const id = '1234567890abcdef';
      expect(env.service.isResource(id)).toBeTruthy();
    });

    it('should return true for a project id', () => {
      const env = new TestEnvironment();
      const id = '123456781234567890abcdef1234567890abcdef1234567890abcdef';
      expect(env.service.isResource(id)).toBeFalsy();
    });
  });

  describe('downloadProject', () => {
    it('should return a blob', () => {
      const env = new TestEnvironment();
      const projectId = 'project01';
      const mockBlob = new Blob();
      env.service.downloadProject(projectId).subscribe(blob => {
        expect(blob).toEqual(mockBlob);
      });

      const request = env.httpTestingController.expectOne(`paratext-api/projects/${projectId}/download`);
      expect(request.request.method).toBe('GET');
      request.flush(mockBlob);
      env.httpTestingController.verify();
    });
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
