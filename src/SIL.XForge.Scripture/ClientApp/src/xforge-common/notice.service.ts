import { Injectable } from '@angular/core';
import { MatSnackBar, MatSnackBarConfig } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { I18nService } from './i18n.service';

/** Manages and provides access to notices shown to user on the web site. */
@Injectable({
  providedIn: 'root'
})
export class NoticeService {
  private _isAppLoading: boolean = false;
  private loadingCount: number = 0;
  private messageOnDisplay?: string;

  constructor(
    private readonly snackBar: MatSnackBar,
    private readonly i18n: I18nService
  ) {}

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

  async showError(
    message: string,
    action: string | undefined = undefined,
    onAction: (() => void) | undefined = undefined
  ): Promise<void> {
    return this.showSnackBar(message, ['snackbar-error'], action, onAction);
  }

  private async showSnackBar(
    message: string,
    classes: string[] = [],
    action: string | undefined = undefined,
    onAction: (() => void) | undefined = undefined
  ): Promise<void> {
    let config: MatSnackBarConfig<any> | undefined;
    config = { panelClass: classes.join(' '), direction: this.i18n.direction, duration: 5000 };
    if (this.messageOnDisplay === message) {
      // Do nothing if the message is the same as one currently on display
      return;
    }
    const snackBarRef = this.snackBar.open(message, action, config);

    if (onAction !== undefined) {
      snackBarRef.onAction().subscribe(() => {
        onAction();
        this.messageOnDisplay = undefined;
      });
    }

    this.messageOnDisplay = message;

    firstValueFrom(snackBarRef.afterDismissed()).then(() => (this.messageOnDisplay = undefined));
  }
}
