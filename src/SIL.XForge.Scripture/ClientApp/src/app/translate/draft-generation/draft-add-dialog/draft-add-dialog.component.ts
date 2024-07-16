import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { TranslocoModule } from '@ngneat/transloco';
import { UICommonModule } from 'xforge-common/ui-common.module';

@Component({
  selector: 'app-draft-add-dialog',
  standalone: true,
  imports: [UICommonModule, TranslocoModule],
  templateUrl: './draft-add-dialog.component.html',
  styleUrl: './draft-add-dialog.component.scss'
})
export class DraftAddDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: { bookName: string }) {}
}
