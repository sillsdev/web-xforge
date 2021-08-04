import { MDC_DIALOG_DATA } from '@angular-mdc/web/dialog';
import { Component, Inject } from '@angular/core';
import { toVerseRef } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { Note } from 'realtime-server/scriptureforge/models/note';
import { I18nService } from 'xforge-common/i18n.service';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { ParatextNoteThreadDoc } from '../../../core/models/paratext-note-thread-doc';

export interface NoteDialogData {
  noteThreadQuery: RealtimeQuery<ParatextNoteThreadDoc>;
  threadId: string;
  icon: string;
  segmentText: string;
  startPosition: number;
  selectedText: string;
  rtl: boolean;
}

@Component({
  templateUrl: './note-dialog.component.html',
  styleUrls: ['./note-dialog.component.scss']
})
export class NoteDialogComponent {
  constructor(@Inject(MDC_DIALOG_DATA) private readonly data: NoteDialogData, private readonly i18n: I18nService) {}

  get flagIcon(): string {
    return this.data.icon;
  }

  get isRtl(): boolean {
    return this.data.rtl;
  }

  get tableColumns(): string[] {
    return ['content', 'ownerRef'];
  }

  get notes(): Note[] {
    return this.getThreadDoc().data!.notes;
  }

  get verseRef(): string {
    const verseRef = toVerseRef(this.getThreadDoc().data!.verseRef);
    return `(${this.i18n.localizeReference(verseRef)})`;
  }

  get segmentText(): string {
    const contextWordsAllowed = 5;
    const beforeWords = this.data.segmentText.substring(0, this.data.startPosition);
    const afterWords = this.data.segmentText.substring(this.data.startPosition + this.data.selectedText.length);
    return (
      this.filterContextWord(beforeWords, contextWordsAllowed, true) +
      '<b>' +
      this.data.selectedText +
      '</b>' +
      this.filterContextWord(afterWords, contextWordsAllowed)
    );
  }

  private getThreadDoc(): ParatextNoteThreadDoc {
    return this.data.noteThreadQuery.docs.filter(nt => nt.data != null && nt.data.dataId === this.data.threadId)[0];
  }

  private filterContextWord(string: string, contextWordsAllowed: number, reverse: boolean = false) {
    let words = string.split(' ');
    if (reverse) {
      words = words.reverse();
    }
    words = words.filter((word, index) => {
      if (word.length <= 1) {
        contextWordsAllowed++;
        return true;
      } else if (word.length > 1 && index < contextWordsAllowed) {
        return true;
      }
      return false;
    });
    if (reverse) {
      words.reverse();
    }
    return words.join(' ');
  }
}
