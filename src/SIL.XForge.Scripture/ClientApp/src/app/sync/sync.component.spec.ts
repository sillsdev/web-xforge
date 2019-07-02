import { CommonModule } from '@angular/common';
import { DebugElement } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { of, Subject } from 'rxjs';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { MapQueryResults } from 'xforge-common/json-api.service';
import { NoticeService } from 'xforge-common/notice.service';
import { ParatextService } from 'xforge-common/paratext.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SFProjectRef } from '../core/models/sfdomain-model.generated';
import { SFProject } from '../core/models/sfproject';
import { SyncJob, SyncJobRef, SyncJobState } from '../core/models/sync-job';
import { SFProjectService } from '../core/sfproject.service';
import { SyncJobService } from '../core/sync-job.service';
import { SyncComponent } from './sync.component';

describe('SyncComponent', () => {
  it('should display log in to paratext', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(env.title.textContent).toContain('Synchronize Sync Test Project with Paratext');
    expect(env.logInButton.nativeElement.textContent).toContain('Log in to Paratext');
    expect(env.syncButton).toBeNull();
    expect(env.lastSyncDate).toBeNull();
    env.dispose();
  }));

  it('should redirect the user to log in to paratext', fakeAsync(() => {
    const env = new TestEnvironment();
    env.clickElement(env.logInButton);
    verify(env.mockedParatextService.linkParatext(anything())).once();
    expect().nothing();
    env.dispose();
  }));

  it('should display sync project', fakeAsync(() => {
    const env = new TestEnvironment(true);
    expect(env.title.textContent).toContain('Synchronize Sync Test Project with Paratext');
    expect(env.logInButton).toBeNull();
    expect(env.syncButton.nativeElement.textContent).toContain('Synchronize');
    expect(env.lastSyncDate.textContent).toContain(' 2 months ago');
    env.dispose();
  }));

  it('should sync project when the button is clicked', fakeAsync(() => {
    const env = new TestEnvironment(true);
    verify(env.mockedProjectService.onlineGet('testproject01')).once();
    env.clickElement(env.syncButton);
    verify(env.mockedSyncJobService.start('testproject01')).once();
    verify(env.mockedSyncJobService.listen('syncjob01')).once();
    // Simulate sync starting
    env.emitSyncJob(SyncJobState.PENDING);
    expect(env.component.syncJobActive).toBe(true);
    expect(env.progressBar).toBeDefined();
    expect(env.component.isProgressDeterminate).toBe(false);
    expect(env.syncMessage.textContent).toContain('Your project is being synchronized');
    expect(env.logInButton).toBeNull();
    expect(env.syncButton).toBeNull();
    // Simulate sync in progress
    env.emitSyncJob(SyncJobState.SYNCING, 0.1);
    expect(env.component.syncJobActive).toBe(true);
    expect(env.progressBar).toBeDefined();
    expect(env.component.isProgressDeterminate).toBe(true);
    // Simulate sync completed
    env.emitSyncJob(SyncJobState.IDLE);
    expect(env.component.syncJobActive).toBe(false);
    expect(env.component.projectReload$.next).toHaveBeenCalledTimes(1);
    verify(env.mockedNoticeService.show('Successfully synchronized Sync Test Project with Paratext.'));
    env.dispose();
  }));

  it('should report error if sync has a problem', fakeAsync(() => {
    const env = new TestEnvironment(true);
    verify(env.mockedProjectService.onlineGet('testproject01')).once();
    env.clickElement(env.syncButton);
    verify(env.mockedSyncJobService.start('testproject01')).once();
    verify(env.mockedSyncJobService.listen('syncjob01')).once();
    // Simulate sync in progress
    env.emitSyncJob(SyncJobState.PENDING);
    expect(env.component.syncJobActive).toBe(true);
    expect(env.progressBar).toBeDefined();
    // Simulate sync on hold
    env.emitSyncJob(SyncJobState.ERROR);
    expect(env.component.syncJobActive).toBe(false);
    expect(env.component.projectReload$.next).toHaveBeenCalledTimes(1);
    verify(
      env.mockedNoticeService.show(
        'Something went wrong while synchronizing the Sync Test Project with Paratext. Please try again.'
      )
    );
    env.dispose();
  }));

  it('should show progress if in-progress when loaded', fakeAsync(() => {
    const env = new TestEnvironment(true, true);
    expect(env.component.syncJobActive).toBe(true);
    expect(env.progressBar).toBeDefined();
    env.dispose();
  }));
});

class TestEnvironment {
  fixture: ComponentFixture<SyncComponent>;
  component: SyncComponent;

  mockedActivatedRoute: ActivatedRoute = mock(ActivatedRoute);
  mockedNoticeService: NoticeService = mock(NoticeService);
  mockedParatextService: ParatextService = mock(ParatextService);
  mockedProjectService: SFProjectService = mock(SFProjectService);
  mockedSyncJobService: SyncJobService = mock(SyncJobService);

  private subject: Subject<SyncJob> = new Subject<SyncJob>();
  private syncJob: SyncJob;

  constructor(isParatextAccountConnected: boolean = false, isInProgress: boolean = false) {
    when(this.mockedActivatedRoute.params).thenReturn(of({ projectId: 'testproject01' }));
    const date = new Date();
    date.setMonth(date.getMonth() - 2);
    const project = new SFProject({
      id: 'testproject01',
      projectName: 'Sync Test Project',
      paratextId: 'pt01',
      lastSyncedDate: date.toUTCString()
    });
    if (isInProgress) {
      project.activeSyncJob = new SyncJobRef('syncjob01');
    }
    when(this.mockedProjectService.onlineGet('testproject01')).thenReturn(of(new MapQueryResults(project)));
    const ptUsername = isParatextAccountConnected ? 'Paratext User01' : '';
    when(this.mockedParatextService.getParatextUsername()).thenReturn(of(ptUsername));
    when(this.mockedSyncJobService.start('testproject01')).thenResolve('syncjob01');
    when(this.mockedSyncJobService.listen('syncjob01')).thenReturn(this.subject);
    this.syncJob = new SyncJob({
      id: 'syncjob01',
      project: new SFProjectRef('testproject01')
    });

    TestBed.configureTestingModule({
      declarations: [SyncComponent],
      imports: [CommonModule, UICommonModule],
      providers: [
        { provide: ActivatedRoute, useFactory: () => instance(this.mockedActivatedRoute) },
        { provide: NoticeService, useFactory: () => instance(this.mockedNoticeService) },
        { provide: ParatextService, useFactory: () => instance(this.mockedParatextService) },
        { provide: SFProjectService, useFactory: () => instance(this.mockedProjectService) },
        { provide: SyncJobService, useFactory: () => instance(this.mockedSyncJobService) }
      ]
    });

    this.fixture = TestBed.createComponent(SyncComponent);
    this.component = this.fixture.componentInstance;
    spyOn(this.component.projectReload$, 'next');
    this.fixture.detectChanges();
    tick();
    if (isInProgress) {
      this.emitSyncJob(SyncJobState.SYNCING, 0.1);
    }
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
    flush();
  }

  emitSyncJob(state: SyncJobState, percentComplete: number = 0): void {
    this.syncJob.state = state;
    this.syncJob.percentCompleted = percentComplete;
    this.subject.next(this.syncJob);
    this.fixture.detectChanges();
  }

  dispose(): void {
    this.component.ngOnDestroy();
  }
}
