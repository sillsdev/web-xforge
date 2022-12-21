import { Component, Inject } from '@angular/core';
import { UntypedFormControl, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { I18nService } from 'xforge-common/i18n.service';
import { PwaService } from 'xforge-common/pwa.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { XFValidators } from 'xforge-common/xfvalidators';

export interface EditNameDialogResult {
  displayName: string;
}

@Component({
  selector: 'app-edit-name-dialog',
  styleUrls: ['./edit-name-dialog.component.scss'],
  templateUrl: './edit-name-dialog.component.html'
})
export class EditNameDialogComponent extends SubscriptionDisposable {
  name: UntypedFormControl = new UntypedFormControl('');
  isOnline: boolean = true;

  constructor(
    public dialogRef: MatDialogRef<EditNameDialogComponent, EditNameDialogResult | 'close'>,
    public i18n: I18nService,
    readonly pwaService: PwaService,
    @Inject(MAT_DIALOG_DATA) public data: { name: string; isConfirmation: boolean }
  ) {
    super();
    this.name.setValidators([Validators.required, XFValidators.someNonWhitespace]);
    this.name.setValue(data.name);
    this.subscribe(this.pwaService.onlineStatus$, isOnline => (this.isOnline = isOnline));
  }

  submitDialog(): void {
    if (this.name.valid && this.isOnline) {
      this.dialogRef.close({ displayName: this.name.value });
    }
  }
}
