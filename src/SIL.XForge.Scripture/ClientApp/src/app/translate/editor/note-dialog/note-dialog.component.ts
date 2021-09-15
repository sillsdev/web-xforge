import { MDC_DIALOG_DATA } from '@angular-mdc/web/dialog';
import { Component, Inject, OnInit } from '@angular/core';
import { sortBy } from 'lodash-es';
import { toVerseRef } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { Note } from 'realtime-server/scriptureforge/models/note';
import { I18nService } from 'xforge-common/i18n.service';
import { ParatextNoteThreadDoc } from '../../../core/models/paratext-note-thread-doc';
import { SFProjectDoc } from '../../../core/models/sf-project-doc';
import { TextDoc, TextDocId } from '../../../core/models/text-doc';
import { SFProjectService } from '../../../core/sf-project.service';

export interface NoteDialogData {
  threadId: string;
  projectId: string;
}

// TODO: Implement a diff - there is an accepted solution here:
// https://codereview.stackexchange.com/questions/133586/a-string-prototype-diff-implementation-text-diff

@Component({
  templateUrl: './note-dialog.component.html',
  styleUrls: ['./note-dialog.component.scss']
})
export class NoteDialogComponent implements OnInit {
  showSegmentText: boolean = false;
  private threadDoc?: ParatextNoteThreadDoc;
  private projectDoc?: SFProjectDoc;
  private textDoc?: TextDoc;

  constructor(
    @Inject(MDC_DIALOG_DATA) private readonly data: NoteDialogData,
    private readonly i18n: I18nService,
    private readonly projectService: SFProjectService
  ) {}

  async ngOnInit(): Promise<void> {
    this.threadDoc = await this.projectService.getNoteThread(this.projectId + ':' + this.threadId);
    this.textDoc = await this.projectService.getText(this.textDocId);
    this.projectDoc = await this.projectService.get(this.projectId);
  }

  get flagIcon(): string {
    if (this.threadDoc?.data == null) {
      return '';
    }
    return this.projectService.getNoteThreadIcon(this.threadDoc.data).url;
  }

  get isRtl(): boolean {
    if (this.projectDoc?.data == null) {
      return false;
    }
    return this.projectDoc.data.isRightToLeft ?? false;
  }

  get notes(): Note[] {
    if (this.threadDoc?.data == null) {
      return [];
    }
    return sortBy(
      this.threadDoc.data.notes.filter(n => !n.deleted),
      n => n.dateCreated
    );
  }

  get verseRef(): string {
    if (this.threadDoc?.data == null) {
      return '';
    }
    const verseRef = toVerseRef(this.threadDoc.data.verseRef);
    return this.i18n.localizeReference(verseRef);
  }

  get noteText(): string {
    if (this.threadDoc?.data == null) {
      return '';
    }
    return (
      this.threadDoc.data.contextBefore +
      '<b>' +
      this.threadDoc.data.selectedText +
      '</b>' +
      this.threadDoc.data.contextAfter
    );
  }

  get segmentText(): string {
    if (this.textDoc?.data == null || this.threadDoc?.data == null) {
      return '';
    }
    const verseRef = toVerseRef(this.threadDoc.data.verseRef);
    return this.textDoc.getSegmentTextIncludingRelated(`verse_${verseRef.chapter}_${verseRef.verse}`);
  }

  toggleSegmentText(): void {
    this.showSegmentText = !this.showSegmentText;
  }

  private get projectId(): string {
    return this.data.projectId;
  }

  private get textDocId(): string {
    if (this.threadDoc?.data == null) {
      return '';
    }
    const verseRef = toVerseRef(this.threadDoc.data.verseRef);
    const textDocId = new TextDocId(this.projectId, verseRef.bookNum, verseRef.chapterNum);
    return textDocId.toString();
  }

  private get threadId(): string {
    return this.data.threadId;
  }
}
