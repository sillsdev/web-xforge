import { MdcDialogRef, MDC_DIALOG_DATA } from '@angular-mdc/web/dialog';
import { Component, Inject } from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import { XFValidators } from 'xforge-common/xfvalidators';

export interface EditNameDialogResult {
  displayName: string;
}

@Component({
  templateUrl: './edit-name-dialog.component.html'
})
export class EditNameDialogComponent {
  name: FormControl = new FormControl('');

  constructor(
    public dialogRef: MdcDialogRef<EditNameDialogComponent, EditNameDialogResult | 'close'>,
    @Inject(MDC_DIALOG_DATA) public data: { name: string; isConfirmation: boolean }
  ) {
    this.name.setValidators([Validators.required, XFValidators.someNonWhitespace]);
    this.name.setValue(data.name);
  }

  submitDialog() {
    if (this.name.valid) {
      this.dialogRef.close({ displayName: this.name.value });
    }
  }

  cancelDialog() {
    if (!this.data.isConfirmation) {
      this.dialogRef.close();
    }
  }
}
