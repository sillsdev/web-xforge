import { Component, Inject } from '@angular/core';
import { MAT_LEGACY_DIALOG_DATA as MAT_DIALOG_DATA } from '@angular/material/legacy-dialog';
import { TranslocoService } from '@ngneat/transloco';
import { LocaleDirection } from 'xforge-common/models/i18n-locale';

export enum TextNoteType {
  Footnote = 'f',
  EndNote = 'fe',
  CrossReference = 'x'
}

export interface NoteDialogData {
  type: TextNoteType;
  text: string;
  isRightToLeft: boolean;
}

@Component({
  templateUrl: './text-note-dialog.component.html',
  styleUrls: ['./text-note-dialog.component.scss']
})
export class TextNoteDialogComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA) private readonly data: NoteDialogData,
    private readonly translocoService: TranslocoService
  ) {}

  get direction(): LocaleDirection {
    return this.data.isRightToLeft ? 'rtl' : 'ltr';
  }

  get text(): string {
    return this.data.text;
  }

  get type(): string {
    let translateKey = this.data.type.toString();
    switch (this.data.type) {
      case TextNoteType.Footnote:
        translateKey = 'footnote';
        break;
      case TextNoteType.EndNote:
        translateKey = 'end_note';
        break;
      case TextNoteType.CrossReference:
        translateKey = 'cross_reference';
    }
    return this.translocoService.translate(`text_note_dialog.${translateKey}`);
  }
}
