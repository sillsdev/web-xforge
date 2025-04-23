import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { DraftUsfmConfig } from '../../../core/models/draft-usfm-config';

@Component({
  selector: 'app-draft-format-dialog',
  standalone: true,
  imports: [UICommonModule, CommonModule],
  templateUrl: './draft-format-dialog.component.html',
  styleUrl: './draft-format-dialog.component.scss'
})
export class DraftFormatDialogComponent {
  preserveParagraph: boolean = true;
  preserveStyles: boolean = false;
  preserveEmbeds: boolean = true;

  constructor(@Inject(MatDialogRef) private dialogRef: MatDialogRef<DraftFormatDialogComponent, DraftUsfmConfig>) {}

  onApply(): void {
    const config: DraftUsfmConfig = {
      preserveParagraphMarkers: this.preserveParagraph,
      preserveStyleMarkers: this.preserveStyles,
      preserveEmbedMarkers: this.preserveEmbeds
    };
    this.dialogRef.close(config);
  }
}
