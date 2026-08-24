import { Component } from '@angular/core';
import { NoticeComponent } from '../notice/notice.component';

/**
 * Notice shown on project admin pages that are read-only because the user is only there as a serval admin.
 * Deliberately not localized: only serval admins ever see it.
 */
@Component({
  selector: 'app-serval-admin-read-only-notice',
  templateUrl: './serval-admin-read-only-notice.component.html',
  styleUrls: ['./serval-admin-read-only-notice.component.scss'],
  imports: [NoticeComponent]
})
export class ServalAdminReadOnlyNoticeComponent {}
