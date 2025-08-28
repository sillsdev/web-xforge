import { Component, Input } from '@angular/core';
import { of } from 'rxjs';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { stripHtml } from 'xforge-common/util/string-util';
import { NoticeComponent } from '../notice/notice.component';

@Component({
    selector: 'app-copyright-banner',
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
    return this.i18n.translateStatic('editor.more_info');
  }

  get showMoreInfo(): boolean {
    return this.notice != null;
  }

  openCopyrightNoticeDialog(): void {
    // allowing non-null assertion for this.notice as the link to open the dialog is only shown when
    // this.notice is defined (this.showMoreInfo)

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    let copyrightNotice = this.notice!.trim();
    if (copyrightNotice[0] !== '<') {
      // If copyright is plain text, remove the first line and add paragraph markers.
      const lines: string[] = copyrightNotice.split('\n');
      copyrightNotice = '<p>' + lines.slice(1).join('</p><p>') + '</p>';
    } else {
      // Just remove the first paragraph that contains the notification.
      copyrightNotice = copyrightNotice.replace(/^<p>.*?<\/p>/, '');
    }

    this.dialogService.openGenericDialog({
      message: of(stripHtml(copyrightNotice)),
      options: [{ value: undefined, label: this.i18n.translate('dialog.close'), highlight: true }]
    });
  }
}
