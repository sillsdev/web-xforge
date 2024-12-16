import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DebugElement, getDebugNode } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterModule } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { anything, mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { NoticeService } from 'xforge-common/notice.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { SF_TYPE_REGISTRY } from '../core/models/sf-type-registry';
import { SFProjectService } from '../core/sf-project.service';
import { EventMetric, EventScope } from './event-metric';
import { EventMetricsLogComponent } from './event-metrics-log.component';

const mockedActivatedProjectService = mock(ActivatedProjectService);
const mockedAuthService = mock(AuthService);
const mockedNoticeService = mock(NoticeService);
const mockedProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);

describe('EventMetricsLogComponent', () => {
  configureTestingModule(() => ({
    imports: [
      EventMetricsLogComponent,
      NoopAnimationsModule,
      RouterModule.forRoot([]),
      UICommonModule,
      TestTranslocoModule,
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)
    ],
    providers: [
      { provide: AuthService, useMock: mockedAuthService },
      { provide: ActivatedProjectService, useMock: mockedActivatedProjectService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: UserService, useMock: mockedUserService },
      provideHttpClient(withInterceptorsFromDi()),
      provideHttpClientTesting()
    ]
  }));

  it('should not display table if no event metrics', fakeAsync(() => {
    const env = new TestEnvironment();
    env.wait();
    env.wait();

    expect(env.table).toBeNull();
  }));

  it('should display event metrics', fakeAsync(() => {
    const env = new TestEnvironment();
    env.populateEventMetrics();
    env.wait();
    env.wait();

    expect(env.rows.length).toEqual(1);
  }));
});

class TestEnvironment {
  readonly component: EventMetricsLogComponent;
  readonly fixture: ComponentFixture<EventMetricsLogComponent>;

  mockProjectId = 'project01';

  constructor() {
    const mockProjectId$ = new BehaviorSubject<string>(this.mockProjectId);
    when(mockedActivatedProjectService.projectId).thenReturn(this.mockProjectId);
    when(mockedActivatedProjectService.projectId$).thenReturn(mockProjectId$);
    when(mockedUserService.currentUserId).thenReturn('user01');
    when(mockedProjectService.onlineEventMetrics(anything(), anything(), anything())).thenReturn(null);

    this.fixture = TestBed.createComponent(EventMetricsLogComponent);
    this.component = this.fixture.componentInstance;
  }

  get table(): DebugElement {
    return this.fixture.debugElement.query(By.css('#event-metrics-log-table'));
  }

  get rows(): DebugElement[] {
    return Array.from(this.table.nativeElement.querySelectorAll('tbody tr')).map(r => getDebugNode(r) as DebugElement);
  }

  populateEventMetrics(): void {
    when(mockedProjectService.onlineEventMetrics(anything(), anything(), anything())).thenReturn(
      Promise.resolve([{ scope: EventScope.Settings, timeStamp: new Date() } as EventMetric])
    );
  }

  wait(): void {
    this.fixture.detectChanges();
    tick();
  }
}
