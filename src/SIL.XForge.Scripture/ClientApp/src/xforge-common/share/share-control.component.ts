import { MdcTextField } from '@angular-mdc/web';
import { Component, Input, ViewChild } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { LocationService } from '../location.service';
import { NoticeService } from '../notice.service';
import { ProjectService } from '../project.service';
import { XFValidators } from '../xfvalidators';

@Component({
  selector: 'app-share-control',
  templateUrl: './share-control.component.html',
  styleUrls: ['./share-control.component.scss']
})
export class ShareControlComponent {
  @Input() readonly projectId: string;
  @Input() readonly isLinkSharingEnabled: boolean;
  @ViewChild('shareLinkField') shareLinkField: MdcTextField;

  sendInviteForm: FormGroup = new FormGroup({
    email: new FormControl('', [XFValidators.email])
  });
  isSubmitted: boolean = false;

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

  async sendEmail(): Promise<void> {
    if (this.email.value === '' || !this.sendInviteForm.valid) {
      return;
    }

    this.isSubmitted = true;
    await this.projectService.onlineInvite(this.projectId, this.sendInviteForm.value.email);
    this.isSubmitted = false;
    this.noticeService.show('An invitation email has been sent to ' + this.sendInviteForm.value.email);
    this.sendInviteForm.reset();
  }
}
