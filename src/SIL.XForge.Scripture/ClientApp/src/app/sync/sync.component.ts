import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { distanceInWordsToNow } from 'date-fns';
import { combineLatest, Subscription } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { NoticeService } from 'xforge-common/notice.service';
import { ParatextService } from 'xforge-common/paratext.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { SFProjectDoc } from '../core/models/sfproject-doc';
import { SFProjectService } from '../core/sfproject.service';

@Component({
  selector: 'app-sync',
  templateUrl: './sync.component.html',
  styleUrls: ['./sync.component.scss']
})
export class SyncComponent extends SubscriptionDisposable implements OnInit, OnDestroy {
  syncActive: boolean = false;

  private projectDoc: SFProjectDoc;
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
    return this.projectDoc == null ? undefined : this.projectDoc.data.sync.percentCompleted;
  }

  get isProgressDeterminate(): boolean {
    return this.percentComplete != null;
  }

  get lastSyncNotice(): string {
    if (this.projectDoc == null) {
      return '';
    }
    const dateLastSynced = this.projectDoc.data.sync.dateLastSuccessfulSync;
    if (dateLastSynced == null || dateLastSynced === '' || Date.parse(dateLastSynced) <= 0) {
      return 'Never been synced';
    } else {
      return 'Last sync was ' + distanceInWordsToNow(dateLastSynced) + ' ago';
    }
  }

  get lastSyncDate() {
    if (this.projectDoc == null) {
      return '';
    }
    const date = new Date(this.projectDoc.data.sync.dateLastSuccessfulSync);
    return date.toLocaleString();
  }

  get projectName(): string {
    return this.projectDoc == null ? '' : this.projectDoc.data.projectName;
  }

  ngOnInit() {
    const projectId$ = this.route.params.pipe(
      tap(() => this.noticeService.loadingStarted()),
      map(params => params['projectId'] as string)
    );

    this.subscribe(
      combineLatest(projectId$, this.paratextService.getParatextUsername()),
      async ([projectId, paratextUsername]) => {
        this.projectDoc = await this.projectService.get(projectId);
        if (paratextUsername != null) {
          this.paratextUsername = paratextUsername;
        }
        this.checkSyncStatus();
        if (this.projectDataSub != null) {
          this.projectDataSub.unsubscribe();
        }
        this.projectDataSub = this.projectDoc.remoteChanges$.subscribe(() => this.checkSyncStatus());
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
    const url = '/projects/' + this.projectDoc.id + '/sync';
    this.paratextService.linkParatext(url);
  }

  syncProject(): Promise<void> {
    this.syncActive = true;
    return this.projectService.onlineSync(this.projectDoc.id);
  }

  private checkSyncStatus(): void {
    if (this.projectDoc.data.sync.queuedCount > 0) {
      this.syncActive = true;
    } else if (this.syncActive) {
      this.syncActive = false;
      if (this.projectDoc.data.sync.lastSyncSuccessful) {
        this.noticeService.show(`Successfully synchronized ${this.projectName} with Paratext.`);
      } else {
        this.noticeService.show(
          `Something went wrong while synchronizing the ${this.projectName} with Paratext. Please try again.`
        );
      }
    }
  }
}
