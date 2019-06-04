import { MDC_DIALOG_DATA, MdcTextField } from '@angular-mdc/web';
import { Component, Inject, ViewChild } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { LocationService } from '../location.service';
import { NoticeService } from '../notice.service';
import { ProjectService } from '../project.service';
import { XFValidators } from '../xfvalidators';

export interface ShareDialogData {
  projectId: string;
  isLinkSharingEnabled: boolean;
}

@Component({
  templateUrl: './share-dialog.component.html',
  styleUrls: ['./share-dialog.component.scss']
})
export class ShareDialogComponent {
  sendInviteForm: FormGroup = new FormGroup({
    email: new FormControl('', [XFValidators.email])
  });
  isSubmitted: boolean = false;

  @ViewChild('shareLinkField') shareLinkField: MdcTextField;

  constructor(
    private readonly noticeService: NoticeService,
    private readonly projectService: ProjectService,
    private readonly locationService: LocationService,
    @Inject(MDC_DIALOG_DATA) private readonly data: ShareDialogData
  ) {}

  get email(): FormControl {
    return this.sendInviteForm.get('email') as FormControl;
  }

  get shareLink(): string {
    return this.locationService.origin + '/projects/' + this.data.projectId + '?sharing=true';
  }

  get isLinkSharingEnabled(): boolean {
    return this.data.isLinkSharingEnabled;
  }

  copyShareLink(): void {
    this.shareLinkField.focus();
    document.execCommand('selectall');
    document.execCommand('copy');
    this.noticeService.show('Link copied to clipboard');
  }

  async onSubmit(): Promise<void> {
    if (this.email.value === '' || !this.sendInviteForm.valid) {
      return;
    }

    this.isSubmitted = true;
    await this.projectService.onlineInvite(this.data.projectId, this.sendInviteForm.value.email);
    this.isSubmitted = false;
    this.noticeService.show('An invitation email has been sent to ' + this.sendInviteForm.value.email);
    this.sendInviteForm.reset();
  }
}
