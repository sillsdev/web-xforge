import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { I18nService } from 'xforge-common/i18n.service';
import { browserLinks, isIosDevice } from 'xforge-common/utils';

export enum BrowserIssue {
  Upgrade = 'upgrade_chrome_firefox',
  AudioRecording = 'audio_recording_not_supported'
}

@Component({
  selector: 'app-supported-browsers-dialog',
  templateUrl: './supported-browsers-dialog.component.html',
  standalone: false
})
export class SupportedBrowsersDialogComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: BrowserIssue,
    private readonly i18n: I18nService
  ) {}

  get browserLinks(): { chromeLink: string; firefoxLink: string; safariLink: string } {
    return browserLinks();
  }

  get dialogMessage(): string {
    if (this.data === BrowserIssue.AudioRecording) {
      return isIosDevice()
        ? this.i18n.translateStatic('supported_browsers_dialog.safari_for_audio_on_ios') + this.recommendedBrowserText
        : this.i18n.translateStatic('supported_browsers_dialog.audio_recording_not_supported') +
            this.recommendedBrowserText;
    }
    return (
      this.i18n.translateStatic('supported_browsers_dialog.some_features_may_not_work') + this.recommendedBrowserText
    );
  }

  get recommendedBrowserText(): string {
    return isIosDevice()
      ? this.i18n.translateAndInsertTags('supported_browsers_dialog.upgrade_safari', this.browserLinks)
      : this.i18n.translateAndInsertTags('supported_browsers_dialog.upgrade_chrome_firefox', this.browserLinks);
  }
}
