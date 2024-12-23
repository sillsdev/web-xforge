import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Canon, VerseRef } from '@sillsdev/scripture';
import { I18nService } from 'xforge-common/i18n.service';
import { TextsByBookId } from '../core/models/texts-by-book-id';

export interface ScriptureChooserDialogData {
  /** Starting verse selection, to highlight */
  input?: VerseRef;

  /** Set of books and chapters to make available for selection */
  booksAndChaptersToShow: TextsByBookId;

  /** Starting verse of a range, that this dialog will be used to select the end
   *  of. If present, the dialog will only show a verse picker, for the start
   *  verse and verses following thru the end of the chapter.
   *  A value of null or undefined will cause normal dialog behaviour of
   *  book,chapter,verse selection. */
  rangeStart?: VerseRef;

  /** Can be used to exclude the selection of verses - useful for when only
   *  wanting to return a book and chapter.
   */
  includeVerseSelection?: boolean;
}

/** Dialog to allow selection of a particular Scripture reference. */
@Component({
  selector: 'app-scripture-reference-chooser',
  templateUrl: './scripture-chooser-dialog.component.html',
  styleUrls: ['./scripture-chooser-dialog.component.scss']
})
export class ScriptureChooserDialogComponent implements OnInit {
  showing: 'books' | 'chapters' | 'verses' | 'rangeEnd' = 'books';
  otBooks: string[] = [];
  ntBooks: string[] = [];
  chapters: number[] = [];
  verses: number[] = [];
  closeFocuses: number = 0;

  /** User's selection */
  selection: { book?: string; chapter?: string; verse?: string } = {};

  constructor(
    public dialogRef: MatDialogRef<ScriptureChooserDialogComponent>,
    readonly i18n: I18nService,
    @Inject(MAT_DIALOG_DATA) public data: ScriptureChooserDialogData
  ) {}

  get hasOTBooks(): boolean {
    return this.otBooks.length > 0;
  }

  private get hasMultipleBooks(): boolean {
    return this.otBooks.length + this.ntBooks.length > 1;
  }

  ngOnInit(): void {
    const books = Object.keys(this.data.booksAndChaptersToShow);
    this.otBooks = books
      .filter(book => Canon.isBookOT(book))
      .sort((a, b) => this.data.booksAndChaptersToShow[a].bookNum - this.data.booksAndChaptersToShow[b].bookNum);
    this.ntBooks = books
      .filter(book => !Canon.isBookOT(book))
      .sort((a, b) => this.data.booksAndChaptersToShow[a].bookNum - this.data.booksAndChaptersToShow[b].bookNum);

    if (this.data.rangeStart != null) {
      const rangeStart = this.data.rangeStart;
      // Is rangeStart for a book and chapter in the list we know about, and
      // with a verse not greater than the last verse of that chapter?
      if (books.includes(rangeStart.book)) {
        const chapter = this.data.booksAndChaptersToShow[rangeStart.book].chapters.find(
          c => c.number === rangeStart.chapterNum
        );
        if (chapter != null && rangeStart.verseNum <= chapter.lastVerse) {
          this.selection.book = this.data.rangeStart.book;
          this.selection.chapter = this.data.rangeStart.chapter;
          this.showRangeEndSelection();
        }
      }
    }
    // When there is only one book available then start at the chapters view
    if (!this.hasMultipleBooks) {
      this.onClickBook(Object.keys(this.data.booksAndChaptersToShow)[0]);
    }
  }

  onCloseFocus(event: Event): void {
    // Blur close button when dialog first loads, since it looks visually unappealing.
    // Don't subsequently blur the close button if the user tabs over to it.
    const focuses = ++this.closeFocuses;
    setTimeout(() => {
      if (focuses <= 1) {
        (event.target as HTMLElement).blur();
      }
    }, 1);
  }

  onClickBook(book: string): void {
    this.selection.book = book;
    this.showChapterSelection();
  }

  onClickChapter(chapter: number): void {
    this.selection.chapter = chapter.toString();
    if (this.data.includeVerseSelection === false) {
      this.dialogRef.close(new VerseRef(this.selection.book!, this.selection.chapter!, ''));
    } else {
      this.showVerseSelection();
    }
  }

  onClickVerse(verse: number): void {
    this.selection.verse = verse.toString();
    this.dialogRef.close(new VerseRef(this.selection.book!, this.selection.chapter!, this.selection.verse));
  }

  onClickBackoutButton(): void {
    if (this.showing === 'books' || this.showing === 'rangeEnd') {
      this.dialogRef.close('close');
    }
    if (this.showing === 'chapters') {
      this.showBookSelection();
    }
    if (this.showing === 'verses') {
      this.showChapterSelection();
    }
  }

  showBookSelection(): void {
    this.showing = 'books';
  }

  showChapterSelection(): void {
    this.showing = 'chapters';
  }

  showVerseSelection(): void {
    this.showing = 'verses';
  }

  showRangeEndSelection(): void {
    this.showing = 'rangeEnd';
  }

  /** Returns an array of all chapters for a given book that the dialog was told about.
   * (Not necessarily all possible chapters of a given book.) */
  chaptersOf(bookId: string | undefined): number[] {
    if (!bookId) {
      return [];
    }
    return this.data.booksAndChaptersToShow[bookId].chapters.map(chapter => chapter.number);
  }

  /** Returns an array of all verses in a chapter.*/
  versesOf(bookId: string | undefined, chapter: string | undefined, startingWithVerse?: number): number[] | undefined {
    if (!bookId || !chapter) {
      return undefined;
    }

    const chapterInfo = this.data.booksAndChaptersToShow[bookId].chapters.find(chap => chap.number === +chapter);
    if (chapterInfo == null) {
      return undefined;
    }
    // Array of [1, 2, ... , lastVerse]
    let verses = Array.from([...Array(chapterInfo.lastVerse + 1).keys()]).slice(1);
    if (startingWithVerse != null) {
      verses = verses.slice(startingWithVerse - 1);
    }
    return verses;
  }

  getBookName(bookId: string | undefined): string {
    if (bookId == null) {
      return '';
    }
    const text = this.data.booksAndChaptersToShow[bookId];
    return this.i18n.localizeBook(text.bookNum);
  }

  getNumOrNaN(num: number | undefined): number {
    if (num == null) {
      return NaN;
    }
    return +num;
  }
}
