import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { translate } from '@ngneat/transloco';
import { firstValueFrom } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { AuthService } from 'xforge-common/auth.service';
import { CommandErrorCode } from 'xforge-common/command.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { environment } from '../../environments/environment';
import { SFProjectDoc } from '../core/models/sf-project-doc';
import { ParatextService } from '../core/paratext.service';
import { SFProjectService } from '../core/sf-project.service';

enum SyncErrorCodes {
  UserPermission = -1
}

@Component({
  selector: 'app-sync',
  templateUrl: './sync.component.html',
  styleUrls: ['./sync.component.scss']
})
export class SyncComponent extends DataLoadingComponent implements OnInit {
  isAppOnline: boolean = false;
  showParatextLogin = false;
  syncDisabled: boolean = false;
  projectDoc?: SFProjectDoc;

  private _syncActive: boolean = false;
  private isSyncCancelled = false;
  private paratextUsername?: string;
  private previousLastSyncDate?: Date;

  constructor(
    private readonly route: ActivatedRoute,
    noticeService: NoticeService,
    private readonly paratextService: ParatextService,
    private readonly projectService: SFProjectService,
    readonly i18n: I18nService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly dialogService: DialogService,
    private readonly authService: AuthService
  ) {
    super(noticeService);
  }

  get isLoggedIntoParatext(): boolean {
    return this.paratextUsername != null && this.paratextUsername.length > 0;
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

  get lastSyncDate(): Date | undefined {
    if (this.projectDoc?.data?.sync.dateLastSuccessfulSync == null) {
      return undefined;
    }
    return new Date(this.projectDoc.data.sync.dateLastSuccessfulSync);
  }

  get lastSyncDisplayDate(): string {
    return this.lastSyncDate?.toLocaleString() || '';
  }

  get lastSyncErrorCode(): number | undefined {
    return this.projectDoc?.data?.sync.lastSyncErrorCode;
  }

  get projectName(): string {
    return this.projectDoc?.data == null ? '' : this.projectDoc.data.name;
  }

  get syncActive(): boolean {
    return this._syncActive;
  }

  set syncActive(isActive: boolean) {
    if (this._syncActive && !isActive && this.projectDoc?.data != null) {
      const projectName: string = this.projectDoc.data.name;
      if (
        !(
          this.isSyncCancelled &&
          (this.previousLastSyncDate == null ||
            (this.lastSyncDate != null && this.lastSyncDate <= this.previousLastSyncDate))
        )
      ) {
        if (this.projectDoc.data.sync.lastSyncSuccessful) {
          this.noticeService.show(translate('sync.successfully_synchronized_with_paratext', { projectName }));
          this.previousLastSyncDate = this.lastSyncDate;
        } else if (this.showSyncUserPermissionsFailureMessage) {
          this.dialogService.message(this.i18n.translate('sync.user_permissions_failure_dialog_message'));
        } else {
          this.dialogService.message(
            this.i18n.translate('sync.something_went_wrong_synchronizing_this_project', { projectName })
          );
        }
      }
    }
    this.isSyncCancelled = false;
    this._syncActive = isActive;
  }

  get syncDisabledMessage(): string {
    return this.i18n.translateAndInsertTags('sync.sync_is_disabled', {
      email: `<a target="_blank" href="mailto:${environment.issueEmail}">${environment.issueEmail}</a>`
    });
  }

  get showSyncUserPermissionsFailureMessage(): boolean {
    return this.lastSyncErrorCode === SyncErrorCodes.UserPermission;
  }

  get showSyncFailureSupportMessage(): boolean {
    return this.projectDoc?.data?.sync.lastSyncSuccessful === false;
  }

  get syncFailureSupportMessage(): string {
    return this.i18n.translateAndInsertTags('sync.sync_failure_support_message', {
      email: `<a target="_blank" href="mailto:${environment.issueEmail}">${environment.issueEmail}</a>`
    });
  }

  ngOnInit(): void {
    this.subscribe(this.onlineStatusService.onlineStatus$, async isOnline => {
      this.isAppOnline = isOnline;
      if (this.isAppOnline && this.paratextUsername == null) {
        const username = await firstValueFrom(this.paratextService.getParatextUsername());
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
      this.checkSyncStatus();
      this.loadingFinished();

      // Check to see if a sync has started when the project document changes
      this.subscribe(this.projectDoc.remoteChanges$, () => {
        if (!this.syncActive) {
          this.checkSyncStatus();
        }
      });
    });
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
    this._syncActive = true;
    this.projectService.onlineSync(this.projectDoc.id).catch((error: any) => {
      this.checkSyncStatus();
      if ('code' in error && error.code === CommandErrorCode.Forbidden) {
        this.authService.requestParatextCredentialUpdate();
      } else {
        throw error;
      }
    });
  }

  cancelSync(): void {
    if (this.projectDoc == null) {
      return;
    }
    this.projectService.onlineCancelSync(this.projectDoc.id);
    this.isSyncCancelled = true;
  }

  private checkSyncStatus(): void {
    if (this.projectDoc?.data == null) {
      return;
    }
    if (this.projectDoc.data.syncDisabled != null) {
      this.syncDisabled = this.projectDoc.data.syncDisabled;
    }
    this._syncActive = this.projectDoc.data.sync.queuedCount > 0;
    if (this.projectDoc.data.sync.lastSyncSuccessful) {
      this.previousLastSyncDate = this.lastSyncDate;
    }
  }
}
