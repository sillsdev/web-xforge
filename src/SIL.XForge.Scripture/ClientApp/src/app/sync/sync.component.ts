import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { translate } from '@ngneat/transloco';
import { OtJson0Op } from 'ot-json0';
import { merge, Observable, Subscription } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { PwaService } from 'xforge-common/pwa.service';
import { environment } from '../../environments/environment';
import { SFProjectDoc } from '../core/models/sf-project-doc';
import { ParatextService } from '../core/paratext.service';
import { SFProjectService } from '../core/sf-project.service';

@Component({
  selector: 'app-sync',
  templateUrl: './sync.component.html',
  styleUrls: ['./sync.component.scss']
})
export class SyncComponent extends DataLoadingComponent implements OnInit, OnDestroy {
  syncActive: boolean = false;
  isAppOnline: boolean = false;
  showParatextLogin = false;
  syncDisabled: boolean = false;

  private projectDoc?: SFProjectDoc;
  private sourceProjectDoc?: SFProjectDoc;
  private paratextUsername?: string;
  private projectDataSub?: Subscription;

  constructor(
    private readonly route: ActivatedRoute,
    noticeService: NoticeService,
    private readonly paratextService: ParatextService,
    private readonly projectService: SFProjectService,
    readonly i18n: I18nService,
    private readonly pwaService: PwaService
  ) {
    super(noticeService);
  }

  get isLoggedIntoParatext(): boolean {
    return this.paratextUsername != null && this.paratextUsername.length > 0;
  }

  /** The progress as a decimal between 0 and 1 for the target project and the source project, if one exists. */
  get percentComplete(): number | undefined {
    if (this.projectDoc?.data == null) {
      return;
    }
    if (this.sourceProjectDoc?.data == null) {
      return this.projectDoc.data.sync.percentCompleted;
    }
    let percent: number = 0;
    if (this.sourceProjectDoc.data.sync.queuedCount > 0) {
      percent += (this.sourceProjectDoc.data.sync.percentCompleted || 0) * 0.5;
    } else {
      // The source project has synchronized so this is the midway point
      percent = 0.5;
    }
    percent += (this.projectDoc.data.sync.percentCompleted || 0) * 0.5;
    return percent;
  }

  get isProgressDeterminate(): boolean {
    return this.percentComplete != null && this.percentComplete > 0;
  }
  // Todo: This may not be return the correct data on reconnect
  get lastSyncNotice(): string {
    if (this.projectDoc == null || this.projectDoc.data == null) {
      return '';
    }
    const dateLastSynced = this.projectDoc.data.sync.dateLastSuccessfulSync;
    if (dateLastSynced == null || dateLastSynced === '' || Date.parse(dateLastSynced) <= 0) {
      return translate('sync.never_been_synced');
    } else {
      return translate('sync.last_synced_time_stamp', { timeStamp: this.i18n.formatDate(new Date(dateLastSynced)) });
    }
  }

  get lastSyncDate() {
    if (
      this.projectDoc == null ||
      this.projectDoc.data == null ||
      this.projectDoc.data.sync.dateLastSuccessfulSync == null
    ) {
      return '';
    }
    const date = new Date(this.projectDoc.data.sync.dateLastSuccessfulSync);
    return date.toLocaleString();
  }

  get projectName(): string {
    return this.projectDoc == null || this.projectDoc.data == null ? '' : this.projectDoc.data.name;
  }

  get syncDisabledMessage(): string {
    return this.i18n.translateAndInsertTags('sync.sync_is_disabled', {
      email: `<a target="_blank" href="mailto:${environment.issueEmail}">${environment.issueEmail}</a>`
    });
  }

  ngOnInit() {
    this.subscribe(this.pwaService.onlineStatus, async isOnline => {
      this.isAppOnline = isOnline;
      if (this.isAppOnline && this.paratextUsername == null) {
        const username = await this.paratextService.getParatextUsername().toPromise();
        if (username != null) {
          this.paratextUsername = username;
        }
        // Explicit to prevent flashing the login button during page load
        this.showParatextLogin = !this.isLoggedIntoParatext;
      }
    });

    const projectId$ = this.route.params.pipe(
      tap(() => {
        if (this.isAppOnline) {
          this.loadingStarted();
        }
      }),
      map(params => params['projectId'] as string)
    );

    this.subscribe(projectId$, async projectId => {
      this.projectDoc = await this.projectService.get(projectId);
      if (this.projectDoc?.data?.translateConfig.translationSuggestionsEnabled != null) {
        const sourceProjectId = this.projectDoc.data.translateConfig.source?.projectRef;
        this.sourceProjectDoc = sourceProjectId == null ? undefined : await this.projectService.get(sourceProjectId);
      }
      this.checkSyncStatus();
      if (this.projectDataSub != null) {
        this.projectDataSub.unsubscribe();
      }
      const checkSyncStatus$: Observable<OtJson0Op[]> =
        this.sourceProjectDoc == null
          ? this.projectDoc.remoteChanges$
          : merge(this.projectDoc.remoteChanges$, this.sourceProjectDoc.remoteChanges$);
      this.projectDataSub = checkSyncStatus$.subscribe(() => this.checkSyncStatus());
      this.loadingFinished();
    });
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    if (this.projectDataSub != null) {
      this.projectDataSub.unsubscribe();
    }
  }

  logInWithParatext(): void {
    if (this.projectDoc == null) {
      return;
    }
    const url = '/projects/' + this.projectDoc.id + '/sync';
    this.paratextService.linkParatext(url);
  }

  syncProject(): void {
    if (this.projectDoc == null) {
      return;
    }
    this.syncActive = true;
    this.projectService.onlineSync(this.projectDoc.id);
  }

  private checkSyncStatus(): void {
    if (this.projectDoc == null || this.projectDoc.data == null) {
      return;
    }

    if (this.projectDoc.data.syncDisabled != null) {
      this.syncDisabled = this.projectDoc.data.syncDisabled;
    }

    if (this.projectDoc.data.sync.queuedCount > 0) {
      this.syncActive = true;
    } else if (this.syncActive) {
      this.syncActive = false;
      if (this.projectDoc.data.sync.lastSyncSuccessful) {
        this.noticeService.show(
          translate('sync.successfully_synchronized_with_paratext', { projectName: this.projectName })
        );
      } else {
        this.noticeService.showMessageDialog(() =>
          translate('sync.something_went_wrong_synchronizing_this_project', { projectName: this.projectName })
        );
      }
    }
  }
}
