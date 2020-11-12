import { CommonModule } from '@angular/common';
import { DebugElement } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { CookieService } from 'ngx-cookie-service';
import { CheckingShareLevel } from 'realtime-server/lib/scriptureforge/models/checking-config';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { BehaviorSubject, of } from 'rxjs';
import { anything, mock, verify, when } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { NoticeService } from 'xforge-common/notice.service';
import { PwaService } from 'xforge-common/pwa.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SFProjectDoc } from '../core/models/sf-project-doc';
import { SF_TYPE_REGISTRY } from '../core/models/sf-type-registry';
import { ParatextService } from '../core/paratext.service';
import { SFProjectService } from '../core/sf-project.service';
import { SyncComponent } from './sync.component';

const mockedAuthService = mock(AuthService);
const mockedActivatedRoute = mock(ActivatedRoute);
const mockedNoticeService = mock(NoticeService);
const mockedParatextService = mock(ParatextService);
const mockedProjectService = mock(SFProjectService);
const mockedCookieService = mock(CookieService);
const mockedPwaService = mock(PwaService);

describe('SyncComponent', () => {
  configureTestingModule(() => ({
    declarations: [SyncComponent],
    imports: [CommonModule, UICommonModule, TestTranslocoModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [
      { provide: AuthService, useMock: mockedAuthService },
      { provide: ActivatedRoute, useMock: mockedActivatedRoute },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: ParatextService, useMock: mockedParatextService },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: CookieService, useMock: mockedCookieService },
      { provide: PwaService, useMock: mockedPwaService }
    ]
  }));

  it('should display log in to paratext', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(env.title.textContent).toContain('Synchronize Sync Test Project with Paratext');
    expect(env.logInButton.nativeElement.textContent).toContain('Log in to Paratext');
    expect(env.syncButton).toBeNull();
    expect(env.lastSyncDate).toBeNull();
    expect(env.logInButton.nativeElement.disabled).toBe(false);
    env.onlineStatus = false;
    expect(env.logInButton).toBeNull();
  }));

  it('should redirect the user to log in to paratext', fakeAsync(() => {
    const env = new TestEnvironment();
    env.clickElement(env.logInButton);
    verify(mockedParatextService.linkParatext(anything())).once();
    expect().nothing();
  }));

  it('should display sync project', fakeAsync(() => {
    const env = new TestEnvironment(true);
    expect(env.title.textContent).toContain('Synchronize Sync Test Project with Paratext');
    expect(env.logInButton).toBeNull();
    expect(env.syncButton.nativeElement.textContent).toContain('Synchronize');
    expect(env.lastSyncDate.textContent).toContain('Last synced on');
  }));

  it('should disable button when offline', fakeAsync(() => {
    const env = new TestEnvironment(true, false, false);
    expect(env.logInButton).toBeNull();
    expect(env.syncButton.nativeElement.disabled).toBe(true);
    expect(env.lastSyncDate.textContent).toContain('Last synced on');
    expect(env.offlineMessage).not.toBeNull();
    env.onlineStatus = true;
    expect(env.syncButton.nativeElement.disabled).toBe(false);
    expect(env.offlineMessage).toBeNull();
  }));

  it('should sync project when the button is clicked', fakeAsync(() => {
    const env = new TestEnvironment(true);
    verify(mockedProjectService.get('testProject01')).once();
    env.clickElement(env.syncButton);
    verify(mockedProjectService.onlineSync('testProject01')).once();
    expect(env.component.syncActive).toBe(true);
    expect(env.progressBar).not.toBeNull();
    expect(env.component.isProgressDeterminate).toBe(false);
    expect(env.syncMessage.textContent).toContain('Your project is being synchronized');
    expect(env.logInButton).toBeNull();
    expect(env.syncButton).toBeNull();
    // Simulate sync starting
    env.emitSyncProgress(0);
    expect(env.component.isProgressDeterminate).toBe(false);
    // Simulate sync in progress
    env.emitSyncProgress(0.5);
    expect(env.component.isProgressDeterminate).toBe(true);
    env.emitSyncProgress(1);
    // Simulate sync completed
    env.emitSyncComplete(true);
    expect(env.component.syncActive).toBe(false);
    verify(mockedNoticeService.show('Successfully synchronized Sync Test Project with Paratext.')).once();
  }));

  it('should report error if sync has a problem', fakeAsync(() => {
    const env = new TestEnvironment(true);
    verify(mockedProjectService.get('testProject01')).once();
    env.clickElement(env.syncButton);
    verify(mockedProjectService.onlineSync('testProject01')).once();
    expect(env.component.syncActive).toBe(true);
    expect(env.progressBar).not.toBeNull();
    // Simulate sync in progress
    env.emitSyncProgress(0);
    // Simulate sync error
    env.emitSyncComplete(false);
    expect(env.component.syncActive).toBe(false);
    verify(mockedNoticeService.showMessageDialog(anything())).once();
  }));

  it('should show progress if in-progress when loaded', fakeAsync(() => {
    const env = new TestEnvironment(true, true);
    expect(env.component.syncActive).toBe(true);
    expect(env.progressBar).not.toBeNull();
  }));

  it('should explain and disable button when syncDisabled', fakeAsync(() => {
    const env = new TestEnvironment(true, false, true, true);
    expect(env.logInButton).toBeNull();
    expect(env.syncButton.nativeElement.disabled).toBe(true);
    expect(env.lastSyncDate.textContent).toContain('Last synced on');
    expect(env.syncDisabledMessage).not.toBeNull();
  }));

  it('should not explain or disable button when not syncDisabled', fakeAsync(() => {
    const env = new TestEnvironment(true, false, true, false);
    expect(env.syncButton.nativeElement.disabled).toBe(false);
    expect(env.syncDisabledMessage).toBeNull();
  }));
});

class TestEnvironment {
  readonly fixture: ComponentFixture<SyncComponent>;
  readonly component: SyncComponent;

  private readonly realtimeService: TestRealtimeService = TestBed.get<TestRealtimeService>(TestRealtimeService);
  private isLoading: boolean = false;
  private isOnline: BehaviorSubject<boolean>;

  constructor(
    isParatextAccountConnected: boolean = false,
    isInProgress: boolean = false,
    isOnline: boolean = true,
    isSyncDisabled: boolean = false
  ) {
    when(mockedActivatedRoute.params).thenReturn(of({ projectId: 'testProject01' }));
    const ptUsername = isParatextAccountConnected ? 'Paratext User01' : '';
    when(mockedParatextService.getParatextUsername()).thenReturn(of(ptUsername));
    when(mockedProjectService.onlineSync('testProject01')).thenResolve();
    when(mockedNoticeService.loadingStarted()).thenCall(() => (this.isLoading = true));
    when(mockedNoticeService.loadingFinished()).thenCall(() => (this.isLoading = false));
    when(mockedNoticeService.isAppLoading).thenCall(() => this.isLoading);
    this.isOnline = new BehaviorSubject(isOnline);
    when(mockedPwaService.onlineStatus).thenReturn(this.isOnline.asObservable());

    const date = new Date();
    date.setMonth(date.getMonth() - 2);
    this.realtimeService.addSnapshot<SFProject>(SFProjectDoc.COLLECTION, {
      id: 'testProject01',
      data: {
        name: 'Sync Test Project',
        paratextId: 'pt01',
        shortName: 'P01',
        writingSystem: {
          tag: 'en'
        },
        translateConfig: {
          translationSuggestionsEnabled: false
        },
        checkingConfig: {
          checkingEnabled: false,
          usersSeeEachOthersResponses: true,
          shareEnabled: true,
          shareLevel: CheckingShareLevel.Specific
        },
        sync: {
          queuedCount: isInProgress ? 1 : 0,
          percentCompleted: isInProgress ? 0.1 : undefined,
          lastSyncSuccessful: true,
          dateLastSuccessfulSync: date.toJSON()
        },
        syncDisabled: isSyncDisabled,
        texts: [],
        userRoles: {}
      }
    });
    when(mockedProjectService.get('testProject01')).thenCall(() =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, 'testProject01')
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

  get progressBar(): DebugElement {
    return this.fixture.debugElement.query(By.css('mdc-linear-progress'));
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
    return this.fixture.nativeElement.querySelector('#syncDisabled-message');
  }

  get offlineMessage(): HTMLElement {
    return this.fixture.nativeElement.querySelector('.offline-text');
  }

  set onlineStatus(hasConnection: boolean) {
    this.isOnline.next(hasConnection);
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

  emitSyncProgress(percentCompleted: number): void {
    const projectDoc = this.realtimeService.get<SFProjectDoc>(SFProjectDoc.COLLECTION, 'testProject01');
    projectDoc.submitJson0Op(ops => {
      ops.set<number>(p => p.sync.queuedCount, 1);
      ops.set(p => p.sync.percentCompleted!, percentCompleted);
    }, false);
    this.fixture.detectChanges();
  }

  emitSyncComplete(successful: boolean): void {
    const projectDoc = this.realtimeService.get<SFProjectDoc>(SFProjectDoc.COLLECTION, 'testProject01');
    projectDoc.submitJson0Op(ops => {
      ops.set<number>(p => p.sync.queuedCount, 0);
      ops.unset(p => p.sync.percentCompleted!);
      ops.set(p => p.sync.lastSyncSuccessful!, successful);
      if (successful) {
        ops.set(p => p.sync.dateLastSuccessfulSync!, new Date().toJSON());
      }
    }, false);
    this.fixture.detectChanges();
  }
}
