import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  Inject,
  InjectionToken,
  Input,
  OnChanges,
  OnInit,
  Output,
  QueryList,
  SimpleChanges,
  ViewChild,
  ViewChildren
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MAT_MENU_DEFAULT_OPTIONS, MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import {
  animationFrames,
  asapScheduler,
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  filter,
  fromEvent,
  observeOn,
  pairwise,
  withLatestFrom
} from 'rxjs';
import { map, sample } from 'rxjs/operators';
import { DOCUMENT } from 'xforge-common/browser-globals';
import { I18nService } from 'xforge-common/i18n.service';

enum KeyCode {
  ArrowUp = 'ArrowUp',
  ArrowDown = 'ArrowDown',
  ArrowLeft = 'ArrowLeft',
  ArrowRight = 'ArrowRight',
  Backspace = 'Backspace',
  Delete = 'Delete',
  Enter = 'Enter',
  Escape = 'Escape',
  Space = ' '
}

enum InputEventSource {
  Mouse,
  Keyboard
}

export interface BookChapterChangeEvent {
  book: number;
  chapter: number;
}

export interface BookChapterCombinedChooserConfig {
  chapterColumnCount: number;
}

export const BOOK_CHAPTER_COMBINED_CHOOSER_CONFIG = new InjectionToken<BookChapterCombinedChooserConfig>(
  'BOOK_CHAPTER_COMBINED_CHOOSER_CONFIG',
  {
    factory: () => ({
      chapterColumnCount: 6
    })
  }
);

@Component({
  selector: 'app-book-chapter-combined-chooser',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatMenuModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    TranslocoModule
  ],
  templateUrl: './book-chapter-combined-chooser.component.html',
  styleUrl: './book-chapter-combined-chooser.component.scss',
  providers: [{ provide: MAT_MENU_DEFAULT_OPTIONS, useValue: { ...MAT_MENU_DEFAULT_OPTIONS, hasBackdrop: false } }]
})
export class BookChapterCombinedChooserComponent implements OnChanges, OnInit {
  @Input() book?: number;
  @Input() chapter?: number;
  @Input() books: number[] = [];
  @Input() chapters: { [book: number]: number[] } = {};
  @Output() bookChapterChange = new EventEmitter<BookChapterChangeEvent>();

  @ViewChild('trigger', { read: ElementRef }) menuTriggerEl?: ElementRef<HTMLButtonElement>;
  @ViewChild('trigger') menuTrigger?: MatMenuTrigger;
  @ViewChild('textInput') textInput?: ElementRef<HTMLInputElement>;
  @ViewChildren('bookButton') bookButtons?: QueryList<ElementRef<HTMLButtonElement>>;
  @ViewChildren('chapterButton') chapterButtons?: QueryList<ElementRef<HTMLButtonElement>>;

  inputValue$ = new BehaviorSubject<string>('');
  bookCursor$ = new BehaviorSubject<number>(this.book ?? 0);
  chapterCursor$ = new BehaviorSubject<number>(0);

  books$ = new BehaviorSubject<number[]>([]);
  chapters$ = new BehaviorSubject<{ [book: number]: number[] }>({});

  filteredBooks$ = new BehaviorSubject<number[]>([]);
  bookNames = new Map<number, string>();

  expandedBook$ = new BehaviorSubject<number>(0);
  expandedBookIndex: number = 0;
  expandedBookChapters: number[] = [];

  lastInputEventSource: InputEventSource = InputEventSource.Keyboard;

  readonly chapterColumnWidth = this.config.chapterColumnCount;
  readonly overlayPanelClass = 'book-chapter-combined-chooser-menu';

  constructor(
    private readonly destroyRef: DestroyRef,
    @Inject(DOCUMENT) private readonly document: Document,
    @Inject(BOOK_CHAPTER_COMBINED_CHOOSER_CONFIG) readonly config: BookChapterCombinedChooserConfig,
    private readonly transloco: TranslocoService,
    private readonly i18n: I18nService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.books) {
      if (this.book == null) {
        this.book = this.books[0];
      }

      this.books$.next(this.books);
      this.filterBooks(this.inputValue$.value);
    }

    if (changes.chapters) {
      this.chapters$.next(this.chapters);
    }
  }

  ngOnInit(): void {
    if (this.books.length === 0) {
      throw new Error('No books provided');
    }

    if (Object.keys(this.chapters).length === 0) {
      throw new Error('No chapters provided');
    }

    if (this.book == null) {
      this.book = this.books[0];
    }

    if (this.chapter == null) {
      this.chapter = this.chapters[this.book][0];
    }

    this.expandedBook$.next(this.book);

    combineLatest([this.expandedBook$, this.chapters$])
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        distinctUntilChanged(),
        map(([expandedBook, chapters]) => chapters[expandedBook] ?? [])
      )
      .subscribe(expandedBookChapters => {
        this.expandedBookChapters = expandedBookChapters;
      });

    // Update expanded book index when expanded book or filtered books changes
    combineLatest([this.expandedBook$, this.filteredBooks$])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([expandedBook, filteredBooks]) => {
        this.expandedBookIndex = filteredBooks.indexOf(expandedBook);
      });

    // Add styles based on config
    this.addConfigStyles(this.config);

    // Update book cursor when filtered books change
    this.filteredBooks$
      .pipe(takeUntilDestroyed(this.destroyRef), pairwise())
      .subscribe(([filteredBooksPrev, filteredBooksCurr]) => {
        const filteredBookForPrevCursor: number = (filteredBooksPrev ?? this.books)[this.bookCursor$.value];
        let newBookCursor: number = filteredBooksCurr.indexOf(filteredBookForPrevCursor);

        if (newBookCursor === -1) {
          // If the book cursor is filtered out, reset it to the first book
          newBookCursor = 0;
        }

        if (newBookCursor === this.bookCursor$.value) {
          // If the book cursor does not change, ensure the book button is focused
          this.focusBookButton(newBookCursor);
        } else {
          this.bookCursor$.next(newBookCursor === -1 ? 0 : newBookCursor);
        }
      });

    this.setupDocumentEventHandlers();

    // Update filtered books when input value changes
    this.inputValue$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(inputValue => {
      this.filterBooks(inputValue);
    });

    // Update book names when books or locale changes
    combineLatest([
      this.books$,
      this.i18n.locale$,
      this.transloco.events$.pipe(filter(e => e.type === 'translationLoadSuccess')) // Wait for translations to load
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.populateBookNames();
      });

    // Focus book button or emit chapterCursor$ when book cursor changes
    this.bookCursor$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        distinctUntilChanged(),
        // 'asapScheduler' ensures bookCursor$ handler runs after chapterCursor$ handler when both are triggered in the
        // the same synchronous code.
        // This way, chapterCursor$ emissions from within bookCursor$ handler are handled after chapterCursor$ emissions
        // that occur anywhere bookCursor$.next() may be called first.
        observeOn(asapScheduler)
      )
      .subscribe(bookCursor => {
        // Only focus book button if book cursor is NOT on the expanded book
        if (bookCursor !== this.expandedBookIndex) {
          this.focusBookButton(bookCursor);
        }

        // Update chapter cursor to index of selected chapter if book cursor is on the selected book.  0 otherwise.
        this.chapterCursor$.next(
          bookCursor === this.filteredBooks$.value.indexOf(this.book!)
            ? (this.expandedBookChapters.indexOf(this.chapter!) ?? 0)
            : 0
        );
      });

    // Focus chapter button when chapter cursor changes and book cursor is on the expanded book
    this.chapterCursor$
      .pipe(takeUntilDestroyed(this.destroyRef), withLatestFrom(this.bookCursor$), distinctUntilChanged())
      .subscribe(([chapterCursor, bookCursor]) => {
        // Only focus chapter button if book cursor is on the expanded book
        if (this.expandedBookIndex === bookCursor) {
          this.focusChapterButton(chapterCursor);
        }
      });
  }

  handleTextInputKeydown(event: KeyboardEvent): void {
    if (this.isNavOnlyKey(event.key)) {
      event.preventDefault(); // Prevents scroll on arrow keys
      this.keyNavBookChapterCursor(event.key);
      return;
    }

    switch (event.key) {
      case KeyCode.Enter:
        this.selectChapter(this.chapterCursor$.value);
        break;
      case KeyCode.Escape:
        this.menuTrigger?.closeMenu();
        break;
    }
  }

  handleMenuKeydown(event: KeyboardEvent): void {
    if (this.isNavKey(event.key)) {
      this.keyNavBookChapterCursor(event.key);
      return;
    }

    if (this.isFocusableInput(event.key)) {
      this.focusTextInput(() => {
        // Forward the event to the input element after focusing it
        this.textInput?.nativeElement?.dispatchEvent(new KeyboardEvent(event.type, event));
      });
    }
  }

  handleMenuOpened(): void {
    this.scrollToExpandedBook({ behavior: 'instant', block: 'start' });

    setTimeout(() => {
      // Set book/chapter cursors to the selected book/chapter
      this.bookCursor$.next(this.expandedBookIndex);
      this.chapterCursor$.next(this.expandedBookChapters.indexOf(this.chapter!));

      // Wait until book focus resolves before focusing the input element
      setTimeout(() => {
        // Focus the input element so the user will see the blinking cursor
        this.focusTextInput();
      });
    });
  }

  handleMenuClosed(): void {
    this.reset();
  }

  handleTextInputClick(e: Event): void {
    e.stopImmediatePropagation();
  }

  handleBookMouseEnter(bookIndex: number): void {
    if (this.lastInputEventSource === InputEventSource.Mouse) {
      this.bookCursor$.next(bookIndex);
    }
  }

  handleChapterMouseEnter(bookIndex: number, chapterIndex: number): void {
    // Ignore 'mouseenter' events unless initiated by a mouse movement (not a scroll due to keyboard nav)
    if (this.lastInputEventSource === InputEventSource.Mouse) {
      this.bookCursor$.next(bookIndex);
      setTimeout(() => {
        this.chapterCursor$.next(chapterIndex);
      });
    }
  }

  selectBook(e: MouseEvent, book: number): void {
    if (this.expandedBook$.value === book) {
      this.expandedBook$.next(-1);
    } else {
      this.expandedBook$.next(book);
    }

    this.bookCursor$.next(this.filteredBooks$.value.indexOf(book));

    this.focusChapterButton(this.chapterCursor$.value);
    this.scrollToExpandedBook({ behavior: 'instant', block: 'nearest' });

    e.stopPropagation(); // Prevent the menu from closing
  }

  selectChapter(chapter: number): void {
    this.book = this.expandedBook$.value;
    this.chapter = chapter;
    this.bookChapterChange.emit({ book: this.book, chapter: this.chapter });

    setTimeout(() => {
      this.menuTrigger?.closeMenu();

      setTimeout(() => {
        this.menuTriggerEl?.nativeElement.focus();
      });
    });
  }

  private setupDocumentEventHandlers(): void {
    // Close the menu when clicking outside the trigger or menu
    fromEvent(this.document, 'click')
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        filter(() => this.menuTrigger?.menuOpen === true)
      )
      .subscribe((e: Event) => {
        if (!this.isClickInsideTriggerOrMenu(e)) {
          this.menuTrigger?.closeMenu();
        }
      });

    fromEvent(this.document, 'mousemove')
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        filter(() => this.menuTrigger?.menuOpen === true),
        sample(animationFrames())
      )
      .subscribe(() => {
        this.lastInputEventSource = InputEventSource.Mouse;
      });

    fromEvent(this.document, 'keydown')
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        filter(() => this.menuTrigger?.menuOpen === true)
      )
      .subscribe(() => {
        this.lastInputEventSource = InputEventSource.Keyboard;
      });
  }

  private getMenuPanel(): HTMLElement | null {
    return this.document.querySelector(`.${this.overlayPanelClass}`);
  }

  /**
   * Scroll the expanded wrapper for the selected book into view.
   */
  private scrollToExpandedBook(scrollOptions: ScrollIntoViewOptions): void {
    setTimeout(() => {
      const bookWrapper = this.bookButtons?.get(this.expandedBookIndex)?.nativeElement.parentElement;
      if (bookWrapper == null) {
        return;
      }

      const menuContainer = this.getMenuPanel();
      if (menuContainer == null) {
        return;
      }

      // Scroll with provided options ('nearest' may cut off top of expanded book)
      bookWrapper.scrollIntoView(scrollOptions);

      const bookWrapperRect = bookWrapper.getBoundingClientRect();
      const menuContainerRect = menuContainer.getBoundingClientRect();

      // Ensure the top of the book wrapper is not cut off
      if (bookWrapperRect.top < menuContainerRect.top) {
        bookWrapper.scrollIntoView({ ...scrollOptions, block: 'start' });
      }
    });
  }

  private isFocusableInput(key: string): boolean {
    // Space is text if the input is already focused, but should be used as a selection trigger otherwise
    return (key !== KeyCode.Space && key.length === 1) || key === KeyCode.Backspace || key === KeyCode.Delete;
  }

  private keyNavBookChapterCursor(key: string): void {
    let bookCursor: number = this.bookCursor$.value;
    let chapterCursor: number = this.chapterCursor$.value;

    switch (key) {
      case KeyCode.ArrowRight:
        chapterCursor = Math.min(chapterCursor + 1, this.expandedBookChapters.length - 1);
        break;
      case KeyCode.ArrowLeft:
        chapterCursor = Math.max(chapterCursor - 1, 0);
        break;
      case KeyCode.ArrowDown:
        if (
          bookCursor === this.expandedBookIndex &&
          chapterCursor + this.chapterColumnWidth < this.expandedBookChapters.length
        ) {
          chapterCursor += this.chapterColumnWidth;
        } else {
          bookCursor = Math.min(bookCursor + 1, this.books.length - 1);
        }
        break;
      case KeyCode.ArrowUp:
        if (bookCursor === this.expandedBookIndex && chapterCursor - this.chapterColumnWidth >= 0) {
          chapterCursor -= this.chapterColumnWidth;
        } else {
          bookCursor = Math.max(bookCursor - 1, 0);
        }
        break;
    }

    this.bookCursor$.next(bookCursor);
    this.chapterCursor$.next(chapterCursor);
  }

  private focusBookButton(index: number): void {
    setTimeout(() => {
      if (!this.menuTrigger?.menuOpen) {
        return;
      }

      const bookButton = this.bookButtons?.get(index)?.nativeElement;
      bookButton?.focus(); // Focus with scroll
    });
  }

  private focusChapterButton(index: number): void {
    setTimeout(() => {
      if (!this.menuTrigger?.menuOpen) {
        return;
      }

      const chapterButton = this.chapterButtons?.get(index)?.nativeElement;
      chapterButton?.focus({
        // Scroll on focus when navigating by keyboard (mouse entering an expanded book is jerky)
        preventScroll: this.lastInputEventSource === InputEventSource.Mouse
      });
    });
  }

  private focusTextInput(callback?: () => void): void {
    this.textInput?.nativeElement.focus();

    setTimeout(() => {
      callback?.();
    });
  }

  private isNavKey(key: string): boolean {
    return (
      key === KeyCode.ArrowDown || key === KeyCode.ArrowUp || key === KeyCode.ArrowLeft || key === KeyCode.ArrowRight
    );
  }

  private isNavOnlyKey(key: string): boolean {
    return key === KeyCode.ArrowDown || key === KeyCode.ArrowUp;
  }

  private isClickInsideTriggerOrMenu(e: Event): boolean {
    return (
      this.menuTriggerEl?.nativeElement.contains(e.target as HTMLElement) ||
      this.getMenuPanel()?.contains(e.target as HTMLElement) ||
      false
    );
  }

  private populateBookNames(): void {
    this.bookNames.clear();

    for (const book of this.books) {
      this.bookNames.set(book, this.i18n.localizeBook(book));
    }
  }

  private filterBooks(filterText: string): void {
    if (filterText === '') {
      this.filteredBooks$.next(this.books);
      return;
    }

    const filterTextLower: string = filterText.toLowerCase();

    this.filteredBooks$.next(
      this.books.filter(book => {
        return this.bookNames.get(book)?.toLowerCase().includes(filterTextLower);
      })
    );
  }

  private addConfigStyles(config: BookChapterCombinedChooserConfig): void {
    this.document.body.style.setProperty(
      '--book-chapter-combined-chooser-column-count',
      config.chapterColumnCount.toString()
    );
  }

  private reset(): void {
    this.expandedBook$.next(this.book!);
    this.inputValue$.next('');
    this.bookCursor$.next(0);
  }
}
