import { ComponentType } from '@angular/cdk/portal';
import { Injectable } from '@angular/core';
import { MatDialog, MatDialogConfig, MatDialogRef } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { hasObjectProp } from '../type-utils';
import {
  GenericDialogComponent,
  GenericDialogOptions,
  GenericDialogRef
} from './generic-dialog/generic-dialog.component';
import { I18nKey, I18nService } from './i18n.service';

@Injectable({
  providedIn: 'root'
})
export class DialogService {
  constructor(private readonly i18n: I18nService, private readonly matDialog: MatDialog) {}

  openMatDialog<T, D = any, R = any>(component: ComponentType<T>, config?: MatDialogConfig<D>): MatDialogRef<T, R> {
    const defaults: MatDialogConfig = { direction: this.i18n.direction, autoFocus: false };
    const dialogDefaults: MatDialogConfig = hasObjectProp(component, 'defaultMatDialogConfig')
      ? component.defaultMatDialogConfig
      : {};
    return this.matDialog.open(component, { ...defaults, ...dialogDefaults, ...(config ?? {}) });
  }

  openGenericDialog<T>(options: GenericDialogOptions<T>): GenericDialogRef<T> {
    const dialogRef: MatDialogRef<GenericDialogComponent<T>, T> = this.matDialog.open<
      GenericDialogComponent<T>,
      GenericDialogOptions<T>,
      T
    >(GenericDialogComponent, {
      direction: this.i18n.direction,
      autoFocus: false,
      data: options
    });

    return {
      dialogRef,
      result: dialogRef.afterClosed().toPromise()
    };
  }

  async confirm(
    question: I18nKey | Observable<string>,
    affirmative: I18nKey | Observable<string>,
    negative?: I18nKey | Observable<string>
  ): Promise<boolean> {
    return await this.confirmWithOptions({ title: question, affirmative, negative });
  }

  async confirmWithOptions(options: {
    title: I18nKey | Observable<string>;
    message?: I18nKey | Observable<string>;
    affirmative: I18nKey | Observable<string>;
    negative?: I18nKey | Observable<string>;
  }): Promise<boolean> {
    const result: boolean | undefined = await this.openGenericDialog({
      title: this.ensureLocalized(options.title),
      message: options.message == null ? undefined : this.ensureLocalized(options.message),
      options: [
        { value: false, label: this.ensureLocalized(options.negative ?? 'dialog.cancel') },
        { value: true, label: this.ensureLocalized(options.affirmative), highlight: true }
      ]
    }).result;
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
    return await this.openGenericDialog({
      title: this.ensureLocalized(message),
      options: [{ value: undefined, label: this.ensureLocalized(close ?? 'dialog.close'), highlight: true }]
    }).result;
  }

  get openDialogCount(): number {
    return this.matDialog.openDialogs.length;
  }

  /**
   * @param value A string that is a translation key, or an Observable<string>
   * @returns `value` if it is an Observable, or an Observable for a translation with `value` as the localization key.
   */
  private ensureLocalized(value: I18nKey | Observable<string>): Observable<string> {
    return typeof value === 'string' ? this.i18n.translate(value) : value;
  }
}
