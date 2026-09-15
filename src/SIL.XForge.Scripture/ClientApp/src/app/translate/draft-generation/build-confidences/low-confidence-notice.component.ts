import { Component, Input } from '@angular/core';
import { TranslocoMarkupComponent } from 'ngx-transloco-markup';
import { ExternalUrlService } from 'xforge-common/external-url.service';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeComponent } from '../../../shared/notice/notice.component';

/**
 * Warns that the draft quality of the given books may be lower than normal, with a link to the help article that
 * explains what to do about it. Renders nothing when no books are given.
 */
@Component({
  selector: 'app-low-confidence-notice',
  templateUrl: './low-confidence-notice.component.html',
  imports: [NoticeComponent, TranslocoMarkupComponent]
})
export class LowConfidenceNoticeComponent {
  /** The IDs of the books whose draft has low confidence. */
  @Input() bookIds: string[] = [];

  constructor(
    protected readonly i18n: I18nService,
    protected readonly urlService: ExternalUrlService
  ) {}
}
