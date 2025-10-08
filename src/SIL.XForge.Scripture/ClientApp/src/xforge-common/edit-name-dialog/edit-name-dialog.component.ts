import { Component, DestroyRef, Inject } from '@angular/core';
import { UntypedFormControl, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogConfig,
  MatDialogRef,
  MatDialogTitle,
  MatDialogContent,
  MatDialogActions,
  MatDialogClose
} from '@angular/material/dialog';
import { I18nService } from 'xforge-common/i18n.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { XFValidators } from 'xforge-common/xfvalidators';
import { TranslocoModule } from '@ngneat/transloco';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatButton } from '@angular/material/button';
export interface EditNameDialogResult {
  displayName: string;
}

@Component({
  selector: 'app-edit-name-dialog',
  styleUrls: ['./edit-name-dialog.component.scss'],
  templateUrl: './edit-name-dialog.component.html',
  imports: [
    TranslocoModule,
    MatDialogTitle,
    CdkScrollable,
    MatDialogContent,
    FormsModule,
    MatFormField,
    MatLabel,
    MatInput,
    ReactiveFormsModule,
    MatDialogActions,
    MatButton,
    MatDialogClose
  ]
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
