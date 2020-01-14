import { Component, EventEmitter, Input, Output } from '@angular/core';
import { I18nService } from 'xforge-common/i18n.service';

@Component({
  selector: 'app-chapter-nav',
  templateUrl: './chapter-nav.component.html',
  styleUrls: ['./chapter-nav.component.scss']
})
export class ChapterNavComponent {
  @Input() bookNum?: number;
  @Input() chapters: number[] = [];
  @Input() chapter?: number;

  @Output() chapterChange = new EventEmitter<number>();

  constructor(private i18n: I18nService) {}

  get bookName(): string {
    return this.bookNum == null ? '' : this.i18n.translateBook(this.bookNum);
  }

  get chapterString(): string {
    return this.chapter == null ? '' : `${this.bookName} ${this.chapter.toString()}`;
  }

  set chapterString(value: string) {
    const numString = value.match(/\d+$/)![0];
    const chapter = parseInt(numString, 10);
    if (this.chapter !== chapter) {
      this.chapter = chapter;
      this.chapterChange.emit(this.chapter);
    }
  }

  get chapterStrings(): string[] {
    return this.chapters.map(c => `${this.bookName} ${c.toString()}`);
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
