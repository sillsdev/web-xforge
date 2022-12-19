import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { UntypedFormControl, UntypedFormGroup, Validators } from '@angular/forms';
import { translate } from '@ngneat/transloco';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { BehaviorSubject, combineLatest } from 'rxjs';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { I18nService } from 'xforge-common/i18n.service';
import { LocationService } from 'xforge-common/location.service';
import { ProjectRoleInfo } from 'xforge-common/models/project-role-info';
import { NoticeService } from 'xforge-common/notice.service';
import { PwaService } from 'xforge-common/pwa.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UserService } from 'xforge-common/user.service';
import { XFValidators } from 'xforge-common/xfvalidators';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import {
  SF_DEFAULT_SHARE_ROLE,
  SF_DEFAULT_TRANSLATE_SHARE_ROLE,
  SF_PROJECT_ROLES
} from '../../core/models/sf-project-role-info';
import { SFProjectService } from '../../core/sf-project.service';
import { ShareLinkType } from './share-dialog.component';

/** UI to share project access with new users, such as by sending an invitation email. */
@Component({
  selector: 'app-share-control',
  templateUrl: './share-control.component.html',
  styleUrls: ['./share-control.component.scss']
})
export class ShareControlComponent extends SubscriptionDisposable {
  /** Fires when an invitation is sent. */
  @Output() invited = new EventEmitter<void>();
  @Input() defaultRole: SFProjectRole = SF_DEFAULT_SHARE_ROLE;
  @ViewChild('shareLinkField') shareLinkField?: ElementRef<HTMLInputElement>;

  email = new UntypedFormControl('', [XFValidators.email]);
  localeControl = new UntypedFormControl('', [Validators.required]);
  roleControl = new UntypedFormControl('', [Validators.required]);
  sendInviteForm: UntypedFormGroup = new UntypedFormGroup({
    email: this.email,
    role: this.roleControl,
    locale: this.localeControl
  });
  isSubmitted: boolean = false;
  isAlreadyInvited: boolean = false;
  isProjectAdmin: boolean = false;
  readonly alreadyProjectMemberResponse: string = 'alreadyProjectMember';

  private _projectId?: string;
  private linkSharingKey: string = '';
  private projectId$: BehaviorSubject<string> = new BehaviorSubject<string>('');
  private projectDoc?: SFProjectProfileDoc;

  constructor(
    readonly i18n: I18nService,
    private readonly noticeService: NoticeService,
    private readonly projectService: SFProjectService,
    private readonly locationService: LocationService,
    private readonly pwaService: PwaService,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly userService: UserService,
    private readonly featureFlags: FeatureFlagService
  ) {
    super();
    this.subscribe(combineLatest([this.projectId$, this.pwaService.onlineStatus$]), async ([projectId]) => {
      if (projectId === '') {
        return;
      }
      if (this.projectDoc == null || projectId !== this._projectId) {
        [this.projectDoc, this.isProjectAdmin] = await Promise.all([
          this.projectService.getProfile(projectId),
          this.projectService.isProjectAdmin(projectId, this.userService.currentUserId)
        ]);
        this.roleControl.setValue(this.defaultShareRole);
      }
      this.subscribe(this.projectDoc.remoteChanges$, () => this.updateFormEnabledStateAndLinkSharingKey());
    });
    this.subscribe(combineLatest([this.pwaService.onlineStatus$, this.roleControl.valueChanges]), () =>
      this.updateFormEnabledStateAndLinkSharingKey()
    );
  }

  @Input() set projectId(id: string | undefined) {
    if (id == null) {
      return;
    }
    this._projectId = id;
    this.projectId$.next(id);
  }

  get availableRolesInfo(): ProjectRoleInfo[] {
    return SF_PROJECT_ROLES.filter(info => info.canBeShared && this.userShareableRoles.includes(info.role));
  }

  get shareLink(): string {
    return this.projectService.generateSharingUrl(this.linkSharingKey);
  }

  get shareRole(): SFProjectRole {
    return this.roleControl.value;
  }

  get isAppOnline(): boolean {
    return this.pwaService.isOnline;
  }

  get isLinkSharingEnabled(): boolean {
    const project = this.projectDoc?.data;
    if (project == null) {
      return false;
    }

    // Admin users can always share
    if (this.isProjectAdmin) {
      return true;
    }

    const linkSharingSettings = {
      [SFProjectRole.CommunityChecker]: project.checkingConfig.shareEnabled,
      [SFProjectRole.Observer]: project.translateConfig.shareEnabled,
      [SFProjectRole.Reviewer]: project.translateConfig.shareEnabled
    };
    return linkSharingSettings[this.shareRole] && this.userShareableRoles.includes(this.shareRole);
  }

  get showLinkSharingUnavailable(): boolean {
    return this.isLinkSharingEnabled && !this.isAppOnline && !this.shareLink;
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
      .filter(info => info.available && (info.permission || this.isProjectAdmin))
      .map(info => info.role as string);
  }

  private get defaultShareRole(): string | undefined {
    const roles = this.userShareableRoles;
    if (this.defaultRole != null && roles.some(role => role === this.defaultRole)) {
      return this.defaultRole;
    }
    if (roles.some(role => role === SF_DEFAULT_SHARE_ROLE)) {
      return SF_DEFAULT_SHARE_ROLE;
    }
    return roles.some(role => role === SF_DEFAULT_TRANSLATE_SHARE_ROLE) ? SF_DEFAULT_TRANSLATE_SHARE_ROLE : roles[0];
  }

  copyShareLink(): void {
    if (this.shareLinkField == null) {
      return;
    }
    this.shareLinkField.nativeElement.select();
    document.execCommand('copy');
    this.noticeService.show(translate('share_control.link_copied'));
  }

  async onEmailInput(): Promise<void> {
    if (this._projectId == null || this.email.invalid) {
      return;
    }
    this.isAlreadyInvited = await this.projectService.onlineIsAlreadyInvited(this._projectId, this.email.value);
  }

  async sendEmail(): Promise<void> {
    if (this._projectId == null || this.email.value === '' || this.email.value == null || !this.sendInviteForm.valid) {
      return;
    }

    this.isSubmitted = true;
    const response = await this.projectService.onlineInvite(
      this._projectId,
      this.email.value,
      this.localeControl.value,
      this.shareRole
    );
    this.isSubmitted = false;
    this.isAlreadyInvited = false;
    let message = '';
    if (response === this.alreadyProjectMemberResponse) {
      message = translate('share_control.not_inviting_already_member');
    } else {
      message = translate('share_control.invitation_sent', { email: this.sendInviteForm.value.email });
      this.invited.emit();
    }

    this.noticeService.show(message);
    this.email.reset();
  }

  private async updateFormEnabledStateAndLinkSharingKey() {
    if (this.pwaService.isOnline) {
      if (this._projectId != null && this.shareRole != null) {
        this.linkSharingKey = await this.projectService.onlineGetLinkSharingKey(
          this._projectId,
          this.shareRole,
          ShareLinkType.Recipient
        );
      }
      this.sendInviteForm.enable({ emitEvent: false });
    } else {
      this.sendInviteForm.disable({ emitEvent: false });
      // Workaround for angular/angular#17793 (ExpressionChangedAfterItHasBeenCheckedError after form disabled)
      this.changeDetector.detectChanges();
    }
  }
}
