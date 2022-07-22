import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { TranslocoService } from '@ngneat/transloco';

export interface NoteDialogData {
  type: 'f' | 'fe' | 'x';
  text: string;
  isRightToLeft: boolean;
}

@Component({
  selector: 'app-text-note-dialog',
  templateUrl: './text-note-dialog.component.html',
  styleUrls: ['./text-note-dialog.component.scss']
})
export class TextNoteDialogComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA) private readonly data: NoteDialogData,
    private readonly translocoService: TranslocoService
  ) {}

  get isRtl(): boolean {
    return this.data.isRightToLeft;
  }

  get text(): string {
    return this.data.text;
  }

  get type(): string {
    switch (this.data.type) {
      case 'f':
        return this.translocoService.translate('text_note_dialog.footnote');
      case 'fe':
        return this.translocoService.translate('text_note_dialog.end_note');
      case 'x':
        return this.translocoService.translate('text_note_dialog.cross_reference');
    }
    return this.data.type;
  }
}
