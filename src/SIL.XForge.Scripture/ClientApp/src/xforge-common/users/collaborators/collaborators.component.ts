import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { NoticeService } from '../../notice.service';
import { InviteAction, ProjectService } from '../../project.service';
import { SubscriptionDisposable } from '../../subscription-disposable';
import { XFValidators } from '../../xfvalidators';

@Component({
  selector: 'app-collaborators',
  templateUrl: './collaborators.component.html',
  styleUrls: ['./collaborators.component.scss']
})
export class CollaboratorsComponent extends SubscriptionDisposable implements OnInit {
  userSelectionForm = new FormGroup({
    user: new FormControl('')
  });
  userInviteForm = new FormGroup({
    email: new FormControl('', [XFValidators.email])
  });

  private projectId: string;
  private inviteButtonClicked = false;

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly projectService: ProjectService,
    private readonly noticeService: NoticeService
  ) {
    super();
  }

  get inviteDisabled(): boolean {
    return this.userInviteForm.invalid || !this.userInviteForm.value.email || this.inviteButtonClicked;
  }

  ngOnInit() {
    this.subscribe(this.activatedRoute.params, params => (this.projectId = params['projectId']));
  }

  async onInvite(): Promise<void> {
    this.inviteButtonClicked = true;
    const email = this.userInviteForm.value.email;
    const action = await this.projectService.onlineInvite(email, this.projectId);
    if (action === InviteAction.Invited) {
      const message = 'An invitation email has been sent to ' + email + '.';
      this.noticeService.show(message);
    } else if (action === InviteAction.Joined) {
      const message = 'An email has been sent to ' + email + ' adding them to this project.';
      this.noticeService.show(message);
    } else if (action === InviteAction.None) {
      const message = 'This user is already part of the project.';
      this.noticeService.show(message);
    }
    this.userInviteForm.reset();
    this.inviteButtonClicked = false;
  }
}
