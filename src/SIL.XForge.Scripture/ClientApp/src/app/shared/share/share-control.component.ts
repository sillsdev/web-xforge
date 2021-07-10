import { MdcTextField } from '@angular-mdc/web/textfield';
import { ChangeDetectorRef, Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { translate } from '@ngneat/transloco';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { BehaviorSubject, combineLatest } from 'rxjs';
import { I18nService } from 'xforge-common/i18n.service';
import { LocationService } from 'xforge-common/location.service';
import { ProjectRoleInfo } from 'xforge-common/models/project-role-info';
import { NoticeService } from 'xforge-common/notice.service';
import { PwaService } from 'xforge-common/pwa.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UserService } from 'xforge-common/user.service';
import { XFValidators } from 'xforge-common/xfvalidators';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SF_DEFAULT_SHARE_ROLE, SF_PROJECT_ROLES } from '../../core/models/sf-project-role-info';
import { SFProjectService } from '../../core/sf-project.service';

/** UI to share project access with new users, such as by sending an invitation email. */
@Component({
  selector: 'app-share-control',
  templateUrl: './share-control.component.html',
  styleUrls: ['./share-control.component.scss']
})
export class ShareControlComponent extends SubscriptionDisposable {
  /** Fires when an invitation is sent. */
  @Output() invited = new EventEmitter<void>();
  @Input() isLinkSharingEnabled: boolean = false;
  @Input() defaultRole: SFProjectRole = SF_DEFAULT_SHARE_ROLE;
  @ViewChild('shareLinkField') shareLinkField?: MdcTextField;

  email = new FormControl('', [XFValidators.email]);
  localeControl = new FormControl('', [Validators.required]);
  roleControl = new FormControl('', [Validators.required]);
  sendInviteForm: FormGroup = new FormGroup({ email: this.email, role: this.roleControl, locale: this.localeControl });
  isSubmitted: boolean = false;
  isAlreadyInvited: boolean = false;
  isProjectAdmin: boolean = false;
  readonly alreadyProjectMemberResponse: string = 'alreadyProjectMember';

  private _projectId?: string;
  private linkSharingKey: string = '';
  private projectId$: BehaviorSubject<string> = new BehaviorSubject<string>('');
  private projectDoc?: SFProjectDoc;

  constructor(
    readonly i18n: I18nService,
    private readonly noticeService: NoticeService,
    private readonly projectService: SFProjectService,
    private readonly locationService: LocationService,
    private readonly pwaService: PwaService,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly userService: UserService
  ) {
    super();
    this.subscribe(combineLatest([this.projectId$, this.pwaService.onlineStatus]), async ([projectId]) => {
      if (projectId === '') {
        return;
      }
      if (this.projectDoc == null || projectId !== this._projectId) {
        [this.projectDoc, this.isProjectAdmin] = await Promise.all([
          this.projectService.get(projectId),
          this.projectService.isProjectAdmin(projectId, this.userService.currentUserId)
        ]);
        this.roleControl.setValue(this.defaultShareRole);
      }
    });

    this.subscribe(combineLatest([this.pwaService.onlineStatus, this.roleControl.valueChanges]), async ([isOnline]) => {
      if (isOnline) {
        if (this._projectId != null) {
          this.linkSharingKey = await this.projectService.onlineGetLinkSharingKey(this._projectId, this.shareRole);
        }
        this.sendInviteForm.enable({ emitEvent: false });
      } else {
        this.sendInviteForm.disable({ emitEvent: false });
        // Workaround for angular/angular#17793 (ExpressionChangedAfterItHasBeenCheckedError after form disabled)
        this.changeDetector.detectChanges();
      }
    });
  }

  @Input() set projectId(id: string | undefined) {
    if (id == null) {
      return;
    }
    this._projectId = id;
    this.projectId$.next(id);
  }

  get canSelectRole(): boolean {
    return this.isProjectAdmin;
  }

  get defaultShareRole(): string {
    const roles = this.roles;
    if (this.defaultRole != null && roles.filter(r => r.role === this.defaultRole).length > 0) {
      return this.defaultRole;
    }
    return roles.some(r => r.role === SF_DEFAULT_SHARE_ROLE) ? SF_DEFAULT_SHARE_ROLE : roles[0].role;
  }

  get roles(): ProjectRoleInfo[] {
    return SF_PROJECT_ROLES.filter(r => r.canBeShared).filter(
      r => this.projectDoc?.data?.checkingConfig.checkingEnabled || r.role !== SFProjectRole.CommunityChecker
    );
  }

  get shareLink(): string {
    if (this.linkSharingKey === '') {
      return '';
    }
    return (
      this.locationService.origin + '/projects/' + this._projectId + '?sharing=true&shareKey=' + this.linkSharingKey
    );
  }

  get shareRole(): SFProjectRole {
    return this.roleControl.value;
  }

  get isAppOnline(): boolean {
    return this.pwaService.isOnline;
  }

  get showLinkSharingUnavailable(): boolean {
    return this.isLinkSharingEnabled && !this.isAppOnline && !this.shareLink;
  }

  copyShareLink(): void {
    if (this.shareLinkField == null) {
      return;
    }
    this.shareLinkField.focus();
    this.shareLinkField._input.nativeElement.select();
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
}
