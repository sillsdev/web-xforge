import { Component } from '@angular/core';
import { browserLinks } from 'xforge-common/utils';

@Component({
  selector: 'app-supported-browsers-dialog',
  templateUrl: './supported-browsers-dialog.component.html'
})
export class SupportedBrowsersDialogComponent {
  constructor() {}

  get browserLinks() {
    return browserLinks();
  }
}
