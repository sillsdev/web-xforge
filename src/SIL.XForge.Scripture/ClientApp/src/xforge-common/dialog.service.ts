import { MdcDialog, MdcDialogConfig, MdcDialogRef } from '@angular-mdc/web';
import { ComponentType } from '@angular/cdk/portal';
import { Injectable, TemplateRef } from '@angular/core';
import { MatDialog, MatDialogConfig, MatDialogRef } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { GenericDialogComponent, GenericDialogOptions } from './generic-dialog/generic-dialog.component';
import { I18nService } from './i18n.service';

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
    return this.matDialog.open(component, { direction: this.i18n.direction, ...(config || {}) });
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
        { label: negative || this.i18n.translate('edit_name_dialog.cancel'), value: false },
        { label: affirmative, value: true, highlight: true }
      ]
    });
    return result === true;
  }

  async message(message: Observable<string>, close?: Observable<string>): Promise<void> {
    await this.openGenericDialog({
      title: message,
      options: [{ label: close || this.i18n.translate('message_dialog.dismiss'), value: undefined, highlight: true }]
    });
  }

  get openDialogCount(): number {
    return this.mdcDialog.openDialogs.length + this.matDialog.openDialogs.length;
  }
}
