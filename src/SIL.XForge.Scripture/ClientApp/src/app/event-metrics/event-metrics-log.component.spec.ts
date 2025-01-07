import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DebugElement, getDebugNode } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterModule } from '@angular/router';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { BehaviorSubject } from 'rxjs';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { DialogService } from 'xforge-common/dialog.service';
import { NoticeService } from 'xforge-common/notice.service';
import { QueryResults } from 'xforge-common/query-parameters';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { SF_TYPE_REGISTRY } from '../core/models/sf-type-registry';
import { SFProjectService } from '../core/sf-project.service';
import { EventMetric, EventScope } from './event-metric';
import { EventMetricDialogComponent } from './event-metric-dialog.component';
import { EventMetricsLogComponent } from './event-metrics-log.component';

const mockedActivatedProjectService = mock(ActivatedProjectService);
const mockedAuthService = mock(AuthService);
const mockDialogService = mock(DialogService);
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
      { provide: DialogService, useMock: mockDialogService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: UserService, useMock: mockedUserService },
      provideHttpClient(withInterceptorsFromDi()),
      provideHttpClientTesting()
    ]
  }));

  it('should display event metrics', fakeAsync(() => {
    const env = new TestEnvironment();
    env.populateEventMetrics();
    env.wait();
    env.wait();

    expect(env.rows.length).toEqual(2);
  }));

  it('should display the details dialog to serval admin', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedAuthService.currentUserRoles).thenReturn([SystemRole.ServalAdmin]);
    env.populateEventMetrics();
    env.wait();
    env.wait();

    expect(env.rows.length).toEqual(2);
    env.clickButton(env.cell(0, 4).query(By.css('button')));
    verify(mockDialogService.openMatDialog(EventMetricDialogComponent, anything())).once();
  }));

  it('should display the details dialog to system admin', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedAuthService.currentUserRoles).thenReturn([SystemRole.SystemAdmin]);
    env.populateEventMetrics();
    env.wait();
    env.wait();

    expect(env.rows.length).toEqual(2);
    env.clickButton(env.cell(0, 4).query(By.css('button')));
    verify(mockDialogService.openMatDialog(EventMetricDialogComponent, anything())).once();
  }));

  it('should not display table if invalid results', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedProjectService.onlineEventMetrics(anything(), anything(), anything())).thenReturn(
      Promise.resolve({ results: null, unpagedCount: 0 } as QueryResults<EventMetric>)
    );
    env.wait();
    env.wait();

    expect(env.table).toBeNull();
  }));

  it('should not display table if no event metrics', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedProjectService.onlineEventMetrics(anything(), anything(), anything())).thenReturn(
      Promise.resolve({ results: [], unpagedCount: 0 } as QueryResults<EventMetric>)
    );
    env.wait();
    env.wait();

    expect(env.table).toBeNull();
  }));

  it('should not display the details dialog to project admin', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedAuthService.currentUserRoles).thenReturn([]);
    env.populateEventMetrics();
    env.wait();
    env.wait();

    expect(env.rows.length).toEqual(2);
    expect(env.cell(0, 4)).toBeUndefined();
  }));

  it('should page event metrics', fakeAsync(() => {
    const env = new TestEnvironment();
    env.populateEventMetrics();
    env.component.updatePage(0, 2);
    env.wait();
    env.wait();

    expect(env.nextButton.nativeElement.disabled).toBeFalse();
    env.clickButton(env.nextButton);

    expect(env.nextButton.nativeElement.disabled).toBeTrue();
    expect(env.rows.length).toEqual(2);
  }));

  it('should show custom event type calculations', fakeAsync(() => {
    const env = new TestEnvironment();
    // This list is to ensure complete test coverage of the custom cases in EventMetricsLogComponent.getEventType()
    let eventMetrics: Partial<EventMetric>[] = [
      { eventType: 'SetIsValidAsync', payload: { isValid: true } },
      { eventType: 'SetIsValidAsync', payload: { isValid: false } },
      { eventType: 'SetDraftAppliedAsync', payload: { draftApplied: true } },
      { eventType: 'SetDraftAppliedAsync', payload: { draftApplied: false } },
      { eventType: 'SetPreTranslateAsync', payload: { preTranslate: true } },
      { eventType: 'SetPreTranslateAsync', payload: { preTranslate: false } }
    ];

    env.populateEventMetrics(eventMetrics);
    env.wait();
    env.wait();

    expect(env.rows.length).toEqual(eventMetrics.length);
  }));
});

class TestEnvironment {
  readonly component: EventMetricsLogComponent;
  readonly fixture: ComponentFixture<EventMetricsLogComponent>;
  dialogRef = mock(MatDialogRef<EventMetricDialogComponent>);

  mockProjectId = 'project01';

  constructor() {
    const mockProjectId$ = new BehaviorSubject<string>(this.mockProjectId);
    when(mockedActivatedProjectService.projectId).thenReturn(this.mockProjectId);
    when(mockedActivatedProjectService.projectId$).thenReturn(mockProjectId$);
    when(mockedUserService.currentUserId).thenReturn('user01');
    when(mockedAuthService.currentUserRoles).thenReturn([]);
    when(mockDialogService.openMatDialog(EventMetricDialogComponent, anything())).thenReturn(instance(this.dialogRef));
    when(mockedProjectService.onlineEventMetrics(anything(), anything(), anything())).thenReturn(null);

    this.fixture = TestBed.createComponent(EventMetricsLogComponent);
    this.component = this.fixture.componentInstance;
  }

  get nextButton(): DebugElement {
    return this.paginator.query(By.css('.mat-mdc-paginator-navigation-next'));
  }

  get paginator(): DebugElement {
    return this.fixture.debugElement.query(By.css('mat-paginator'));
  }

  get rows(): DebugElement[] {
    return Array.from(this.table.nativeElement.querySelectorAll('tbody tr')).map(r => getDebugNode(r) as DebugElement);
  }

  get table(): DebugElement {
    return this.fixture.debugElement.query(By.css('#event-metrics-log-table'));
  }

  cell(row: number, column: number): DebugElement {
    return this.rows[row].children[column];
  }

  clickButton(button: DebugElement): void {
    button.nativeElement.click();
    this.wait();
  }

  populateEventMetrics(eventMetrics: Partial<EventMetric>[] | undefined = undefined): void {
    eventMetrics ??= [
      { scope: EventScope.Sync, timeStamp: new Date().toISOString(), eventType: 'SyncAsync' } as EventMetric,
      { scope: EventScope.Settings, timeStamp: new Date().toISOString(), eventType: 'UnknownType' } as EventMetric
    ];
    when(mockedProjectService.onlineEventMetrics(anything(), anything(), anything())).thenReturn(
      Promise.resolve({
        results: eventMetrics,
        unpagedCount: eventMetrics.length * 2
      } as QueryResults<EventMetric>)
    );
  }

  wait(): void {
    this.fixture.detectChanges();
    tick();
  }
}
