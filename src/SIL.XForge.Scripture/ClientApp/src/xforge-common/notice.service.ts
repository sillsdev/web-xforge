import { MdcDialog, MdcDialogRef, MdcSnackbar, MdcSnackbarConfig } from '@angular-mdc/web';
import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';
import { MessageDialogComponent, MessageDialogData } from './message-dialog/message-dialog.component';

/** Manages and provides access to notices shown to user on the web site. */
@Injectable({
  providedIn: 'root'
})
export class NoticeService {
  private _isAppLoading: boolean = false;
  private loadingCount: number = 0;

  constructor(
    private readonly snackbar: MdcSnackbar,
    private readonly authService: AuthService,
    private readonly dialog: MdcDialog
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
    let config: MdcSnackbarConfig<any>;
    if (!(await this.authService.isLoggedIn)) {
      config = { classes: 'snackbar-above-footer' };
    }
    this.snackbar.open(message, undefined, config);
  }

  showMessageDialog(message: string): Promise<void> {
    const dialogRef = this.dialog.open<MessageDialogComponent, MessageDialogData>(MessageDialogComponent, {
      data: { message }
    }) as MdcDialogRef<MessageDialogComponent, any>;

    return dialogRef.afterClosed().toPromise();
  }
}
