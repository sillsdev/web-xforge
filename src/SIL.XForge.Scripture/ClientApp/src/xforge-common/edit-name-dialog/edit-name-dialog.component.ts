import { Component, DestroyRef, Inject } from '@angular/core';
import { UntypedFormControl, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogConfig, MatDialogRef } from '@angular/material/dialog';
import { I18nService } from 'xforge-common/i18n.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { quietTakeUntilDestroyed } from 'xforge-common/utils';
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
  static defaultMatDialogConfig: MatDialogConfig = { autoFocus: true };

  name: UntypedFormControl = new UntypedFormControl('');
  isOnline: boolean = true;

  constructor(
    public dialogRef: MatDialogRef<EditNameDialogComponent, EditNameDialogResult | 'close'>,
    public i18n: I18nService,
    private readonly onlineStatusService: OnlineStatusService,
    @Inject(MAT_DIALOG_DATA) public data: { name: string; isConfirmation: boolean },
    private destroyRef: DestroyRef
  ) {
    this.name.setValidators([Validators.required, XFValidators.someNonWhitespace]);
    this.name.setValue(data.name);
    this.onlineStatusService.onlineStatus$
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(isOnline => (this.isOnline = isOnline));
  }

  submitDialog(): void {
    if (this.name.valid && this.isOnline) {
      this.dialogRef.close({ displayName: this.name.value });
    }
  }
}
