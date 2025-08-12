import { Component, Inject } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogConfig } from '@angular/material/dialog';
import { I18nService } from 'xforge-common/i18n.service';

@Component({
  templateUrl: 'delete-project-dialog.component.html',
  styleUrls: ['delete-project-dialog.component.scss']
})
export class DeleteProjectDialogComponent {
  static defaultMatDialogConfig: MatDialogConfig = { autoFocus: true };

  projectNameEntry = new FormControl('', { nonNullable: true });

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: { name: string },
    readonly i18n: I18nService
  ) {}

  get deleteDisabled(): boolean {
    return this.data.name?.toLowerCase() !== this.projectNameEntry.value.toLowerCase();
  }
}
