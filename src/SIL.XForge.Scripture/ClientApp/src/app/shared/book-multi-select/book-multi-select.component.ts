import { Component, EventEmitter, Injector, Input, OnChanges, Output } from '@angular/core';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatChipListbox, MatChipOption } from '@angular/material/chips';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslocoModule } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { filter, firstValueFrom } from 'rxjs';
import { L10nPercentPipe } from 'xforge-common/l10n-percent.pipe';
import { ProgressService, TextProgress } from '../progress-service/progress.service';
import { Book } from './book-multi-select';

export interface BookOption {
  bookNum: number;
  bookId: string;
  selected: boolean;
  progressPercentage: number;
}

type Scope = 'OT' | 'NT' | 'DC';

@Component({
  selector: 'app-book-multi-select',
  templateUrl: './book-multi-select.component.html',
  imports: [
    MatCheckbox,
    MatChipListbox,
    MatChipOption,
    MatTooltip,
    MatProgressSpinner,
    TranslocoModule,
    L10nPercentPipe
  ],
  styleUrls: ['./book-multi-select.component.scss']
})
export class BookMultiSelectComponent implements OnChanges {
  @Input() availableBooks: Book[] = [];
  @Input() selectedBooks: Book[] = [];
  @Input() readonly: boolean = false;
  @Input() projectName?: string;
  @Input() basicMode: boolean = false;
  @Output() bookSelect = new EventEmitter<number[]>();

  protected loaded = false;

  bookOptions: BookOption[] = [];

  booksOT: Book[] = [];
  availableBooksOT: Book[] = [];
  booksNT: Book[] = [];
  availableBooksNT: Book[] = [];
  booksDC: Book[] = [];
  availableBooksDC: Book[] = [];

  partialOT: boolean = false;
  partialNT: boolean = false;
  partialDC: boolean = false;
  selectedAllOT: boolean = false;
  selectedAllNT: boolean = false;
  selectedAllDC: boolean = false;

  constructor(private readonly injector: Injector) {}

  private progressService?: ProgressService;

  ngOnChanges(): void {
    void this.initBookOptions();
  }

  async initBookOptions(): Promise<void> {
    if (this.basicMode) {
      this.rebuildBookCollections();
      return;
    }

    const progressService = this.ensureProgressService();
    if (progressService == null) {
      this.rebuildBookCollections();
      return;
    }

    if (!progressService.isLoaded) {
      await firstValueFrom(progressService.isLoaded$.pipe(filter(loaded => loaded)));
    }

    this.rebuildBookCollections(progressService.texts);
  }

  onChipListChange(book: BookOption): void {
    const bookIndex: number = this.bookOptions.findIndex(n => n.bookId === book.bookId);
    this.bookOptions[bookIndex].selected = !this.bookOptions[bookIndex].selected;
    // Build the selectedBooks list from the options (use the option's selected value)
    this.selectedBooks = this.bookOptions
      .filter(n => n.selected)
      .map(n => ({ number: n.bookNum, selected: n.selected }));
    this.bookSelect.emit(this.selectedBooks.map(b => b.number));
    void this.initBookOptions();
  }

  isBookInScope(bookNum: number, scope: Scope): boolean {
    if (scope === 'OT') return Canon.isBookOT(bookNum);
    else if (scope === 'NT') return Canon.isBookNT(bookNum);
    else if (scope === 'DC') return Canon.isBookDC(bookNum);
    throw new Error('Invalid scope');
  }

  async select(scope: Scope, value: boolean): Promise<void> {
    if (value) {
      this.selectedBooks.push(
        ...this.availableBooks.filter(
          n => this.isBookInScope(n.number, scope) && !this.selectedBooks.find(b => b.number === n.number)
        )
      );
    } else {
      this.selectedBooks = this.selectedBooks.filter(n => !this.isBookInScope(n.number, scope));
    }
    await this.initBookOptions();
    this.bookSelect.emit(this.selectedBooks.map(b => b.number));
  }

  isOldTestamentAvailable(): boolean {
    return this.availableBooks.findIndex(n => Canon.isBookOT(n.number)) > -1;
  }

  isNewTestamentAvailable(): boolean {
    return this.availableBooks.findIndex(n => Canon.isBookNT(n.number)) > -1;
  }

  isDeuterocanonAvailable(): boolean {
    return this.availableBooks.findIndex(n => Canon.isBookDC(n.number)) > -1;
  }

  getPercentage(book: BookOption): number {
    // avoid showing 100% when it's not quite there
    return (book.progressPercentage > 99 && book.progressPercentage < 100 ? 99 : book.progressPercentage) / 100;
  }

  private ensureProgressService(): ProgressService | undefined {
    if (this.progressService == null) {
      try {
        this.progressService = this.injector.get(ProgressService);
      } catch (err) {
        console.error('Unable to resolve ProgressService:', err);
        return undefined;
      }
    }
    return this.progressService;
  }

  private rebuildBookCollections(progress: ReadonlyArray<TextProgress> = []): void {
    const progressByBook = new Map<number, number>();
    for (const item of progress) {
      progressByBook.set(item.text.bookNum, item.percentage);
    }

    this.bookOptions = this.availableBooks.map((book: Book) => ({
      bookNum: book.number,
      bookId: Canon.bookNumberToId(book.number),
      selected: this.selectedBooks.find(b => book.number === b.number) !== undefined,
      progressPercentage: progressByBook.get(book.number) ?? 0
    }));

    this.booksOT = this.selectedBooks.filter(n => Canon.isBookOT(n.number));
    this.availableBooksOT = this.availableBooks.filter(n => Canon.isBookOT(n.number));
    this.booksNT = this.selectedBooks.filter(n => Canon.isBookNT(n.number));
    this.availableBooksNT = this.availableBooks.filter(n => Canon.isBookNT(n.number));
    this.booksDC = this.selectedBooks.filter(n => Canon.isBookDC(n.number));
    this.availableBooksDC = this.availableBooks.filter(n => Canon.isBookDC(n.number));

    this.selectedAllOT = this.booksOT.length > 0 && this.booksOT.length === this.availableBooksOT.length;
    this.selectedAllNT = this.booksNT.length > 0 && this.booksNT.length === this.availableBooksNT.length;
    this.selectedAllDC = this.booksDC.length > 0 && this.booksDC.length === this.availableBooksDC.length;

    this.partialOT = !this.selectedAllOT && this.booksOT.length > 0;
    this.partialNT = !this.selectedAllNT && this.booksNT.length > 0;
    this.partialDC = !this.selectedAllDC && this.booksDC.length > 0;

    this.loaded = true;
  }
}
