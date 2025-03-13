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
  @Input() notice: string | undefined;
  @Input() banner: string | undefined;

  constructor(
    private readonly dialogService: DialogService,
    private readonly i18n: I18nService
  ) {}

  get moreInfo(): string {
    return translate('editor.more_info');
  }

  get showMoreInfo(): boolean {
    return this.notice != null || this.banner != null;
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
    // If we do not have a copyright notice, use the copyright banner
    const copyrightNotice: string = this.notice ?? this.banner ?? '';
    this.openCopyrightNoticeDialog(copyrightNotice);
  }
}
