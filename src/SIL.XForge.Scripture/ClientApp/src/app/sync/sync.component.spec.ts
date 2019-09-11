import { CommonModule } from '@angular/common';
import { DebugElement } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { CheckingShareLevel } from 'realtime-server/lib/scriptureforge/models/checking-config';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { of } from 'rxjs';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { MemoryRealtimeOfflineStore } from 'xforge-common/memory-realtime-offline-store';
import { MemoryRealtimeDocAdapter } from 'xforge-common/memory-realtime-remote-store';
import { NoticeService } from 'xforge-common/notice.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SFProjectDoc } from '../core/models/sf-project-doc';
import { ParatextService } from '../core/paratext.service';
import { SFProjectService } from '../core/sf-project.service';
import { SyncComponent } from './sync.component';

describe('SyncComponent', () => {
  it('should display log in to paratext', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(env.title.textContent).toContain('Synchronize Sync Test Project with Paratext');
    expect(env.logInButton.nativeElement.textContent).toContain('Log in to Paratext');
    expect(env.syncButton).toBeNull();
    expect(env.lastSyncDate).toBeNull();
  }));

  it('should redirect the user to log in to paratext', fakeAsync(() => {
    const env = new TestEnvironment();
    env.clickElement(env.logInButton);
    verify(env.mockedParatextService.linkParatext(anything())).once();
    expect().nothing();
  }));

  it('should display sync project', fakeAsync(() => {
    const env = new TestEnvironment(true);
    expect(env.title.textContent).toContain('Synchronize Sync Test Project with Paratext');
    expect(env.logInButton).toBeNull();
    expect(env.syncButton.nativeElement.textContent).toContain('Synchronize');
    expect(env.lastSyncDate.textContent).toContain(' 2 months ago');
  }));

  it('should sync project when the button is clicked', fakeAsync(() => {
    const env = new TestEnvironment(true);
    verify(env.mockedProjectService.get('testproject01')).once();
    env.clickElement(env.syncButton);
    verify(env.mockedProjectService.onlineSync('testproject01')).once();
    expect(env.component.syncActive).toBe(true);
    expect(env.progressBar).toBeDefined();
    expect(env.component.isProgressDeterminate).toBe(false);
    expect(env.syncMessage.textContent).toContain('Your project is being synchronized');
    expect(env.logInButton).toBeNull();
    expect(env.syncButton).toBeNull();
    // Simulate sync starting
    env.emitSyncProgress(0);
    expect(env.component.isProgressDeterminate).toBe(true);
    // Simulate sync in progress
    env.emitSyncProgress(0.5);
    env.emitSyncProgress(1);
    // Simulate sync completed
    env.emitSyncComplete(true);
    expect(env.component.syncActive).toBe(false);
    verify(env.mockedNoticeService.show('Successfully synchronized Sync Test Project with Paratext.')).once();
  }));

  it('should report error if sync has a problem', fakeAsync(() => {
    const env = new TestEnvironment(true);
    verify(env.mockedProjectService.get('testproject01')).once();
    env.clickElement(env.syncButton);
    verify(env.mockedProjectService.onlineSync('testproject01')).once();
    expect(env.component.syncActive).toBe(true);
    expect(env.progressBar).toBeDefined();
    // Simulate sync in progress
    env.emitSyncProgress(0);
    // Simulate sync error
    env.emitSyncComplete(false);
    expect(env.component.syncActive).toBe(false);
    verify(
      env.mockedNoticeService.show(
        'Something went wrong while synchronizing the Sync Test Project with Paratext. Please try again.'
      )
    ).once();
  }));

  it('should show progress if in-progress when loaded', fakeAsync(() => {
    const env = new TestEnvironment(true, true);
    expect(env.component.syncActive).toBe(true);
    expect(env.progressBar).toBeDefined();
  }));
});

class TestEnvironment {
  readonly fixture: ComponentFixture<SyncComponent>;
  readonly component: SyncComponent;

  readonly mockedActivatedRoute = mock(ActivatedRoute);
  readonly mockedNoticeService = mock(NoticeService);
  readonly mockedParatextService = mock(ParatextService);
  readonly mockedProjectService = mock(SFProjectService);

  private readonly offlineStore = new MemoryRealtimeOfflineStore();
  private readonly project: SFProject;
  private readonly projectDocAdapter: MemoryRealtimeDocAdapter;
  private isLoading: boolean = false;

  constructor(isParatextAccountConnected: boolean = false, isInProgress: boolean = false) {
    when(this.mockedActivatedRoute.params).thenReturn(of({ projectId: 'testproject01' }));
    const ptUsername = isParatextAccountConnected ? 'Paratext User01' : '';
    when(this.mockedParatextService.getParatextUsername()).thenReturn(of(ptUsername));
    when(this.mockedProjectService.onlineSync('testproject01')).thenResolve();
    when(this.mockedNoticeService.loadingStarted()).thenCall(() => (this.isLoading = true));
    when(this.mockedNoticeService.loadingFinished()).thenCall(() => (this.isLoading = false));
    when(this.mockedNoticeService.isAppLoading).thenCall(() => this.isLoading);

    const date = new Date();
    date.setMonth(date.getMonth() - 2);
    this.project = {
      name: 'Sync Test Project',
      paratextId: 'pt01',
      inputSystem: {
        tag: 'en',
        languageName: 'English'
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
      texts: [],
      userRoles: {}
    };
    this.projectDocAdapter = new MemoryRealtimeDocAdapter(SFProjectDoc.COLLECTION, 'testproject01', this.project);
    when(this.mockedProjectService.get('testproject01')).thenResolve(
      new SFProjectDoc(this.offlineStore, this.projectDocAdapter)
    );

    TestBed.configureTestingModule({
      declarations: [SyncComponent],
      imports: [CommonModule, UICommonModule],
      providers: [
        { provide: ActivatedRoute, useFactory: () => instance(this.mockedActivatedRoute) },
        { provide: NoticeService, useFactory: () => instance(this.mockedNoticeService) },
        { provide: ParatextService, useFactory: () => instance(this.mockedParatextService) },
        { provide: SFProjectService, useFactory: () => instance(this.mockedProjectService) }
      ]
    });

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

  clickElement(element: HTMLElement | DebugElement): void {
    if (element instanceof DebugElement) {
      element = element.nativeElement as HTMLElement;
    }
    element.click();
    this.fixture.detectChanges();
    tick();
  }

  emitSyncProgress(percentCompleted: number): void {
    this.project.sync.queuedCount = 1;
    this.project.sync.percentCompleted = percentCompleted;
    this.projectDocAdapter.emitRemoteChange();
    this.fixture.detectChanges();
  }

  emitSyncComplete(successful: boolean): void {
    this.project.sync.queuedCount = 0;
    this.project.sync.percentCompleted = undefined;
    this.project.sync.lastSyncSuccessful = successful;
    if (successful) {
      this.project.sync.dateLastSuccessfulSync = new Date().toJSON();
    }
    this.projectDocAdapter.emitRemoteChange();
    this.fixture.detectChanges();
  }
}
