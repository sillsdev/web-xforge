import { MdcSnackbar, MdcSnackbarConfig } from '@angular-mdc/web/snackbar';
import { Injectable } from '@angular/core';
import { I18nService } from './i18n.service';

/** Manages and provides access to notices shown to user on the web site. */
@Injectable({
  providedIn: 'root'
})
export class NoticeService {
  private _isAppLoading: boolean = false;
  private loadingCount: number = 0;
  private messageOnDisplay?: string;

  constructor(private readonly snackbar: MdcSnackbar, private readonly i18n: I18nService) {}

  get isAppLoading(): boolean {
    return this._isAppLoading;
  }

  loadingStarted(): void {
    if (this.loadingCount === 0) {
      setTimeout(() => (this._isAppLoading = true));
    }
    this.loadingCount++;
  }

  loadingFinished(): void {
    this.loadingCount--;
    if (this.loadingCount === 0) {
      setTimeout(() => (this._isAppLoading = false));
    }
  }

  async show(message: string): Promise<void> {
    return this.showSnackBar(message);
  }

  async showError(message: string): Promise<void> {
    return this.showSnackBar(message, ['snackbar-error']);
  }

  private async showSnackBar(message: string, classes: string[] = []): Promise<void> {
    let config: MdcSnackbarConfig<any> | undefined;
    config = { classes: classes.join(' '), direction: this.i18n.direction };
    if (this.messageOnDisplay === message) {
      // Do nothing if the message is the same as one currently on display
      return;
    }
    const snackBarRef = this.snackbar.open(message, undefined, config);
    this.messageOnDisplay = message;
    snackBarRef
      .afterDismiss()
      .toPromise()
      .then(() => (this.messageOnDisplay = undefined));
  }
}
