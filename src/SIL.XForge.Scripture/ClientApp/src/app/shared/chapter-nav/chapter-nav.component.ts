import { Component, EventEmitter, Input, Output } from '@angular/core';
import { I18nService } from 'xforge-common/i18n.service';

@Component({
  selector: 'app-chapter-nav',
  templateUrl: './chapter-nav.component.html',
  styleUrls: ['./chapter-nav.component.scss']
})
export class ChapterNavComponent {
  @Input() chapters: number[] = [];
  @Input() chapter?: number;

  @Output() chapterChange = new EventEmitter<number>();

  private _bookNum?: number;

  constructor(readonly i18n: I18nService) {}

  @Input() set bookNum(value: number | undefined) {
    if (this._bookNum == null) {
      this._bookNum = value;
      return;
    }
    this.chapter = undefined;
    this._bookNum = value;
    // Wait for bookNum to update so we get the updated book and chapter in the select control
    setTimeout(() => {
      this.chapter = 1;
    });
  }

  get bookName(): string {
    if (this._bookNum == null) {
      return '';
    }
    return this.i18n.translateBook(this._bookNum);
  }

  prevChapter(): void {
    const index = this.chapters.findIndex(c => c === this.chapter);
    this.chapter = this.chapters[index - 1];
    this.chapterChange.emit(this.chapter);
  }

  isPrevChapterDisabled(): boolean {
    const index = this.chapters.findIndex(c => c === this.chapter);
    return index === 0;
  }

  nextChapter(): void {
    const index = this.chapters.findIndex(c => c === this.chapter);
    this.chapter = this.chapters[index + 1];
    this.chapterChange.emit(this.chapter);
  }

  isNextChapterDisabled(): boolean {
    const index = this.chapters.findIndex(c => c === this.chapter);
    return index === this.chapters.length - 1;
  }
}
