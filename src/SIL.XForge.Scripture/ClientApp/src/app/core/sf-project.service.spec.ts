import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { fakeAsync, TestBed } from '@angular/core/testing';
import { anything, mock, verify } from 'ts-mockito';
import { CommandService } from 'xforge-common/command.service';
import { RealtimeService } from 'xforge-common/realtime.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { SFProjectService } from './sf-project.service';

const mockedCommandService = mock(CommandService);
const mockedRealtimeService = mock(RealtimeService);

describe('SFProjectService', () => {
  configureTestingModule(() => ({
    providers: [
      { provide: CommandService, useMock: mockedCommandService },
      { provide: RealtimeService, useMock: mockedRealtimeService },
      provideHttpClient(withInterceptorsFromDi()),
      provideHttpClientTesting()
    ]
  }));

  describe('onlineSetRoleProjectPermissions', () => {
    it('should invoke the command service', fakeAsync(async () => {
      const env = new TestEnvironment();
      const projectId = 'project01';
      const role = 'role01';
      const permissions = ['permission01'];
      await env.service.onlineSetRoleProjectPermissions(projectId, role, permissions);
      verify(mockedCommandService.onlineInvoke(anything(), 'setRoleProjectPermissions', anything())).once();
      expect().nothing();
    }));
  });

  describe('onlineSetUserProjectPermissions', () => {
    it('should invoke the command service', fakeAsync(async () => {
      const env = new TestEnvironment();
      const projectId = 'project01';
      const userId = 'user01';
      const permissions = ['permission01'];
      await env.service.onlineSetUserProjectPermissions(projectId, userId, permissions);
      verify(mockedCommandService.onlineInvoke(anything(), 'setUserProjectPermissions', anything())).once();
      expect().nothing();
    }));
  });

  describe('onlineEventMetrics', () => {
    it('should invoke the command service', fakeAsync(async () => {
      const env = new TestEnvironment();
      const projectId = 'project01';
      const pageIndex = 0;
      const pageSize = 20;
      await env.service.onlineEventMetrics(projectId, pageIndex, pageSize);
      verify(mockedCommandService.onlineInvoke(anything(), 'eventMetrics', anything())).once();
      expect().nothing();
    }));
  });

  class TestEnvironment {
    readonly httpTestingController: HttpTestingController;
    readonly service: SFProjectService;

    constructor() {
      this.httpTestingController = TestBed.inject(HttpTestingController);
      this.service = TestBed.inject(SFProjectService);
    }
  }
});
