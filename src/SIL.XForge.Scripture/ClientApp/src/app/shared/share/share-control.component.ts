import { MdcTextField } from '@angular-mdc/web/textfield';
import { AfterViewInit, ChangeDetectorRef, Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { translate } from '@ngneat/transloco';
import { I18nService } from 'xforge-common/i18n.service';
import { LocationService } from 'xforge-common/location.service';
import { NoticeService } from 'xforge-common/notice.service';
import { PwaService } from 'xforge-common/pwa.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { XFValidators } from 'xforge-common/xfvalidators';
import { SFProjectService } from '../../core/sf-project.service';

/** UI to share project access with new users, such as by sending an invitation email. */
@Component({
  selector: 'app-share-control',
  templateUrl: './share-control.component.html',
  styleUrls: ['./share-control.component.scss']
})
export class ShareControlComponent extends SubscriptionDisposable implements AfterViewInit {
  /** Fires when an invitation is sent. */
  @Output() invited = new EventEmitter<void>();
  @Input() readonly projectId?: string;
  @Input() readonly isLinkSharingEnabled: boolean = false;
  @ViewChild('shareLinkField') shareLinkField?: MdcTextField;

  email = new FormControl('', [XFValidators.email]);
  localeControl = new FormControl('', [Validators.required]);
  sendInviteForm: FormGroup = new FormGroup({ email: this.email, locale: this.localeControl });
  isSubmitted: boolean = false;
  isAlreadyInvited: boolean = false;
  readonly alreadyProjectMemberResponse: string = 'alreadyProjectMember';

  constructor(
    readonly i18n: I18nService,
    private readonly noticeService: NoticeService,
    private readonly projectService: SFProjectService,
    private readonly locationService: LocationService,
    private readonly pwaService: PwaService,
    private readonly changeDetector: ChangeDetectorRef
  ) {
    super();
  }

  ngAfterViewInit() {
    this.subscribe(this.pwaService.onlineStatus, isOnline => {
      if (isOnline) {
        this.sendInviteForm.enable();
      } else {
        this.sendInviteForm.disable();
        // Workaround for angular/angular#17793 (ExpressionChangedAfterItHasBeenCheckedError after form disabled)
        this.changeDetector.detectChanges();
      }
    });
  }

  get shareLink(): string {
    return this.locationService.origin + '/projects/' + this.projectId + '?sharing=true';
  }

  get isAppOnline(): boolean {
    return this.pwaService.isOnline;
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
    if (this.projectId == null || this.email.invalid) {
      return;
    }
    this.isAlreadyInvited = await this.projectService.onlineIsAlreadyInvited(this.projectId, this.email.value);
  }

  async sendEmail(): Promise<void> {
    if (this.projectId == null || this.email.value === '' || this.email.value == null || !this.sendInviteForm.valid) {
      return;
    }

    this.isSubmitted = true;
    const response = await this.projectService.onlineInvite(this.projectId, this.email.value, this.localeControl.value);
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
