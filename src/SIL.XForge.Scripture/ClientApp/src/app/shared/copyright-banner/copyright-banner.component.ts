import { Component, Input } from '@angular/core';
import { translate } from '@ngneat/transloco';
import { of } from 'rxjs';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { stripHtml } from 'xforge-common/util/string-util';
import { NoticeComponent } from '../notice/notice.component';

@Component({
  selector: 'app-copyright-banner',
  standalone: true,
  imports: [NoticeComponent],
  templateUrl: './copyright-banner.component.html',
  styleUrl: './copyright-banner.component.scss'
})
export class CopyrightBannerComponent {
  @Input() notice: string = '';
  @Input() banner: string = '';

  constructor(
    private readonly dialogService: DialogService,
    private readonly i18n: I18nService
  ) {}

  moreInfo(): string {
    return translate('editor.more_info');
  }

  openCopyrightNoticeDialog(copyrightNotice: string): void {
    copyrightNotice = copyrightNotice.trim();
    if (copyrightNotice[0] !== '<') {
      // If copyright is plain text, remove the first line and add paragraph markers.
      const lines: string[] = copyrightNotice.split('\n');
      copyrightNotice = '<p>' + lines.slice(1).join('</p><p>') + '</p>';
    } else {
      // Just remove the first paragraph that contains the notification.
      copyrightNotice = copyrightNotice.replace(/^<p>.*?<\/p>/, '');
    }

    // Show the copyright notice
    this.dialogService.openGenericDialog({
      message: of(stripHtml(copyrightNotice)),
      options: [{ value: undefined, label: this.i18n.translate('dialog.close'), highlight: true }]
    });
  }

  showCopyrightNotice(): void {
    let copyrightNotice: string = this.notice;

    // If we do not have a copyright notice, just use the copyright banner
    if (copyrightNotice === '') {
      copyrightNotice = this.banner;
    }
    this.openCopyrightNoticeDialog(copyrightNotice);
  }
}
