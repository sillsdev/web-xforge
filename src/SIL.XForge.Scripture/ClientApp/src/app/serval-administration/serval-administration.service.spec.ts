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
    providers: [
      { provide: CommandService, useMock: mockedCommandService },
      { provide: RealtimeService, useMock: mockedRealtimeService },
      { provide: RetryingRequestService, useMock: mockedRetryingRequestService }
    ]
  }));

  it('should be created', () => {
    const env = new TestEnvironment();
    expect(env.service).toBeTruthy();
  });

  class TestEnvironment {
    readonly service: ServalAdministrationService;

    constructor() {
      this.service = TestBed.inject(ServalAdministrationService);
    }
  }
});
