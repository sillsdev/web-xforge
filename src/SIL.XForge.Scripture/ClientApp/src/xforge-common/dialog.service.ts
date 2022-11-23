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
    question: Observable<string>,
    affirmative: Observable<string>,
    negative?: Observable<string>
  ): Promise<boolean> {
    const result: boolean | undefined = await this.openGenericDialog({
      title: question,
      options: [
        { label: negative ?? this.i18n.translate('edit_name_dialog.cancel'), value: false },
        { label: affirmative, value: true, highlight: true }
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
    const closeText = close instanceof Observable ? close : this.i18n.translate(close ?? 'dialog.close');
    await this.openGenericDialog({
      title: typeof message === 'string' ? this.i18n.translate(message) : message,
      options: [{ label: closeText, value: undefined, highlight: true }]
    });
  }

  get openDialogCount(): number {
    return this.mdcDialog.openDialogs.length + this.matDialog.openDialogs.length;
  }
}
