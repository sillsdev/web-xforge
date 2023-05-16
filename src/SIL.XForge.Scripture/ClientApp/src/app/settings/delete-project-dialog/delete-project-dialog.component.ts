import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Component, Inject } from '@angular/core';
import { UntypedFormControl } from '@angular/forms';
import { I18nService } from 'xforge-common/i18n.service';

@Component({
  templateUrl: 'delete-project-dialog.component.html'
})
export class DeleteProjectDialogComponent {
  projectNameEntry = new UntypedFormControl('');

  constructor(@Inject(MAT_DIALOG_DATA) public data: { name: string }, readonly i18n: I18nService) {}

  get deleteDisabled(): boolean {
    return this.data.name?.toLowerCase() !== this.projectNameEntry.value.toLowerCase();
  }
}
