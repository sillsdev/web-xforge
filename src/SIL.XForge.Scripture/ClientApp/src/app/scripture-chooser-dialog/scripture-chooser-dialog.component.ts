import { MdcDialogRef, MDC_DIALOG_DATA } from '@angular-mdc/web/dialog';
import { Component, Inject, OnInit } from '@angular/core';
import { TextInfo } from 'realtime-server/lib/scriptureforge/models/text-info';
import { Canon } from 'realtime-server/lib/scriptureforge/scripture-utils/canon';
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
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
    public dialogRef: MdcDialogRef<ScriptureChooserDialogComponent>,
    readonly i18n: I18nService,
    @Inject(MDC_DIALOG_DATA) public data: ScriptureChooserDialogData
  ) {}

  get hasOTBooks() {
    return this.otBooks.length > 0;
  }

  private get hasMultipleBooks(): boolean {
    return this.otBooks.length + this.ntBooks.length > 1;
  }

  ngOnInit() {
    const books = Object.keys(this.data.booksAndChaptersToShow);
    this.otBooks = books.filter(book => this.isOT(book));
    this.ntBooks = books.filter(book => !this.isOT(book));

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

  onCloseFocus(event: Event) {
    // Blur close button when dialog first loads, since it looks visually unappealing.
    // Don't subsequently blur the close button if the user tabs over to it.
    const focuses = ++this.closeFocuses;
    setTimeout(() => {
      if (focuses <= 1) {
        (event.target as HTMLElement).blur();
      }
    }, 1);
  }

  onClickBook(book: string) {
    this.selection.book = book;
    this.showChapterSelection();
  }

  onClickChapter(chapter: number) {
    this.selection.chapter = chapter.toString();
    if (this.data.includeVerseSelection === false) {
      this.dialogRef.close(new VerseRef(this.selection.book, this.selection.chapter, 0));
    } else {
      this.showVerseSelection();
    }
  }

  onClickVerse(verse: number) {
    this.selection.verse = verse.toString();
    this.dialogRef.close(new VerseRef(this.selection.book, this.selection.chapter, this.selection.verse));
  }

  onClickBackoutButton() {
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

  showBookSelection() {
    this.showing = 'books';
  }

  showChapterSelection() {
    this.showing = 'chapters';
  }

  showVerseSelection() {
    this.showing = 'verses';
  }

  showRangeEndSelection() {
    this.showing = 'rangeEnd';
  }

  /** Is the book in the OT?
   * False if in NT or invalid. */
  isOT(bookId: string): boolean {
    const firstBook = 0;
    const numOTBooks = 39;
    return Canon.allBookIds.slice(firstBook, numOTBooks).includes(bookId);
  }

  /** Returns an array of all chapters for a given book that the dialog was told about.
   * (Not necessarily all possible chapters of a given book.) */
  chaptersOf(bookId: string): number[] | undefined {
    if (!bookId) {
      return undefined;
    }
    return this.data.booksAndChaptersToShow[bookId].chapters.map(chapter => chapter.number);
  }

  /** Returns an array of all verses in a chapter.*/
  versesOf(bookId: string, chapter: string, startingWithVerse?: number): number[] | undefined {
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

  getBookName(text: TextInfo): string {
    return this.i18n.localizeBook(text.bookNum);
  }
}
