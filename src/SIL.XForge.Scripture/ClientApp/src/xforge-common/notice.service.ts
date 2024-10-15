import { Injectable } from '@angular/core';
import { MatSnackBar, MatSnackBarConfig } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { I18nService } from './i18n.service';

/** Manages and provides access to notices shown to user on the web site. */
@Injectable({ providedIn: 'root' })
export class NoticeService {
  private _isAppLoading: boolean = false;
  private messageOnDisplay?: string;

  private _loadingCountsByCallerId: { [callerId: string]: number } = {};

  get loadingCountsByCallerId(): { [callerId: string]: number } {
    return this._loadingCountsByCallerId;
  }

  constructor(
    private readonly snackBar: MatSnackBar,
    private readonly i18n: I18nService
  ) {}

  get isAppLoading(): boolean {
    return this._isAppLoading;
  }

  loadingStarted(): void {
    const callerId = this.getCallerClassName();

    if (this._loadingCountsByCallerId[callerId] === undefined) {
      this._loadingCountsByCallerId[callerId] = 0;
    }
    this._loadingCountsByCallerId[callerId]++;

    this.setAppLoadingAsync(true);
  }

  loadingFinished(): void {
    const callerId = this.getCallerClassName();

    if (!(this._loadingCountsByCallerId[callerId] > 0)) {
      console.error(`loadingFinished called by ${callerId} without a corresponding loadingStarted call`);
      // Set it to 1 to avoid negative values
      this._loadingCountsByCallerId[callerId] = 1;
    }

    this._loadingCountsByCallerId[callerId]--;
    // check if every caller has finished loading
    if (Object.values(this._loadingCountsByCallerId).every(count => count === 0)) {
      this.setAppLoadingAsync(false);
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

  private getCallerClassName(): string {
    return new Error().stack?.split('\n')[3].match(/^\s*at (\w+)\./)?.[1] ?? 'unknown';
  }

  private setAppLoadingAsync(value: boolean): void {
    setTimeout(() => {
      this._isAppLoading = value;
    });
  }
}
