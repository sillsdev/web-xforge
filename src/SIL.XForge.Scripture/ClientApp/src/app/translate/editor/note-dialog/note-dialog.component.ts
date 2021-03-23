import { MDC_DIALOG_DATA } from '@angular-mdc/web/dialog';
import { Component, Inject, OnInit } from '@angular/core';

export interface NoteDialogData {
  id: string;
}

@Component({
  templateUrl: './note-dialog.component.html',
  styleUrls: ['./note-dialog.component.scss']
})
export class NoteDialogComponent implements OnInit {
  constructor(@Inject(MDC_DIALOG_DATA) private readonly data: NoteDialogData) {}

  ngOnInit(): void {}
}
