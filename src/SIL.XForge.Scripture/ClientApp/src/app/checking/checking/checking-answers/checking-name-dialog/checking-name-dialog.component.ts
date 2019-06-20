import { MDC_DIALOG_DATA, MdcDialogRef } from '@angular-mdc/web';
import { Component, Inject } from '@angular/core';
import { FormControl } from '@angular/forms';

@Component({
  selector: 'app-checking-name-dialog',
  templateUrl: './checking-name-dialog.component.html'
})
export class CheckingNameDialogComponent {
  name: FormControl = new FormControl('');

  constructor(
    public dialogRef: MdcDialogRef<CheckingNameDialogComponent>,
    @Inject(MDC_DIALOG_DATA) public data: { name: string }
  ) {
    this.name.setValue(data.name);
  }

  closeDialog() {
    this.dialogRef.close(this.name.value);
  }
}
