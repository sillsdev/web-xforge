import { Component, EventEmitter, Input, Output } from '@angular/core';
import { I18nService } from 'xforge-common/i18n.service';

/**
 * This component is used to choose a book and chapter. Actual navigation on the basis of the selection is the
 * responsibility of the host component.
 */
@Component({
  selector: 'app-book-chapter-chooser',
  templateUrl: './book-chapter-chooser.component.html',
  styleUrls: ['./book-chapter-chooser.component.scss']
})
export class BookChapterChooserComponent {
  @Input() books: number[] = [];
  @Input() book?: number;
  @Input() chapters: number[] = [];
  @Input() chapter?: number;

  @Output() chapterChange = new EventEmitter<number>();
  @Output() bookChange = new EventEmitter<number>();

  constructor(readonly i18n: I18nService) {}

  bookName(book: number): string {
    return this.i18n.localizeBook(book);
  }

  chapterChanged(chapter: number): void {
    this.chapter = chapter;
    this.chapterChange.emit(chapter);
  }

  bookChanged(book: number): void {
    this.book = book;
    this.bookChange.emit(book);
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
