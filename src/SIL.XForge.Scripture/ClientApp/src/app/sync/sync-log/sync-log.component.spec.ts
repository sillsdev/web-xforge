import { DebugElement } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { BehaviorSubject } from 'rxjs';
import { anything, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { I18nService } from 'xforge-common/i18n.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { QueryResults } from 'xforge-common/query-parameters';
import { provideTestOnlineStatus } from 'xforge-common/test-online-status-providers';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { configureTestingModule, getTestTranslocoModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { SyncLogComponent } from './sync-log.component';
import { SyncMetricsDisplay, SyncMetricsStatus } from './sync-metrics-display';

const dateQueued = '2026-08-11T20:50:00.000Z';
const dateStarted = '2026-08-11T20:52:00.000Z';
const dateFinished = '2026-08-11T20:55:00.000Z';

const mockedActivatedProjectService = mock(ActivatedProjectService);
const mockedAuthService = mock(AuthService);
const mockedProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);

describe('SyncLogComponent', () => {
  configureTestingModule(() => ({
    imports: [getTestTranslocoModule()],
    providers: [
      provideTestOnlineStatus(),
      { provide: AuthService, useMock: mockedAuthService },
      { provide: ActivatedProjectService, useMock: mockedActivatedProjectService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: UserService, useMock: mockedUserService }
    ]
  }));

  it('should display sync log entries', fakeAsync(() => {
    const env = new TestEnvironment();
    env.populateSyncMetrics();
    env.wait();
    env.wait();

    expect(env.entries.length).toEqual(3);
    expect(env.emptyLabel).toBeNull();
  }));

  it('should give the owner component the raw date, so that it is only localized once', fakeAsync(() => {
    const env = new TestEnvironment();
    env.populateSyncMetrics();
    env.wait();
    env.wait();

    // A pre-formatted date would be re-parsed by the owner component, which swaps the day and month or yields an
    // invalid date in many locales
    expect(env.component.rows.map(row => row.dateTime)).toEqual([dateStarted, dateStarted, dateStarted]);
    const expected = env.i18n.formatDate(new Date(dateStarted), { showTime: true, showTimeZone: false });
    expect(env.dateTimes).toEqual([expected, expected, expected]);
  }));

  it('should show the queued date when a sync has not started', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setSyncMetrics([{ id: 'syncMetrics01', dateQueued, status: SyncMetricsStatus.Queued, userRef: 'user01' }]);
    env.wait();
    env.wait();

    expect(env.component.rows[0].dateTime).toEqual(dateQueued);
    expect(env.dateTimes).toEqual([env.i18n.formatDate(new Date(dateQueued), { showTime: true, showTimeZone: false })]);
  }));

  it('should show more entries when the show more button is clicked', fakeAsync(() => {
    const env = new TestEnvironment();
    env.populateSyncMetrics({ unpagedCount: 20 });
    env.wait();
    env.wait();

    expect(env.showMoreButton).not.toBeNull();
    verify(mockedProjectService.onlineSyncMetrics(env.mockProjectId, 0, SyncLogComponent.INITIAL_PAGE_SIZE)).once();

    env.clickButton(env.showMoreButton);
    env.wait();
    verify(
      mockedProjectService.onlineSyncMetrics(
        env.mockProjectId,
        0,
        SyncLogComponent.INITIAL_PAGE_SIZE + SyncLogComponent.PAGE_INCREMENT
      )
    ).once();
  }));

  it('should hide the show more button when all entries are shown', fakeAsync(() => {
    const env = new TestEnvironment();
    env.populateSyncMetrics({ unpagedCount: 3 });
    env.wait();
    env.wait();

    expect(env.entries.length).toEqual(3);
    expect(env.showMoreButton).toBeNull();
  }));

  it('should expand and collapse the error details for serval admins', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedAuthService.currentUserRoles).thenReturn([SystemRole.ServalAdmin]);
    env.populateSyncMetrics();
    env.wait();
    env.wait();

    // Only the failed sync with error details has a button
    expect(env.errorDetailsButtons.length).toEqual(1);
    expect(env.expandedErrorDetails.length).toEqual(0);

    env.clickButton(env.errorDetailsButtons[0]);
    expect(env.expandedErrorDetails.length).toEqual(1);
    expect(env.expandedErrorDetails[0].nativeElement.textContent).toContain('An error occurred');

    env.clickButton(env.errorDetailsButtons[0]);
    expect(env.expandedErrorDetails.length).toEqual(0);
  }));

  it('should show the error details button to system admins', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedAuthService.currentUserRoles).thenReturn([SystemRole.SystemAdmin]);
    env.populateSyncMetrics();
    env.wait();
    env.wait();

    expect(env.errorDetailsButtons.length).toEqual(1);
  }));

  it('should not show the error details button to other users', fakeAsync(() => {
    const env = new TestEnvironment();
    env.populateSyncMetrics();
    env.wait();
    env.wait();

    expect(env.entries.length).toEqual(3);
    expect(env.errorDetailsButtons.length).toEqual(0);
  }));

  it('should show the empty label when there are no syncs', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedProjectService.onlineSyncMetrics(anything(), anything(), anything())).thenResolve({
      results: [],
      unpagedCount: 0
    } as QueryResults<SyncMetricsDisplay>);
    env.wait();
    env.wait();

    expect(env.entries.length).toEqual(0);
    expect(env.emptyLabel).not.toBeNull();
  }));

  it('should refetch the log when a sync is queued or finishes', fakeAsync(() => {
    const env = new TestEnvironment();
    env.populateSyncMetrics();
    env.wait();
    env.wait();
    verify(mockedProjectService.onlineSyncMetrics(anything(), anything(), anything())).once();

    // A sync is queued
    env.setQueuedCount(1);
    verify(mockedProjectService.onlineSyncMetrics(anything(), anything(), anything())).twice();

    // The sync finishes
    env.setQueuedCount(0);
    verify(mockedProjectService.onlineSyncMetrics(anything(), anything(), anything())).thrice();

    // An unrelated project document change does not refetch
    env.setQueuedCount(0);
    verify(mockedProjectService.onlineSyncMetrics(anything(), anything(), anything())).thrice();
  }));

  it('should keep refetching after a failed fetch', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedProjectService.onlineSyncMetrics(anything(), anything(), anything())).thenReject(
      new Error('Connection lost')
    );
    env.wait();
    env.wait();
    expect(env.entries.length).toEqual(0);

    // The next refetch trigger succeeds
    env.populateSyncMetrics();
    env.setQueuedCount(1);
    env.wait();
    expect(env.entries.length).toEqual(3);
  }));

  it('should discard a stale response that resolves after a newer fetch', fakeAsync(() => {
    const env = new TestEnvironment();
    let resolveFirstFetch!: (value: QueryResults<SyncMetricsDisplay>) => void;
    when(mockedProjectService.onlineSyncMetrics(anything(), anything(), anything())).thenReturn(
      new Promise(resolve => (resolveFirstFetch = resolve))
    );
    env.wait();
    env.wait();

    // A newer fetch is triggered and resolves while the first is still pending
    env.populateSyncMetrics();
    env.setQueuedCount(1);
    env.wait();
    expect(env.entries.length).toEqual(3);

    // The first response resolves last and must not overwrite the newer results
    resolveFirstFetch({ results: [], unpagedCount: 0 } as QueryResults<SyncMetricsDisplay>);
    env.wait();
    expect(env.entries.length).toEqual(3);
  }));

  it('should not fetch sync metrics if offline', fakeAsync(() => {
    const env = new TestEnvironment();
    env.populateSyncMetrics();
    env.setBrowserOnlineStatus(false);
    env.wait();
    env.wait();

    verify(mockedProjectService.onlineSyncMetrics(anything(), anything(), anything())).never();
    expect(env.offlineLabel).not.toBeNull();

    env.setBrowserOnlineStatus(true);
    env.wait();
    env.wait();
    verify(mockedProjectService.onlineSyncMetrics(anything(), anything(), anything())).once();
    expect(env.offlineLabel).toBeNull();
    expect(env.entries.length).toEqual(3);
  }));
});

class TestEnvironment {
  readonly component: SyncLogComponent;
  readonly fixture: ComponentFixture<SyncLogComponent>;
  readonly testOnlineStatusService: TestOnlineStatusService = TestBed.inject(
    OnlineStatusService
  ) as TestOnlineStatusService;
  readonly i18n: I18nService = TestBed.inject(I18nService);

  mockProjectId = 'project01';
  readonly projectDocChanges$ = new BehaviorSubject<SFProjectProfileDoc | undefined>(undefined);

  constructor() {
    const mockProjectId$ = new BehaviorSubject<string>(this.mockProjectId);
    when(mockedActivatedProjectService.projectId).thenReturn(this.mockProjectId);
    when(mockedActivatedProjectService.projectId$).thenReturn(mockProjectId$);
    when(mockedActivatedProjectService.changes$).thenReturn(this.projectDocChanges$);
    when(mockedUserService.currentUserId).thenReturn('user01');
    when(mockedAuthService.currentUserRoles).thenReturn([]);
    when(mockedProjectService.onlineSyncMetrics(anything(), anything(), anything())).thenResolve({} as any);

    this.fixture = TestBed.createComponent(SyncLogComponent);
    this.component = this.fixture.componentInstance;
  }

  get entries(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('.sync-log-entry'));
  }

  get dateTimes(): string[] {
    return this.fixture.debugElement
      .queryAll(By.css('.sync-log-entry .date-time'))
      .map(element => element.nativeElement.textContent.trim());
  }

  get errorDetailsButtons(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('.error-details-button'));
  }

  get expandedErrorDetails(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('.sync-error-details'));
  }

  get showMoreButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#sync-log-show-more'));
  }

  get emptyLabel(): DebugElement {
    return this.fixture.debugElement.query(By.css('#sync-log-empty'));
  }

  get offlineLabel(): DebugElement {
    return this.fixture.debugElement.query(By.css('#sync-log-offline'));
  }

  clickButton(button: DebugElement): void {
    button.nativeElement.click();
    this.wait();
  }

  setQueuedCount(queuedCount: number): void {
    this.projectDocChanges$.next({
      data: createTestProjectProfile({ sync: { queuedCount: queuedCount } })
    } as SFProjectProfileDoc);
    this.wait();
  }

  populateSyncMetrics(args: { unpagedCount?: number } = {}): void {
    const syncMetrics: SyncMetricsDisplay[] = [
      {
        id: 'syncMetrics01',
        dateQueued,
        dateStarted,
        status: SyncMetricsStatus.Running,
        userRef: 'user01'
      },
      {
        id: 'syncMetrics02',
        dateQueued,
        dateStarted,
        dateFinished,
        status: SyncMetricsStatus.Failed,
        userRef: 'user01',
        errorDetails: 'An error occurred'
      },
      {
        id: 'syncMetrics03',
        dateQueued,
        dateStarted,
        dateFinished,
        status: SyncMetricsStatus.Successful,
        userRef: 'user02'
      }
    ];
    this.setSyncMetrics(syncMetrics, args.unpagedCount ?? syncMetrics.length);
  }

  setSyncMetrics(syncMetrics: SyncMetricsDisplay[], unpagedCount: number = syncMetrics.length): void {
    when(mockedProjectService.onlineSyncMetrics(anything(), anything(), anything())).thenResolve({
      results: syncMetrics,
      unpagedCount
    } as QueryResults<SyncMetricsDisplay>);
  }

  setBrowserOnlineStatus(status: boolean): void {
    this.testOnlineStatusService.setIsOnline(status);
  }

  wait(): void {
    this.fixture.detectChanges();
    tick();
  }
}
