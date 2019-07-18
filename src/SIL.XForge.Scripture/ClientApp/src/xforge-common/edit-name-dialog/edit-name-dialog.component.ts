import { MDC_DIALOG_DATA, MdcDialogRef } from '@angular-mdc/web';
import { Component, Inject } from '@angular/core';
import { FormControl } from '@angular/forms';

@Component({
  templateUrl: './edit-name-dialog.component.html'
})
export class EditNameDialogComponent {
  name: FormControl = new FormControl('');

  constructor(
    public dialogRef: MdcDialogRef<EditNameDialogComponent>,
    @Inject(MDC_DIALOG_DATA) public data: { name: string; isConfirmation: boolean }
  ) {
    this.name.setValue(data.name);
  }

  closeDialog() {
    this.dialogRef.close(this.name.value);
  }
}
