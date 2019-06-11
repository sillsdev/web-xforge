import { MDC_DIALOG_DATA, MdcDialogRef } from '@angular-mdc/web';
import { Component, Inject, OnInit } from '@angular/core';
import { Canon } from '../core/models/scripture/canon';
import { TextsByBook } from '../core/models/text';
import { VerseRefData } from '../core/models/verse-ref-data';

export interface ScriptureChooserDialogData {
  /** Starting verse selection, to highlight */
  input: VerseRefData;
  /** Set of books and chapters to make available for selection */
  booksAndChaptersToShow: TextsByBook;
}

/** Dialog to allow selection of a particular Scripture reference. */
@Component({
  selector: 'app-scripture-reference-chooser',
  templateUrl: './scripture-chooser-dialog.component.html',
  styleUrls: ['./scripture-chooser-dialog.component.scss']
})
export class ScriptureChooserDialogComponent implements OnInit {
  showing: 'books' | 'chapters' | 'verses';
  otBooks: string[] = [];
  ntBooks: string[] = [];
  chapters: number[] = [];
  verses: number[] = [];
  closeFocuses: number = 0;

  /** User's selection */
  selection: VerseRefData = {};

  constructor(
    public dialogRef: MdcDialogRef<ScriptureChooserDialogComponent>,
    @Inject(MDC_DIALOG_DATA) public data: ScriptureChooserDialogData
  ) {}

  get hasOTBooks() {
    return this.otBooks.length > 0;
  }

  ngOnInit() {
    const books = Object.keys(this.data.booksAndChaptersToShow);
    this.otBooks = books.filter(book => this.isOT(book));
    this.ntBooks = books.filter(book => !this.isOT(book));
    this.showBookSelection();
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

  onClickBook(event: Event) {
    this.selection.book = (event.target as HTMLElement).innerText;
    this.showChapterSelection();
  }

  onClickChapter(event: Event) {
    this.selection.chapter = (event.target as HTMLElement).innerText;
    this.showVerseSelection();
  }

  onClickVerse(event: Event) {
    this.selection.verse = (event.target as HTMLElement).innerText;
    this.dialogRef.close(this.selection);
  }

  onClickBackoutButton() {
    if (this.showing === 'books') {
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

  /** Is the book in the OT?
   * False if in NT or invalid. */
  isOT(bookId: string): boolean {
    const firstBook = 0;
    const numOTBooks = 39;
    return Canon.allBookIds.slice(firstBook, numOTBooks).includes(bookId);
  }

  /** Returns an array of all chapters for a given book that the dialog was told about.
   * (Not necessarily all possible chapters of a given book.) */
  private chaptersOf(bookId: string): number[] {
    if (!bookId) {
      return null;
    }
    return this.data.booksAndChaptersToShow[bookId].chapters.map(chapter => chapter.number);
  }

  /** Returns an array of all verses in a chapter.*/
  private versesOf(bookId: string, chapter: string): number[] {
    if (!bookId || !chapter) {
      return null;
    }
    const lastVerse = this.data.booksAndChaptersToShow[bookId].chapters.find(chap => chap.number === +chapter)
      .lastVerse;
    // Return array of [1, 2, ... , lastVerse]
    return Array.from([...Array(lastVerse + 1).keys()]).slice(1);
  }
}
