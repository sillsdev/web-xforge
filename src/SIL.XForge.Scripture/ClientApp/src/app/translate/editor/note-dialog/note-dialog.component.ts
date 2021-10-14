import { MDC_DIALOG_DATA } from '@angular-mdc/web/dialog';
import { Component, Inject, OnInit } from '@angular/core';
import { sortBy } from 'lodash-es';
import { toVerseRef } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { Note } from 'realtime-server/lib/esm/scriptureforge/models/note';
import { I18nService } from 'xforge-common/i18n.service';
import { SFProjectDoc } from '../../../core/models/sf-project-doc';
import { TextDoc, TextDocId } from '../../../core/models/text-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { NoteThreadDoc } from '../../../core/models/note-thread-doc';

export interface NoteDialogData {
  threadId: string;
  projectId: string;
}

// TODO: Implement a diff - there is an accepted solution here that might be a good starting point:
// https://codereview.stackexchange.com/questions/133586/a-string-prototype-diff-implementation-text-diff

@Component({
  templateUrl: './note-dialog.component.html',
  styleUrls: ['./note-dialog.component.scss']
})
export class NoteDialogComponent implements OnInit {
  showSegmentText: boolean = false;
  private threadDoc?: NoteThreadDoc;
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
    return this.threadDoc.icon.url;
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

  get noteContextText(): string {
    if (this.threadDoc?.data == null) {
      return '';
    }
    return (
      this.threadDoc.data.originalContextBefore +
      '<b>' +
      this.threadDoc.data.originalSelectedText +
      '</b>' +
      this.threadDoc.data.originalContextAfter
    );
  }

  get segmentText(): string {
    if (this.textDoc?.data == null || this.threadDoc?.data == null) {
      return '';
    }
    const verseRef = toVerseRef(this.threadDoc.data.verseRef);
    return this.textDoc.getSegmentTextIncludingRelated(`verse_${verseRef.chapter}_${verseRef.verse}`);
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

  parseNote(content: string) {
    if (content == null) {
      return '';
    }
    const replace = new Map<RegExp, string>();
    replace.set(/<bold>(.*)<\/bold>/gim, '<b>$1</b>'); // Bold style
    replace.set(/<italic>(.*)<\/italic>/gim, '<i>$1</i>'); // Italic style
    replace.set(/<p>(.*)<\/p>/gim, '$1<br />'); // Turn paragraphs into line breaks
    replace.set(/<(?!i|b|br|\/)(.*?>)(.*?)<\/(.*?)>/gim, '$2'); // Strip out any tags that don't match the above replacements
    replace.forEach((replacement, regEx) => (content = content.replace(regEx, replacement)));
    return content;
  }

  toggleSegmentText(): void {
    this.showSegmentText = !this.showSegmentText;
  }
}
