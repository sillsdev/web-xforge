import { MdcDialog, MdcDialogRef } from '@angular-mdc/web';
import { Injectable } from '@angular/core';
import { EditNameDialogComponent } from './edit-name-dialog/edit-name-dialog.component';

@Injectable({
  providedIn: 'root'
})
export class AccountService {
  constructor(private readonly dialog: MdcDialog) {}

  openNameDialog(
    currentName: string,
    nameConfirmation: boolean,
    escToClose = false,
    outsideToClose = false
  ): MdcDialogRef<EditNameDialogComponent> {
    return this.dialog.open(EditNameDialogComponent, {
      data: { name: currentName, isConfirmation: nameConfirmation },
      escapeToClose: escToClose,
      clickOutsideToClose: outsideToClose
    });
  }
}
