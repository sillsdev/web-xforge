import { CommonModule } from '@angular/common';
import { DebugElement, ErrorHandler } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { CookieService } from 'ngx-cookie-service';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { createTestProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { of } from 'rxjs';
import { anyString, anything, mock, verify, when } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { BugsnagService } from 'xforge-common/bugsnag.service';
import { CommandError, CommandErrorCode } from 'xforge-common/command.service';
import { DialogService } from 'xforge-common/dialog.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SFProjectDoc } from '../core/models/sf-project-doc';
import { SF_TYPE_REGISTRY } from '../core/models/sf-type-registry';
import { ParatextService } from '../core/paratext.service';
import { ProjectNotificationService } from '../core/project-notification.service';
import { SFProjectService } from '../core/sf-project.service';
import { NoticeComponent } from '../shared/notice/notice.component';
import { SyncProgressComponent } from './sync-progress/sync-progress.component';
import { SyncComponent } from './sync.component';

const mockedAuthService = mock(AuthService);
const mockedActivatedRoute = mock(ActivatedRoute);
const mockedErrorHandler = mock(ErrorHandler);
const mockedNoticeService = mock(NoticeService);
const mockedDialogService = mock(DialogService);
const mockedParatextService = mock(ParatextService);
const mockedProjectService = mock(SFProjectService);
const mockedProjectNotificationService = mock(ProjectNotificationService);
const mockedBugsnagService = mock(BugsnagService);
const mockedCookieService = mock(CookieService);

describe('SyncComponent', () => {
  configureTestingModule(() => ({
    declarations: [SyncComponent, SyncProgressComponent],
    imports: [
      CommonModule,
      UICommonModule,
      TestTranslocoModule,
      TestOnlineStatusModule.forRoot(),
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY),
      NoticeComponent
    ],
    providers: [
      { provide: AuthService, useMock: mockedAuthService },
      { provide: ActivatedRoute, useMock: mockedActivatedRoute },
      { provide: ErrorHandler, useMock: mockedErrorHandler },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: DialogService, useMock: mockedDialogService },
      { provide: ParatextService, useMock: mockedParatextService },
      { provide: ProjectNotificationService, useMock: mockedProjectNotificationService },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: BugsnagService, useMock: mockedBugsnagService },
      { provide: CookieService, useMock: mockedCookieService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService }
    ]
  }));

  it('should display Log In to Paratext', fakeAsync(() => {
    const env = new TestEnvironment({ isParatextAccountConnected: false });
    expect(env.title.textContent).toContain('Synchronize Sync Test Project with Paratext');
    expect(env.logInButton.nativeElement.textContent).toContain('Log in to Paratext');
    expect(env.syncButton).toBeNull();
    expect(env.lastSyncDate).toBeNull();
    expect(env.logInButton.nativeElement.disabled).toBe(false);
    env.onlineStatus = false;
    expect(env.logInButton).toBeNull();
  }));

  it('should redirect the user to Log In to Paratext', fakeAsync(() => {
    const env = new TestEnvironment({ isParatextAccountConnected: false });

    env.clickElement(env.logInButton);

    verify(mockedParatextService.linkParatext(anything())).once();
    expect().nothing();
  }));

  it('should display sync project', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(env.title.textContent).toContain('Synchronize Sync Test Project with Paratext');
    expect(env.logInButton).toBeNull();
    expect(env.syncButton.nativeElement.textContent).toContain('Sync with Paratext');
    expect(env.lastSyncDate.textContent).toContain('Last synced on');
  }));

  it('should disable button when offline', fakeAsync(() => {
    const env = new TestEnvironment({ isParatextAccountConnected: true, isInProgress: false, isOnline: false });
    expect(env.logInButton).toBeNull();
    expect(env.syncButton.nativeElement.disabled).toBe(true);
    expect(env.lastSyncDate.textContent).toContain('Last synced on');
    expect(env.offlineMessage).not.toBeNull();

    env.onlineStatus = true;

    expect(env.syncButton.nativeElement.disabled).toBe(false);
    expect(env.offlineMessage).toBeNull();
  }));

  it('should sync project when the button is clicked', fakeAsync(() => {
    const env = new TestEnvironment();
    const previousLastSyncDate = env.component.lastSyncDate;
    verify(mockedProjectService.get(env.projectId)).once();

    env.clickElement(env.syncButton);

    verify(mockedProjectService.onlineSync(env.projectId)).once();
    expect(env.component.syncActive).toBe(true);
    expect(env.progressBar).not.toBeNull();
    expect(env.cancelButton).not.toBeNull();
    expect(env.logInButton).toBeNull();
    expect(env.syncButton).toBeNull();
    env.emitSyncComplete(true, env.projectId);
    expect(env.component.lastSyncDate!.getTime()).toBeGreaterThan(previousLastSyncDate!.getTime());
    verify(mockedNoticeService.show('Successfully synchronized Sync Test Project with Paratext.')).once();
  }));

  it('should display the Paratext credentials update prompt when sync throws a forbidden error', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedProjectService.onlineSync(env.projectId)).thenReject(
      new CommandError(CommandErrorCode.Forbidden, 'Forbidden')
    );

    env.clickElement(env.syncButton);

    verify(mockedProjectService.onlineSync(env.projectId)).once();
    verify(mockedAuthService.requestParatextCredentialUpdate()).once();
    expect(env.component.syncActive).toBe(false);
  }));

  it('should report error if sync has a problem', fakeAsync(() => {
    const env = new TestEnvironment();
    verify(mockedProjectService.get(env.projectId)).once();
    env.clickElement(env.syncButton);
    verify(mockedProjectService.onlineSync(env.projectId)).once();
    expect(env.component.syncActive).toBe(true);
    expect(env.progressBar).not.toBeNull();
    // Simulate sync in progress
    env.setQueuedCount(env.projectId);

    // Simulate sync error
    env.emitSyncComplete(false, env.projectId);

    expect(env.component.syncActive).toBe(false);
    verify(mockedDialogService.message(anything())).once();
  }));

  it('should report user permissions error if sync failed for that reason', fakeAsync(() => {
    const env = new TestEnvironment({ lastSyncErrorCode: -1, lastSyncWasSuccessful: false });
    verify(mockedProjectService.get(env.projectId)).once();
    env.clickElement(env.syncButton);
    verify(mockedProjectService.onlineSync(env.projectId)).once();
    expect(env.component.syncActive).toBe(true);
    expect(env.progressBar).not.toBeNull();
    // Simulate sync in progress
    env.setQueuedCount(env.projectId);

    // Simulate sync error
    env.emitSyncComplete(false, env.projectId);

    expect(env.component.syncActive).toBe(false);
    expect(env.component.showSyncUserPermissionsFailureMessage).toBe(true);
    expect(env.syncFailureSupportMessage).not.toBeNull();
    expect(env.appNoticeUserPermissionError).not.toBeNull();
  }));

  it('should show progress if in-progress when loaded', fakeAsync(() => {
    const env = new TestEnvironment({ isParatextAccountConnected: true, isInProgress: true });
    expect(env.component.syncActive).toBe(true);
    expect(env.progressBar).not.toBeNull();
  }));

  it('should direct to support if last sync was failure', fakeAsync(() => {
    const env = new TestEnvironment({ lastSyncWasSuccessful: false });
    expect(env.syncFailureSupportMessage).not.toBeNull();
  }));

  it('should not direct to support if last sync was not failure', fakeAsync(() => {
    const env = new TestEnvironment({ lastSyncWasSuccessful: true });
    expect(env.syncFailureSupportMessage).toBeNull();
  }));

  it('should not direct to support if last sync success has no record', fakeAsync(() => {
    const env = new TestEnvironment();
    env.component.projectDoc!.data!.sync.lastSyncSuccessful = undefined;
    tick();
    env.fixture.detectChanges();
    expect(env.component.projectDoc?.data?.sync.lastSyncSuccessful).withContext('setup').toBeUndefined();
    expect(env.syncFailureSupportMessage)
      .withContext('do not show support message when the last sync success record is absent')
      .toBeNull();
  }));

  it('should explain and disable button when syncDisabled', fakeAsync(() => {
    const env = new TestEnvironment({
      isParatextAccountConnected: true,
      isInProgress: false,
      isOnline: true,
      isSyncDisabled: true
    });
    expect(env.logInButton).toBeNull();
    expect(env.syncButton.nativeElement.disabled).toBe(true);
    expect(env.lastSyncDate.textContent).toContain('Last synced on');
    expect(env.syncDisabledMessage).not.toBeNull();
  }));

  it('should not explain or disable button when not syncDisabled', fakeAsync(() => {
    const env = new TestEnvironment({
      isParatextAccountConnected: true,
      isInProgress: false,
      isOnline: true,
      isSyncDisabled: false
    });
    expect(env.syncButton.nativeElement.disabled).toBe(false);
    expect(env.syncDisabledMessage).toBeNull();
  }));

  it('should not report if sync was cancelled', fakeAsync(() => {
    const env = new TestEnvironment();
    const previousLastSyncDate = env.component.lastSyncDate;
    verify(mockedProjectService.get(env.projectId)).once();
    env.clickElement(env.syncButton);
    verify(mockedProjectService.onlineSync(env.projectId)).once();
    expect(env.component.syncActive).toBe(true);
    expect(env.progressBar).not.toBeNull();
    env.setQueuedCount(env.projectId);

    env.clickElement(env.cancelButton);
    env.emitSyncComplete(false, env.projectId);

    expect(env.component.syncActive).toBe(false);
    expect(env.component.lastSyncDate).toEqual(previousLastSyncDate);
    verify(mockedNoticeService.show(anything())).never();
    verify(mockedDialogService.message(anything())).never();
  }));

  it('should report success if sync was cancelled but had finished', fakeAsync(() => {
    const env = new TestEnvironment();
    verify(mockedProjectService.get(env.projectId)).once();
    env.clickElement(env.syncButton);
    verify(mockedProjectService.onlineSync(env.projectId)).once();
    expect(env.component.syncActive).toBe(true);
    expect(env.progressBar).not.toBeNull();

    env.clickElement(env.cancelButton);
    env.emitSyncComplete(true, env.projectId);

    verify(mockedNoticeService.show('Successfully synchronized Sync Test Project with Paratext.')).once();
    verify(mockedDialogService.message(anything())).never();
  }));
});

interface SyncComponentTestConstructorArgs {
  isParatextAccountConnected?: boolean;
  isInProgress?: boolean;
  isOnline?: boolean;
  isSyncDisabled?: boolean;
  lastSyncWasSuccessful?: boolean;
  lastSyncErrorCode?: number;
}

class TestEnvironment {
  readonly fixture: ComponentFixture<SyncComponent>;
  readonly component: SyncComponent;
  readonly projectId = 'testProject01';
  readonly testOnlineStatusService: TestOnlineStatusService = TestBed.inject(
    OnlineStatusService
  ) as TestOnlineStatusService;

  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);
  private isLoading: boolean = false;

  constructor(args: SyncComponentTestConstructorArgs = {}) {
    const isParatextAccountConnected: boolean = args.isParatextAccountConnected ?? true;
    const isInProgress: boolean = args.isInProgress ?? false;
    const isOnline: boolean = args.isOnline ?? true;
    const isSyncDisabled: boolean = args.isSyncDisabled ?? false;
    const lastSyncWasSuccessful: boolean = args.lastSyncWasSuccessful ?? true;
    const lastSyncErrorCode: number = args.lastSyncErrorCode ?? 0;

    when(mockedActivatedRoute.params).thenReturn(of({ projectId: this.projectId }));
    const ptUsername = isParatextAccountConnected ? 'Paratext User01' : '';
    when(mockedParatextService.getParatextUsername()).thenReturn(of(ptUsername));
    when(mockedProjectService.onlineSync(anything()))
      .thenCall(id => this.setQueuedCount(id))
      .thenResolve();
    when(mockedNoticeService.loadingStarted(anything())).thenCall(() => (this.isLoading = true));
    when(mockedNoticeService.loadingFinished(anything())).thenCall(() => (this.isLoading = false));
    when(mockedNoticeService.isAppLoading).thenCall(() => this.isLoading);
    this.testOnlineStatusService.setIsOnline(isOnline);

    const date = new Date();
    date.setMonth(date.getMonth() - 2);
    this.realtimeService.addSnapshot<SFProject>(SFProjectDoc.COLLECTION, {
      id: this.projectId,
      data: createTestProject({
        name: 'Sync Test Project',
        sync: {
          queuedCount: isInProgress ? 1 : 0,
          lastSyncSuccessful: lastSyncWasSuccessful,
          dateLastSuccessfulSync: date.toJSON(),
          lastSyncErrorCode: lastSyncErrorCode
        },
        syncDisabled: isSyncDisabled
      })
    });

    when(mockedProjectService.get(anyString())).thenCall(projectId =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, projectId)
    );

    this.fixture = TestBed.createComponent(SyncComponent);
    this.component = this.fixture.componentInstance;
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }

  get logInButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#btn-log-in'));
  }

  get syncButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#btn-sync'));
  }

  get cancelButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#btn-cancel-sync'));
  }

  get progressBar(): DebugElement {
    return this.fixture.debugElement.query(By.css('mat-progress-bar'));
  }

  get title(): HTMLElement {
    return this.fixture.nativeElement.querySelector('#title');
  }

  get lastSyncDate(): HTMLElement {
    return this.fixture.nativeElement.querySelector('#date-last-sync');
  }

  get syncMessage(): HTMLElement {
    return this.fixture.nativeElement.querySelector('#sync-message');
  }

  get syncDisabledMessage(): HTMLElement {
    return this.fixture.nativeElement.querySelector('#sync-disabled-message');
  }

  get syncFailureSupportMessage(): HTMLElement {
    return this.fixture.nativeElement.querySelector('#sync-failure-support-message');
  }

  get appNoticeUserPermissionError(): HTMLElement {
    return this.fixture.nativeElement.querySelector('#sync-user-permission-failure-message');
  }

  get offlineMessage(): HTMLElement {
    return this.fixture.nativeElement.querySelector('.offline-text');
  }

  set onlineStatus(hasConnection: boolean) {
    this.testOnlineStatusService.setIsOnline(hasConnection);
    tick();
    this.fixture.detectChanges();
  }

  clickElement(element: HTMLElement | DebugElement): void {
    if (element instanceof DebugElement) {
      element = element.nativeElement as HTMLElement;
    }
    element.click();
    this.fixture.detectChanges();
    tick();
  }

  setQueuedCount(projectId: string): void {
    const projectDoc = this.realtimeService.get<SFProjectDoc>(SFProjectDoc.COLLECTION, projectId);
    projectDoc.submitJson0Op(op => op.set<number>(p => p.sync.queuedCount, 1), false);
    this.fixture.detectChanges();
  }

  emitSyncComplete(successful: boolean, projectId: string): void {
    const projectDoc = this.realtimeService.get<SFProjectDoc>(SFProjectDoc.COLLECTION, projectId);
    projectDoc.submitJson0Op(ops => {
      ops.set<number>(p => p.sync.queuedCount, 0);
      ops.set(p => p.sync.lastSyncSuccessful!, successful);
      if (successful) {
        ops.set(p => p.sync.dateLastSuccessfulSync!, new Date().toJSON());
      }
    }, false);
    this.fixture.detectChanges();
  }
}
