import { Component } from '@angular/core';
import { TranslocoModule } from '@ngneat/transloco';
import { NoticeComponent } from '../notice/notice.component';

/**
 * Shown in place of the old "Log in to Paratext" buttons for the edge case of a logged-in user whose account is not
 * connected to a Paratext account.
 */
@Component({
  selector: 'app-paratext-account-notice',
  templateUrl: './paratext-account-notice.component.html',
  imports: [TranslocoModule, NoticeComponent]
})
export class ParatextAccountNoticeComponent {}
