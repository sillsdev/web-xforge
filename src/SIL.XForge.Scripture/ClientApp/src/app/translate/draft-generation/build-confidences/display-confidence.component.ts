import { Component, Input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslocoModule } from '@ngneat/transloco';
import { TranslocoMarkupModule } from 'ngx-transloco-markup';
import { ExternalUrlService } from 'xforge-common/external-url.service';
import { NoticeComponent } from '../../../shared/notice/notice.component';

@Component({
  selector: 'app-display-confidence',
  templateUrl: './display-confidence.component.html',
  styleUrl: './display-confidence.component.scss',
  imports: [MatIcon, MatTooltip, NoticeComponent, TranslocoModule, TranslocoMarkupModule]
})
/**
 * Displays the confidence value in an human-friendly format.
 */
export class DisplayConfidenceComponent {
  constructor(protected readonly urlService: ExternalUrlService) {}
  @Input() bookNameWithLowConfidence: string | undefined;
  @Input() booksWithLowConfidence: number = 0;
  @Input() showIcon: boolean | undefined;
  @Input() showIconAndText: boolean | undefined;
  @Input() showNotice: boolean | undefined;
}
