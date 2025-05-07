import {
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild
} from '@angular/core';
import { FormGroupDirective, UntypedFormControl, UntypedFormGroup, Validators } from '@angular/forms';
import { translate } from '@ngneat/transloco';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { BehaviorSubject, combineLatest } from 'rxjs';
import { I18nService } from 'xforge-common/i18n.service';
import { DocSubscription } from 'xforge-common/models/realtime-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UserService } from 'xforge-common/user.service';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { XFValidators } from 'xforge-common/xfvalidators';
import { SF_DEFAULT_SHARE_ROLE, SF_DEFAULT_TRANSLATE_SHARE_ROLE } from '../../core/models/sf-project-role-info';
import { SFProjectService } from '../../core/sf-project.service';
import { ShareBaseComponent } from './share-base.component';
/** UI to share project access with new users, such as by sending an invitation email. */
@Component({
  selector: 'app-share-control',
  templateUrl: './share-control.component.html',
  styleUrls: ['./share-control.component.scss']
})
export class ShareControlComponent extends ShareBaseComponent {
  /** Fires when an invitation is sent. */
  @Output() invited = new EventEmitter<void>();
  @Input() defaultRole: SFProjectRole = SF_DEFAULT_SHARE_ROLE;
  @ViewChild('shareLinkField') shareLinkField?: ElementRef<HTMLInputElement>;

  email = new UntypedFormControl('', [XFValidators.email, Validators.required]);
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
  private projectId$: BehaviorSubject<string> = new BehaviorSubject<string>('');

  constructor(
    readonly i18n: I18nService,
    private readonly noticeService: NoticeService,
    private readonly projectService: SFProjectService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly changeDetector: ChangeDetectorRef,
    userService: UserService,
    private destroyRef: DestroyRef
  ) {
    super(userService);
    combineLatest([this.projectId$, this.onlineStatusService.onlineStatus$])
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(async ([projectId]) => {
        if (projectId === '') {
          return;
        }
        if (this.projectDoc == null || projectId !== this._projectId) {
          [this.projectDoc, this.isProjectAdmin] = await Promise.all([
            this.projectService.getProfile(projectId, new DocSubscription('ShareControlComponent', this.destroyRef)),
            this.projectService.isProjectAdmin(projectId, this.userService.currentUserId)
          ]);
          this.roleControl.setValue(this.defaultShareRole);
        }
        this.projectDoc.remoteChanges$
          .pipe(quietTakeUntilDestroyed(this.destroyRef, { logWarnings: false }))
          .subscribe(() => this.updateFormEnabledStateAndLinkSharingKey());
      });
    combineLatest([this.onlineStatusService.onlineStatus$, this.roleControl.valueChanges])
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.updateFormEnabledStateAndLinkSharingKey());
  }

  @Input() set projectId(id: string | undefined) {
    if (id == null) {
      return;
    }
    this._projectId = id;
    this.projectId$.next(id);
  }

  get shareRole(): SFProjectRole {
    return this.roleControl.value;
  }

  get isAppOnline(): boolean {
    return this.onlineStatusService.isOnline;
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

    return (
      this.projectDoc?.data != null &&
      SF_PROJECT_RIGHTS.hasRight(
        this.projectDoc.data,
        this.userService.currentUserId,
        SFProjectDomain.UserInvites,
        Operation.Create
      ) &&
      this.userShareableRoles.includes(this.shareRole)
    );
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

  async onEmailInput(): Promise<void> {
    if (this._projectId == null || this.email.invalid) {
      return;
    }
    this.isAlreadyInvited = await this.projectService.onlineIsAlreadyInvited(this._projectId, this.email.value);
  }

  async sendEmail(form: FormGroupDirective): Promise<void> {
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
    let message: string;
    if (response === this.alreadyProjectMemberResponse) {
      message = translate('share_control.not_inviting_already_member');
    } else {
      message = translate('share_control.invitation_sent', { email: this.sendInviteForm.value.email });
      this.invited.emit();
    }

    this.noticeService.show(message);

    const roleValue = this.shareRole;
    const localeValue = this.localeControl.value;

    form.resetForm();
    this.roleControl.setValue(roleValue);
    this.localeControl.setValue(localeValue);
  }

  private async updateFormEnabledStateAndLinkSharingKey(): Promise<void> {
    if (this.onlineStatusService.isOnline) {
      this.sendInviteForm.enable({ emitEvent: false });
    } else {
      this.sendInviteForm.disable({ emitEvent: false });
      // Workaround for angular/angular#17793 (ExpressionChangedAfterItHasBeenCheckedError after form disabled)
      this.changeDetector.detectChanges();
    }
  }
}
