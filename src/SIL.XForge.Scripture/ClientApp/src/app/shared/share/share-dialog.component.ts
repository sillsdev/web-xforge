import { Component, Inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { translate } from '@ngneat/transloco';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { NAVIGATOR } from 'xforge-common/browser-globals';
import { I18nService } from 'xforge-common/i18n.service';
import { Locale } from 'xforge-common/models/i18n-locale';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UserService } from 'xforge-common/user.service';
import { QuietDestroyRef } from 'xforge-common/utils';
import { environment } from '../../../environments/environment';
import { SF_DEFAULT_SHARE_ROLE, SF_DEFAULT_TRANSLATE_SHARE_ROLE } from '../../core/models/sf-project-role-info';
import { SFProjectService } from '../../core/sf-project.service';
import { ShareBaseComponent } from './share-base.component';

export interface ShareDialogData {
  projectId: string;
  defaultRole: SFProjectRole;
}

export enum ShareLinkType {
  Anyone = 'anyone',
  Recipient = 'recipient'
}

@Component({
  templateUrl: './share-dialog.component.html',
  styleUrls: ['./share-dialog.component.scss']
})
export class ShareDialogComponent extends ShareBaseComponent {
  // this is duplicated with the strings to ease their translation
  readonly ShareExpiration = {
    days_seven: 7,
    days_fourteen: 14,
    days_thirty: 30,
    days_ninety: 90,
    days_threesixtyfive: 365
  };

  isProjectAdmin: boolean = false;
  shareLocaleCode?: Locale = undefined;
  shareRole: SFProjectRole = this.data.defaultRole;
  shareLinkType: ShareLinkType = ShareLinkType.Anyone;
  shareExpiration: number = this.ShareExpiration.days_fourteen;

  private readonly projectId?: string;
  private linkSharingKey: string | undefined;
  private linkSharingReady: boolean = false;
  private _error: string | undefined;

  constructor(
    readonly dialogRef: MatDialogRef<ShareDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public readonly data: ShareDialogData,
    readonly i18n: I18nService,
    @Inject(NAVIGATOR) private readonly navigator: Navigator,
    private readonly noticeService: NoticeService,
    private readonly projectService: SFProjectService,
    private readonly onlineStatusService: OnlineStatusService,
    userService: UserService,
    private destroyRef: QuietDestroyRef
  ) {
    super(userService);
    this.projectId = this.data.projectId;
    Promise.all([
      this.projectService.getProfile(this.projectId),
      this.projectService.isProjectAdmin(this.projectId, this.userService.currentUserId)
    ]).then(value => {
      this.projectDoc = value[0];
      this.isProjectAdmin = value[1];
      this.projectDoc.remoteChanges$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
        if (this.shareLinkUsageOptions.length === 0) {
          this.dialogRef.close();
        } else if (!this.shareLinkUsageOptions.includes(this.shareLinkType)) {
          this.resetLinkUsageOptions();
        } else {
          this.updateSharingKey();
        }
      });
      this.shareRole = this.defaultShareRole;
      if (this.isProjectAdmin) {
        this.shareLinkType = this.shareLinkUsageOptions[0];
      }
      this.onlineStatusService.onlineStatus$
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.updateSharingKey());
    });
  }

  get canUserChangeRole(): boolean {
    return this.availableRoles.length > 1;
  }

  get canUserChangeLinkUsage(): boolean {
    return this.isProjectAdmin;
  }

  get isLinkReady(): boolean {
    return this.linkSharingReady && this.shareableLink != null;
  }

  get isRecipientOnlyLink(): boolean {
    return this.shareLinkType === ShareLinkType.Recipient;
  }

  get projectName(): string {
    return this.projectDoc?.data?.name ?? '';
  }

  get error(): string | undefined {
    return this._error;
  }

  get shareableLink(): string {
    if (this.linkSharingKey == null) {
      return '';
    }
    if (this.shareLocaleCode == null) {
      return '';
    }
    return this.projectService.generateSharingUrl(this.linkSharingKey, this.shareLocaleCode.canonicalTag);
  }

  get shareLinkUsageOptions(): ShareLinkType[] {
    const options: ShareLinkType[] = [];
    const canShare =
      this.projectDoc?.data != null &&
      SF_PROJECT_RIGHTS.hasRight(
        this.projectDoc.data,
        this.userService.currentUserId,
        SFProjectDomain.UserInvites,
        Operation.Create
      );
    if (this.isProjectAdmin) {
      options.push(ShareLinkType.Anyone);
      options.push(ShareLinkType.Recipient);
    } else if (
      canShare &&
      ((this.shareRole === SFProjectRole.CommunityChecker && this.projectDoc?.data?.checkingConfig.checkingEnabled) ||
        this.shareRole !== SFProjectRole.CommunityChecker)
    ) {
      options.push(ShareLinkType.Anyone);
    }
    return options;
  }

  get linkExpirationOptions(): string[] {
    if (this.isProjectAdmin) {
      return Object.keys(this.ShareExpiration);
    } else {
      return ['days_fourteen'];
    }
  }

  get showLinkSharingUnavailable(): boolean {
    return !this.onlineStatusService.isOnline;
  }

  get supportsShareAPI(): boolean {
    return this.navigator.share != null;
  }

  copyLink(): void {
    if (this.shareLocaleCode == null) {
      this._error = 'no_language';
      return;
    }
    this.navigator.clipboard.writeText(this.shareableLink).then(async () => {
      await this.noticeService.show(translate('share_control.link_copied'));
      await this.reserveShareLink();
    });
  }

  async shareLink(): Promise<void> {
    if (this.shareLocaleCode == null) {
      this._error = 'no_language';
      return;
    }
    const currentUser: UserDoc = await this.userService.getCurrentUser();
    if (!this.supportsShareAPI || this.projectDoc?.data == null || currentUser.data == null) {
      return;
    }
    const params = {
      inviteName: currentUser.data.displayName,
      projectName: this.projectDoc.data.name,
      siteName: environment.siteName
    };
    this.navigator
      .share({
        title: translate('share_control.share_title', params),
        url: this.shareableLink,
        text: translate(
          this.shareLinkType === ShareLinkType.Anyone
            ? 'share_control.share_text_anyone'
            : 'share_control.share_text_single',
          params
        )
      })
      .then(async () => {
        await this.reserveShareLink();
      })
      .catch((e: DOMException) => {
        // Can be safely ignored as the user decided not to share using the API - only occurs on mobile
        if (e.name !== 'AbortError') {
          throw e;
        }
      });
  }

  setLocale(locale: Locale): void {
    this.shareLocaleCode = locale;
    this._error = undefined;
  }

  setRole(role: SFProjectRole): void {
    this.shareRole = role;
    this.resetLinkUsageOptions();
  }

  setLinkType(linkType: ShareLinkType): void {
    this.shareLinkType = linkType;
    this.updateSharingKey();
  }

  setLinkExpiration(expirationKey: string): void {
    this.shareExpiration = this.ShareExpiration[expirationKey];
    this.updateSharingKey();
  }

  private get defaultShareRole(): SFProjectRole {
    const roles = this.userShareableRoles;
    if (this.data.defaultRole != null && roles.some(role => role === this.data.defaultRole)) {
      return this.data.defaultRole;
    }
    if (roles.some(role => role === SF_DEFAULT_SHARE_ROLE)) {
      return SF_DEFAULT_SHARE_ROLE;
    }
    return roles.some(role => role === SF_DEFAULT_TRANSLATE_SHARE_ROLE)
      ? SF_DEFAULT_TRANSLATE_SHARE_ROLE
      : (roles[0] as SFProjectRole);
  }

  private async reserveShareLink(): Promise<void> {
    if (this.shareLinkType !== ShareLinkType.Recipient || this.linkSharingKey == null) {
      return;
    }
    await this.projectService.onlineReserveLinkSharingKey(this.linkSharingKey, this.shareExpiration);
    this.updateSharingKey();
  }

  private resetLinkUsageOptions(): void {
    this.setLinkType(this.shareLinkUsageOptions[0]);
  }

  /**
   * Generates a new share key from the server based on the sharing requirements
   */
  private updateSharingKey(): void {
    this.linkSharingReady = false;
    if (!this.onlineStatusService.isOnline || this.projectId == null || this.shareRole == null) {
      return;
    }
    this.projectService
      .onlineGetLinkSharingKey(this.projectId, this.shareRole, this.shareLinkType, this.shareExpiration)
      .then((shareKey: string) => {
        this.linkSharingKey = shareKey;
        this.linkSharingReady = true;
      });
  }
}
