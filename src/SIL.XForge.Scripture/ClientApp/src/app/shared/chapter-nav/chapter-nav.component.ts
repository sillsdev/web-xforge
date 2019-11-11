import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Canon } from 'realtime-server/lib/scriptureforge/scripture-utils/canon';

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

  get bookName(): string {
    return this.bookNum == null ? '' : Canon.bookNumberToEnglishName(this.bookNum);
  }

  get chapterString(): string {
    return this.chapter == null ? '' : `${this.bookName} ${this.chapter.toString()}`;
  }

  set chapterString(value: string) {
    const numString = value.substring(this.bookName.length + 1);
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
