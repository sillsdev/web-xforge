import { Component, Inject, ViewEncapsulation } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { I18nService } from 'xforge-common/i18n.service';
import { Locale } from 'xforge-common/models/i18n-locale';
import { UserService } from 'xforge-common/user.service';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { PwaService } from 'xforge-common/pwa.service';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { LocationService } from 'xforge-common/location.service';
import { NoticeService } from 'xforge-common/notice.service';
import { translate } from '@ngneat/transloco';
import { NAVIGATOR } from 'xforge-common/browser-globals';
import { SFProjectService } from '../../core/sf-project.service';
import {
  SF_DEFAULT_SHARE_ROLE,
  SF_DEFAULT_TRANSLATE_SHARE_ROLE,
  SF_PROJECT_ROLES
} from '../../core/models/sf-project-role-info';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { environment } from '../../../environments/environment';

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
  styleUrls: ['./share-dialog.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class ShareDialogComponent extends SubscriptionDisposable {
  isProjectAdmin: boolean = false;
  shareLocaleCode: Locale;
  shareRole?: SFProjectRole;
  shareLinkType: ShareLinkType = ShareLinkType.Anyone;

  private readonly projectId?: string;
  private linkSharingKey: string = '';
  private linkSharingReady: boolean = false;
  private projectDoc?: SFProjectProfileDoc;

  constructor(
    readonly dialogRef: MatDialogRef<ShareDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public readonly data: ShareDialogData,
    private readonly featureFlags: FeatureFlagService,
    readonly i18n: I18nService,
    private readonly locationService: LocationService,
    @Inject(NAVIGATOR) private readonly navigator: Navigator,
    private readonly noticeService: NoticeService,
    private readonly projectService: SFProjectService,
    private readonly pwaService: PwaService,
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
          this.updateFormEnabledStateAndLinkSharingKey();
        }
      });
      this.shareRole = this.defaultShareRole;
      if (this.isProjectAdmin) {
        this.shareLinkType = ShareLinkType.Recipient;
      }
      this.updateFormEnabledStateAndLinkSharingKey();
    });
    this.subscribe(this.pwaService.onlineStatus$, () => this.updateFormEnabledStateAndLinkSharingKey());
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
    return this.linkSharingReady && this.sharableLink !== '';
  }

  get projectName(): string {
    return this.projectDoc?.data?.name ?? '';
  }

  get sharableLink(): string {
    return this.projectService.generateSharingUrl(this.linkSharingKey, this.shareLocaleCode.canonicalTag);
  }

  get shareLinkUsageOptions(): ShareLinkType[] {
    const options = [];
    if (this.isProjectAdmin) {
      options.push(ShareLinkType.Recipient);
    }
    if (
      (this.shareRole === SFProjectRole.CommunityChecker &&
        this.projectDoc?.data?.checkingConfig.checkingEnabled &&
        this.projectDoc?.data?.checkingConfig.shareEnabled) ||
      (this.shareRole !== SFProjectRole.CommunityChecker && this.projectDoc?.data?.translateConfig.shareEnabled)
    ) {
      options.push(ShareLinkType.Anyone);
    }
    return options;
  }

  get showLinkSharingUnavailable(): boolean {
    return !this.pwaService.isOnline;
  }

  get supportsShareAPI(): boolean {
    return this.navigator.share != null;
  }

  copyLink(): void {
    this.navigator.clipboard.writeText(this.sharableLink).then(() => {
      this.noticeService.show(translate('share_control.link_copied'));
    });
  }

  async shareLink(): Promise<void> {
    const currentUser = await this.userService.getCurrentUser();
    if (!this.supportsShareAPI || this.projectDoc?.data == null || currentUser.data == null) {
      return;
    }
    const params = {
      inviteName: currentUser.data.displayName,
      projectName: this.projectDoc.data.name,
      siteName: environment.siteName
    };
    this.navigator.share({
      title: translate('share_control.share_title', params),
      url: this.sharableLink,
      text: this.i18n.translateAndInsertTags(
        this.shareLinkType === ShareLinkType.Anyone
          ? 'share_control.share_text_anyone'
          : 'share_control.share_text_single',
        params
      )
    });
  }

  setLocale(locale: Locale) {
    this.shareLocaleCode = locale;
  }

  setRole(role: SFProjectRole) {
    this.shareRole = role;
    this.resetLinkUsageOptions();
  }

  setLinkType(linkType: ShareLinkType) {
    this.shareLinkType = linkType;
    this.updateFormEnabledStateAndLinkSharingKey();
  }

  private get defaultShareRole(): SFProjectRole | undefined {
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

  private resetLinkUsageOptions(): void {
    this.setLinkType(this.shareLinkUsageOptions[0]);
  }

  private updateFormEnabledStateAndLinkSharingKey() {
    this.linkSharingReady = false;
    if (!this.pwaService.isOnline || this.projectId == null || this.shareRole == null) {
      return;
    }
    this.projectService
      .onlineGetLinkSharingKey(this.projectId, this.shareRole, this.shareLinkType)
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
        role: SFProjectRole.Observer,
        available: true,
        permission:
          project.translateConfig.shareEnabled &&
          SF_PROJECT_RIGHTS.hasRight(project, this.userService.currentUserId, SFProjectDomain.Texts, Operation.View) &&
          userRole !== SFProjectRole.CommunityChecker
      },
      {
        role: SFProjectRole.Reviewer,
        available: this.featureFlags.allowAddingNotes.enabled,
        permission: this.isProjectAdmin
      }
    ]
      .filter(info => info.available && (this.isProjectAdmin || info.permission))
      .map(info => info.role as string);
  }
}
