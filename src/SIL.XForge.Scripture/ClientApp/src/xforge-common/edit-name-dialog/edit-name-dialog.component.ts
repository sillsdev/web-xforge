import { Component, Inject } from '@angular/core';
import { UntypedFormControl, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { I18nService } from 'xforge-common/i18n.service';
import { XFValidators } from 'xforge-common/xfvalidators';

export interface EditNameDialogResult {
  displayName: string;
}

@Component({
  selector: 'app-edit-name-dialog',
  styleUrls: ['./edit-name-dialog.component.scss'],
  templateUrl: './edit-name-dialog.component.html'
})
export class EditNameDialogComponent {
  name: UntypedFormControl = new UntypedFormControl('');

  constructor(
    public dialogRef: MatDialogRef<EditNameDialogComponent, EditNameDialogResult | 'close'>,
    public i18n: I18nService,
    @Inject(MAT_DIALOG_DATA) public data: { name: string; isConfirmation: boolean }
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
