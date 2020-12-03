import { MDC_DIALOG_DATA } from '@angular-mdc/web';
import { Component, Inject } from '@angular/core';
import { browserLinks, isIosDevice } from 'xforge-common/utils';

export enum BrowserIssue {
  upgrade = 'upgrade_chrome_firefox',
  audioRecording = 'audio_recording_not_supported'
}

@Component({
  selector: 'app-supported-browsers-dialog',
  templateUrl: './supported-browsers-dialog.component.html'
})
export class SupportedBrowsersDialogComponent {
  constructor(@Inject(MDC_DIALOG_DATA) public data: BrowserIssue) {}

  get browserLinks() {
    return browserLinks();
  }

  get audioRecordingNotSupported(): boolean {
    return this.data === BrowserIssue.audioRecording && isIosDevice();
  }

  get iosRecordingNotSupported(): boolean {
    return this.data === BrowserIssue.audioRecording && !isIosDevice();
  }

  get upgradeChromeFirefox(): boolean {
    return this.data === BrowserIssue.upgrade && !isIosDevice();
  }

  get upgradeSafari(): boolean {
    return this.data === BrowserIssue.upgrade && isIosDevice();
  }
}
