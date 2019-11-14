import { MdcTextField } from '@angular-mdc/web/textfield';
import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { translate } from '@ngneat/transloco';
import { LocationService } from 'xforge-common/location.service';
import { NoticeService } from 'xforge-common/notice.service';
import { XFValidators } from 'xforge-common/xfvalidators';
import { SFProjectService } from '../../core/sf-project.service';

/** UI to share project access with new users, such as by sending an invitation email. */
@Component({
  selector: 'app-share-control',
  templateUrl: './share-control.component.html',
  styleUrls: ['./share-control.component.scss']
})
export class ShareControlComponent {
  /** Fires when an invitation is sent. */
  @Output() invited = new EventEmitter<void>();
  @Input() readonly projectId?: string;
  @Input() readonly isLinkSharingEnabled: boolean = false;
  @ViewChild('shareLinkField', { static: false }) shareLinkField?: MdcTextField;

  sendInviteForm: FormGroup = new FormGroup({
    email: new FormControl('', [XFValidators.email])
  });
  isSubmitted: boolean = false;
  isAlreadyInvited: boolean = false;
  readonly alreadyProjectMemberResponse: string = 'alreadyProjectMember';

  constructor(
    private readonly noticeService: NoticeService,
    private readonly projectService: SFProjectService,
    private readonly locationService: LocationService
  ) {}

  get email(): FormControl {
    return this.sendInviteForm.controls.email as FormControl;
  }

  get shareLink(): string {
    return this.locationService.origin + '/projects/' + this.projectId + '?sharing=true';
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

  async onEmailInput(newValue: string): Promise<void> {
    if (this.projectId == null || this.email.invalid) {
      return;
    }
    this.isAlreadyInvited = await this.projectService.onlineIsAlreadyInvited(this.projectId, newValue);
  }

  async sendEmail(): Promise<void> {
    if (this.projectId == null || this.email.value === '' || this.email.value == null || !this.sendInviteForm.valid) {
      return;
    }

    this.isSubmitted = true;
    const response = await this.projectService.onlineInvite(this.projectId, this.sendInviteForm.value.email);
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
    this.sendInviteForm.reset();
  }
}
