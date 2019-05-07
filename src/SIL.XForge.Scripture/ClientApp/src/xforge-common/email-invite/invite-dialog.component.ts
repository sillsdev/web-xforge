import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { environment } from '../../environments/environment';
import { NoticeService } from '../notice.service';
import { InviteAction, ProjectService } from '../project.service';
import { SubscriptionDisposable } from '../subscription-disposable';
import { UserService } from '../user.service';

@Component({
  templateUrl: './invite-dialog.component.html',
  styleUrls: ['./invite-dialog.component.scss']
})
export class InviteDialogComponent extends SubscriptionDisposable implements OnInit {
  emailPattern = '[a-zA-Z0-9.-_]{1,}@[a-zA-Z0-9.-]{2,}[.]{1}[a-zA-Z]{2,}';
  sendInviteForm: FormGroup = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email, Validators.pattern(this.emailPattern)])
  });
  isSubmitted: boolean = false;
  siteName = environment.siteName;

  private projectId: string;

  constructor(
    private readonly noticeService: NoticeService,
    private readonly projectService: ProjectService,
    private readonly userService: UserService
  ) {
    super();
  }

  get email() {
    return this.sendInviteForm.get('email');
  }

  ngOnInit(): void {
    this.subscribe(this.userService.getCurrentUser(), user => {
      this.projectId = user.site.currentProjectId;
    });
  }

  async onSubmit(): Promise<void> {
    if (!this.sendInviteForm.valid) {
      return;
    }

    this.isSubmitted = true;
    const actionPerformed = await this.projectService.onlineInvite(this.sendInviteForm.value.email, this.projectId);
    let message: string = '';
    this.isSubmitted = false;
    switch (actionPerformed) {
      case InviteAction.Joined:
        message = 'An email has been sent to ' + this.sendInviteForm.value.email + ' adding them to this project.';
        this.noticeService.show(message);
        this.sendInviteForm.reset();
        break;

      case InviteAction.Invited:
        message = 'An invitation email has been sent to ' + this.sendInviteForm.value.email + '.';
        this.noticeService.show(message);
        this.sendInviteForm.reset();
        break;

      case InviteAction.None:
        message = 'A user with email ' + this.sendInviteForm.value.email + ' is already in the project.';
        this.noticeService.show(message);
        break;
    }
  }
}
