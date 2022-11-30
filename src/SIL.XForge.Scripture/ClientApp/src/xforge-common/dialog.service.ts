import { MdcDialog, MdcDialogConfig, MdcDialogRef } from '@angular-mdc/web';
import { ComponentType } from '@angular/cdk/portal';
import { Injectable, TemplateRef } from '@angular/core';
import { MatDialog, MatDialogConfig, MatDialogRef } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { GenericDialogComponent, GenericDialogOptions } from './generic-dialog/generic-dialog.component';
import { I18nKey, I18nService } from './i18n.service';

@Injectable({
  providedIn: 'root'
})
export class DialogService {
  constructor(
    private readonly i18n: I18nService,
    private readonly mdcDialog: MdcDialog,
    private readonly matDialog: MatDialog
  ) {}

  openMdcDialog<T, D = any, R = any>(
    componentOrTemplateRef: ComponentType<T> | TemplateRef<T>,
    config?: MdcDialogConfig<D>
  ): MdcDialogRef<T, R> {
    return this.mdcDialog.open(componentOrTemplateRef, config);
  }

  openMatDialog<T, D = any, R = any>(component: ComponentType<T>, config?: MatDialogConfig<D>): MatDialogRef<T, R> {
    return this.matDialog.open(component, { direction: this.i18n.direction, ...(config ?? {}) });
  }

  async openGenericDialog<T>(options: GenericDialogOptions<T>): Promise<T | undefined> {
    return this.matDialog
      .open<GenericDialogComponent<T>, GenericDialogOptions<T>, T>(GenericDialogComponent, {
        autoFocus: false,
        data: options
      })
      .afterClosed()
      .toPromise();
  }

  async confirm(
    question: I18nKey | Observable<string>,
    affirmative: I18nKey | Observable<string>,
    negative?: I18nKey | Observable<string>
  ): Promise<boolean> {
    const result: boolean | undefined = await this.openGenericDialog({
      title: this.ensureLocalized(question),
      options: [
        { value: false, label: this.ensureLocalized(negative ?? 'dialog.cancel') },
        { value: true, label: this.ensureLocalized(affirmative), highlight: true }
      ]
    });
    return result === true;
  }

  /**
   * Shows a message in a dialog. The message and close button may be specified via an Observable<string>, or by passing
   * the key to a localization string.
   * @param message The message to show. May be an Observable<string>, or an I18nKey which will be used as a translation
   * key.
   * @param close (optional) May be an Observable<string>, or an I18nKey which will be used as a translation key. If not
   * provided the button will use a default label for the close button.
   */
  async message(message: I18nKey | Observable<string>, close?: I18nKey | Observable<string>): Promise<void> {
    await this.openGenericDialog({
      title: this.ensureLocalized(message),
      options: [{ value: undefined, label: this.ensureLocalized(close ?? 'dialog.close'), highlight: true }]
    });
  }

  get openDialogCount(): number {
    return this.mdcDialog.openDialogs.length + this.matDialog.openDialogs.length;
  }

  /**
   * @param value A string that is a translation key, or an Observable<string>
   * @returns `value` if it is an Observable, or an Observable for a translation with `value` as the localization key.
   */
  private ensureLocalized(value: I18nKey | Observable<string>): Observable<string> {
    return typeof value === 'string' ? this.i18n.translate(value) : value;
  }
}
