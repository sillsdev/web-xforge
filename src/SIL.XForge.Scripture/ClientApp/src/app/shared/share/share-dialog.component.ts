import { Component, Inject } from '@angular/core';
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
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UserService } from 'xforge-common/user.service';
import { environment } from '../../../environments/environment';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import {
  SF_DEFAULT_SHARE_ROLE,
  SF_DEFAULT_TRANSLATE_SHARE_ROLE,
  SF_PROJECT_ROLES
} from '../../core/models/sf-project-role-info';
import { SFProjectService } from '../../core/sf-project.service';

export interface ShareDialogData {
  projectId: string;
  defaultRole: SFProjectRole;
}

export enum ShareLinkType {
  Anyone = 'anyone',
  Recipient = 'recipient'
}

export enum ShareExpiration {
  Seven = '7',
  Fourteen = '14',
  Thirty = '30',
  Ninety = '90',
  ThreeSixtyFive = '365'
}

@Component({
  templateUrl: './share-dialog.component.html',
  styleUrls: ['./share-dialog.component.scss']
})
export class ShareDialogComponent extends SubscriptionDisposable {
  isProjectAdmin: boolean = false;
  shareLocaleCode: Locale;
  shareRole: SFProjectRole = this.data.defaultRole;
  shareLinkType: ShareLinkType = ShareLinkType.Anyone;
  shareExpiration: ShareExpiration = ShareExpiration.Fourteen;

  private readonly projectId?: string;
  private linkSharingKey: string | undefined;
  private linkSharingReady: boolean = false;
  private projectDoc?: SFProjectProfileDoc;

  constructor(
    readonly dialogRef: MatDialogRef<ShareDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public readonly data: ShareDialogData,
    readonly i18n: I18nService,
    @Inject(NAVIGATOR) private readonly navigator: Navigator,
    private readonly noticeService: NoticeService,
    private readonly projectService: SFProjectService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly userService: UserService
  ) {
    super();
    this.projectId = this.data.projectId;
    Promise.all([
      this.projectService.getProfile(this.projectId),
      this.projectService.isProjectAdmin(this.projectId, this.userService.currentUserId)
    ]).then(value => {
      this.projectDoc = value[0];
      this.isProjectAdmin = value[1];
      this.subscribe(this.projectDoc.remoteChanges$, () => {
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
      this.subscribe(this.onlineStatusService.onlineStatus$, () => this.updateSharingKey());
    });
    this.shareLocaleCode = this.i18n.locale;
  }

  get availableRoles(): SFProjectRole[] {
    return SF_PROJECT_ROLES.filter(info => info.canBeShared && this.userShareableRoles.includes(info.role)).map(
      r => r.role
    ) as SFProjectRole[];
  }

  get canUserChangeRole(): boolean {
    return this.availableRoles.length > 1;
  }

  get canUserChangeLinkUsage(): boolean {
    return this.isProjectAdmin;
  }

  get isLinkReady(): boolean {
    return this.linkSharingReady && this.sharableLink != null;
  }

  get isRecipientOnlyLink(): boolean {
    return this.shareLinkType === ShareLinkType.Recipient;
  }

  get projectName(): string {
    return this.projectDoc?.data?.name ?? '';
  }

  get sharableLink(): string | undefined {
    if (this.linkSharingKey == null) {
      return '';
    }
    return this.projectService.generateSharingUrl(this.linkSharingKey, this.shareLocaleCode.canonicalTag);
  }

  get shareLinkUsageOptions(): ShareLinkType[] {
    const options: ShareLinkType[] = [];
    if (this.isProjectAdmin) {
      options.push(ShareLinkType.Anyone);
      options.push(ShareLinkType.Recipient);
    } else if (
      (this.shareRole === SFProjectRole.CommunityChecker &&
        this.projectDoc?.data?.checkingConfig.checkingEnabled &&
        this.projectDoc?.data?.checkingConfig.shareEnabled) ||
      (this.shareRole !== SFProjectRole.CommunityChecker && this.projectDoc?.data?.translateConfig.shareEnabled)
    ) {
      options.push(ShareLinkType.Anyone);
    }
    return options;
  }

  get linkExpirationOptions(): ShareExpiration[] {
    if (this.isProjectAdmin) {
      return Object.values(ShareExpiration);
    } else {
      return [ShareExpiration.Fourteen];
    }
  }

  get showLinkSharingUnavailable(): boolean {
    return !this.onlineStatusService.isOnline;
  }

  get supportsShareAPI(): boolean {
    return this.navigator.share != null;
  }

  copyLink(): void {
    this.navigator.clipboard.writeText(this.sharableLink!).then(async () => {
      await this.noticeService.show(translate('share_control.link_copied'));
      await this.reserveShareLink();
    });
  }

  async shareLink(): Promise<void> {
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
        url: this.sharableLink,
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
  }

  setRole(role: SFProjectRole): void {
    this.shareRole = role;
    this.resetLinkUsageOptions();
  }

  setLinkType(linkType: ShareLinkType): void {
    this.shareLinkType = linkType;
    this.updateSharingKey();
  }

  setLinkExpiration(expiration: ShareExpiration): void {
    this.shareExpiration = expiration;
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
    await this.projectService.onlineReserveLinkSharingKey(this.linkSharingKey, Number.parseInt(this.shareExpiration));
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
      .onlineGetLinkSharingKey(
        this.projectId,
        this.shareRole,
        this.shareLinkType,
        Number.parseInt(this.shareExpiration)
      )
      .then((shareKey: string) => {
        this.linkSharingKey = shareKey;
        this.linkSharingReady = true;
      });
  }

  private get userShareableRoles(): string[] {
    const project = this.projectDoc?.data;
    if (project == null) {
      return [];
    }
    const userRole = project.userRoles[this.userService.currentUserId];
    return [
      {
        role: SFProjectRole.CommunityChecker,
        available: project.checkingConfig.checkingEnabled,
        permission:
          project.checkingConfig.shareEnabled &&
          SF_PROJECT_RIGHTS.hasRight(project, this.userService.currentUserId, SFProjectDomain.Questions, Operation.View)
      },
      {
        role: SFProjectRole.Viewer,
        available: true,
        permission:
          project.translateConfig.shareEnabled &&
          SF_PROJECT_RIGHTS.hasRight(project, this.userService.currentUserId, SFProjectDomain.Texts, Operation.View) &&
          userRole !== SFProjectRole.CommunityChecker
      },
      {
        role: SFProjectRole.Commenter,
        available: true,
        permission: this.isProjectAdmin
      }
    ]
      .filter(info => info.available && (this.isProjectAdmin || info.permission))
      .map(info => info.role as string);
  }
}
