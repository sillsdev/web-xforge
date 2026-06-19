import { Component } from '@angular/core';
import { I18nService } from 'xforge-common/i18n.service';
import { environment } from '../../../environments/environment';
import { NoticeComponent } from '../../shared/notice/notice.component';

@Component({
  selector: 'app-smt-retirement-notice',
  imports: [NoticeComponent],
  templateUrl: './smt-retirement-notice.component.html'
})
export class SmtRetirementNoticeComponent {
  readonly issueEmail = environment.issueEmail;
  readonly smtRetirementDate = new Date('2026-08-04');

  constructor(readonly i18n: I18nService) {}
}
