import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { distanceInWordsToNow } from 'date-fns';
import { EMPTY, Observable, Subject, Subscription, timer } from 'rxjs';
import { expand, filter, map, startWith, switchMap, tap, withLatestFrom } from 'rxjs/operators';
import { NoticeService } from 'xforge-common/notice.service';
import { ParatextService } from 'xforge-common/paratext.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { SFProject } from '../core/models/sfproject';
import { SyncJobState } from '../core/models/sync-job';
import { SFProjectService } from '../core/sfproject.service';
import { SyncJobService } from '../core/sync-job.service';

@Component({
  selector: 'app-sync',
  templateUrl: './sync.component.html',
  styleUrls: ['./sync.component.scss']
})
export class SyncComponent extends SubscriptionDisposable implements OnInit, OnDestroy {
  readonly projectReload$ = new Subject<void>();
  syncJobActive: boolean = false;
  project: SFProject;
  percentComplete: number;

  private isFirstLoad: boolean = true;
  private paratextUsername: string;
  private projectId: string;
  private syncInProgressSub: Subscription;
  private activeSyncJobId: string;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly noticeService: NoticeService,
    private readonly paratextService: ParatextService,
    private readonly projectService: SFProjectService,
    private readonly syncJobService: SyncJobService
  ) {
    super();
  }

  get isLoading(): boolean {
    return this.isFirstLoad || this.noticeService.isLoading;
  }

  get isLoggedIntoParatext(): boolean {
    return this.paratextUsername && this.paratextUsername.length > 0;
  }

  get isProgressDeterminate(): boolean {
    return !!this.percentComplete && this.percentComplete > 0;
  }

  get lastSyncNotice(): string {
    if (!this.project) {
      return '';
    }
    if (
      this.project.lastSyncedDate == null ||
      this.project.lastSyncedDate === '' ||
      Date.parse(this.project.lastSyncedDate) <= 0
    ) {
      return 'Never been synced';
    } else {
      return 'Last sync was ' + distanceInWordsToNow(this.project.lastSyncedDate) + ' ago';
    }
  }

  get lastSyncDate() {
    const date = new Date(this.project.lastSyncedDate);
    return date.toLocaleString();
  }

  ngOnInit() {
    this.subscribe(
      this.route.params.pipe(
        tap(params => {
          this.noticeService.loadingStarted();
          this.projectId = params['projectId'];
        }),
        switchMap(() =>
          this.projectReload$.pipe(
            // emit when first subscribed, so that the project is retrieved on startup
            startWith(null),
            // retrieve the project every 5s unless there is an active sync job
            switchMap(() =>
              this.getProject().pipe(
                expand(project =>
                  project.activeSyncJob == null && !this.syncJobActive
                    ? timer(5000).pipe(switchMap(() => this.getProject()))
                    : EMPTY
                )
              )
            )
          )
        ),
        withLatestFrom(this.paratextService.getParatextUsername())
      ),
      ([project, paratextUsername]) => {
        this.project = project;
        if (this.project.activeSyncJob != null) {
          this.listenAndProcessSync(this.project.activeSyncJob.id);
        }
        if (paratextUsername != null) {
          this.paratextUsername = paratextUsername;
        }
        this.isFirstLoad = false;
        this.noticeService.loadingFinished();
      }
    );
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    if (this.syncInProgressSub != null) {
      this.syncInProgressSub.unsubscribe();
    }
  }

  logInWithParatext(): void {
    const url = '/projects/' + this.projectId + '/sync';
    this.paratextService.linkParatext(url);
  }

  async syncProject(): Promise<void> {
    this.syncJobActive = true;
    const jobId = await this.syncJobService.start(this.projectId);
    this.listenAndProcessSync(jobId);
  }

  private getProject(): Observable<SFProject> {
    return this.projectService.onlineGet(this.projectId).pipe(
      map(r => r.data),
      filter(p => p != null)
    );
  }

  private listenAndProcessSync(jobId: string): void {
    if (this.activeSyncJobId === jobId) {
      return;
    }
    this.syncJobActive = true;
    this.activeSyncJobId = jobId;
    if (this.syncInProgressSub != null) {
      this.syncInProgressSub.unsubscribe();
    }
    this.syncInProgressSub = this.syncJobService.listen(jobId).subscribe(job => {
      this.percentComplete = job.percentCompleted;
      if (!job.isActive) {
        this.percentComplete = undefined;
        this.syncJobActive = false;
        this.activeSyncJobId = undefined;
        this.projectReload$.next();
        switch (job.state) {
          case SyncJobState.IDLE:
            this.noticeService.show('Successfully synchronized ' + this.project.projectName + ' with Paratext.');
            break;
          case SyncJobState.CANCELED:
            this.noticeService.show('Synchronization was canceled.');
            break;
          default:
            this.noticeService.show(
              'Something went wrong while synchronizing the ' +
                this.project.projectName +
                ' with Paratext. Please try again.'
            );
            break;
        }
      }
    });
  }
}
