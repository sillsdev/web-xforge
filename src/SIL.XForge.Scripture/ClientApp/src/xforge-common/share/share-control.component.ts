import { MdcTextField } from '@angular-mdc/web';
import { Component, Input, ViewChild } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { LocationService } from '../location.service';
import { NoticeService } from '../notice.service';
import { ProjectService } from '../project.service';
import { XFValidators } from '../xfvalidators';

/** UI to share project access with new users, such as by sending an invitation email. */
@Component({
  selector: 'app-share-control',
  templateUrl: './share-control.component.html',
  styleUrls: ['./share-control.component.scss']
})
export class ShareControlComponent {
  @Input() readonly projectId: string;
  @Input() readonly isLinkSharingEnabled: boolean;
  @ViewChild('shareLinkField', { static: false }) shareLinkField: MdcTextField;

  sendInviteForm: FormGroup = new FormGroup({
    email: new FormControl('', [XFValidators.email])
  });
  isSubmitted: boolean = false;
  isAlreadyInvited: boolean;
  readonly alreadyProjectMemberResponse: string = 'alreadyProjectMember';

  constructor(
    private readonly noticeService: NoticeService,
    private readonly projectService: ProjectService,
    private readonly locationService: LocationService
  ) {}

  get email(): FormControl {
    return this.sendInviteForm.get('email') as FormControl;
  }

  get shareLink(): string {
    return this.locationService.origin + '/projects/' + this.projectId + '?sharing=true';
  }

  copyShareLink(): void {
    this.shareLinkField.focus();
    this.shareLinkField._input.nativeElement.select();
    document.execCommand('copy');
    this.noticeService.show('Link copied to clipboard');
  }

  async onEmailInput(newValue: string): Promise<void> {
    if (this.sendInviteForm.get('email').invalid) {
      return;
    }
    this.isAlreadyInvited = await this.projectService.onlineIsAlreadyInvited(this.projectId, newValue);
  }

  async sendEmail(): Promise<void> {
    if (this.email.value === '' || this.email.value == null || !this.sendInviteForm.valid) {
      return;
    }

    this.isSubmitted = true;
    const response = await this.projectService.onlineInvite(this.projectId, this.sendInviteForm.value.email);
    this.isSubmitted = false;
    this.isAlreadyInvited = false;
    let message = '';
    if (response === this.alreadyProjectMemberResponse) {
      message = 'Not inviting: User is already a member of this project';
    } else {
      message = 'An invitation email has been sent to ' + this.sendInviteForm.value.email;
    }

    this.noticeService.show(message);
    this.sendInviteForm.reset();
  }
}
