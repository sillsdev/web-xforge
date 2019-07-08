import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { distanceInWordsToNow } from 'date-fns';
import { Subscription } from 'rxjs';
import { filter, map, switchMap, tap, withLatestFrom } from 'rxjs/operators';
import { NoticeService } from 'xforge-common/notice.service';
import { ParatextService } from 'xforge-common/paratext.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { SFProject } from '../core/models/sfproject';
import { SFProjectDataDoc } from '../core/models/sfproject-data-doc';
import { SFProjectService } from '../core/sfproject.service';

@Component({
  selector: 'app-sync',
  templateUrl: './sync.component.html',
  styleUrls: ['./sync.component.scss']
})
export class SyncComponent extends SubscriptionDisposable implements OnInit, OnDestroy {
  syncActive: boolean = false;

  private project: SFProject;
  private projectDataDoc: SFProjectDataDoc;
  private paratextUsername: string;
  private projectDataSub: Subscription;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly noticeService: NoticeService,
    private readonly paratextService: ParatextService,
    private readonly projectService: SFProjectService
  ) {
    super();
  }

  get isLoading(): boolean {
    return this.noticeService.isLoading;
  }

  get isLoggedIntoParatext(): boolean {
    return this.paratextUsername && this.paratextUsername.length > 0;
  }

  get percentComplete(): number {
    return this.projectDataDoc == null ? undefined : this.projectDataDoc.data.sync.percentCompleted;
  }

  get isProgressDeterminate(): boolean {
    return this.percentComplete != null;
  }

  get lastSyncNotice(): string {
    if (this.projectDataDoc == null) {
      return '';
    }
    const dateLastSynced = this.projectDataDoc.data.sync.dateLastSuccessfulSync;
    if (dateLastSynced == null || dateLastSynced === '' || Date.parse(dateLastSynced) <= 0) {
      return 'Never been synced';
    } else {
      return 'Last sync was ' + distanceInWordsToNow(dateLastSynced) + ' ago';
    }
  }

  get lastSyncDate() {
    if (this.projectDataDoc == null) {
      return '';
    }
    const date = new Date(this.projectDataDoc.data.sync.dateLastSuccessfulSync);
    return date.toLocaleString();
  }

  get projectName(): string {
    return this.project == null ? '' : this.project.projectName;
  }

  ngOnInit() {
    this.subscribe(
      this.route.params.pipe(
        tap(() => this.noticeService.loadingStarted()),
        map(params => params['projectId']),
        switchMap(projectId => this.projectService.onlineGet(projectId)),
        map(results => results.data),
        filter(project => project != null),
        withLatestFrom(this.paratextService.getParatextUsername())
      ),
      async ([project, paratextUsername]) => {
        this.project = project;
        if (paratextUsername != null) {
          this.paratextUsername = paratextUsername;
        }
        this.projectDataDoc = await this.projectService.getDataDoc(this.project.id);
        this.checkSyncStatus();
        if (this.projectDataSub != null) {
          this.projectDataSub.unsubscribe();
        }
        this.projectDataSub = this.projectDataDoc.remoteChanges().subscribe(() => this.checkSyncStatus());
        this.noticeService.loadingFinished();
      }
    );
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    if (this.projectDataSub != null) {
      this.projectDataSub.unsubscribe();
    }
    this.noticeService.loadingFinished();
  }

  logInWithParatext(): void {
    const url = '/projects/' + this.project.id + '/sync';
    this.paratextService.linkParatext(url);
  }

  syncProject(): Promise<void> {
    this.syncActive = true;
    return this.projectService.sync(this.project.id);
  }

  private checkSyncStatus(): void {
    if (this.projectDataDoc.data.sync.queuedCount > 0) {
      this.syncActive = true;
    } else if (this.syncActive) {
      this.syncActive = false;
      if (this.projectDataDoc.data.sync.lastSyncSuccessful) {
        this.noticeService.show(`Successfully synchronized ${this.projectName} with Paratext.`);
      } else {
        this.noticeService.show(
          `Something went wrong while synchronizing the ${this.projectName} with Paratext. Please try again.`
        );
      }
    }
  }
}
