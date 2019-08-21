import { MDC_DIALOG_DATA, MdcDialogRef } from '@angular-mdc/web';
import { Component, Inject } from '@angular/core';
import { FormControl, Validators } from '@angular/forms';

@Component({
  templateUrl: './edit-name-dialog.component.html'
})
export class EditNameDialogComponent {
  name: FormControl = new FormControl('');

  constructor(
    public dialogRef: MdcDialogRef<EditNameDialogComponent>,
    @Inject(MDC_DIALOG_DATA) public data: { name: string; isConfirmation: boolean }
  ) {
    this.name.setValidators([Validators.required, Validators.pattern(/\S/)]);
    this.name.setValue(data.name);
  }

  closeDialog() {
    if (this.name.valid) {
      this.dialogRef.close(this.name.value);
    }
  }
}
