import { MdcDialog, MdcDialogConfig, MdcDialogRef } from '@angular-mdc/web';
import { ComponentType } from '@angular/cdk/portal';
import { Injectable, TemplateRef } from '@angular/core';
import { MatDialog, MatDialogConfig, MatDialogRef } from '@angular/material/dialog';
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

  get openDialogCount(): number {
    return this.mdcDialog.openDialogs.length + this.matDialog.openDialogs.length;
  }
}
