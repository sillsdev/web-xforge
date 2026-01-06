import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatChipListbox, MatChipOption } from '@angular/material/chips';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslocoModule } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { L10nPercentPipe } from 'xforge-common/l10n-percent.pipe';
import { estimatedActualBookProgress, ProgressService, ProjectProgress } from '../progress-service/progress.service';
import { Book } from './book-multi-select';

export interface BookOption {
  bookNum: number;
  bookId: string;
  selected: boolean;
  /** The progress of the book as a percentage between 0 and 100, or null if not available. */
  progressPercentage: number | null;
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
  /** The ID of the project to get the progress. */
  @Input() projectId?: string;
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

  constructor(private readonly progressService: ProgressService) {}

  ngOnChanges(): void {
    void this.initBookOptions();
  }

  async initBookOptions(): Promise<void> {
    // Only load progress if not in basic mode
    let progress: ProjectProgress | undefined;
    if (this.basicMode !== true) {
      if (this.projectId == null) {
        throw new Error('app-book-multi-select requires a projectId input to initialize when not in basic mode');
      }
      progress = await this.progressService.getProgress(this.projectId, { maxStalenessMs: 30_000 });
    }
    this.loaded = true;

    const progressPercentageByBookNum = (progress?.books ?? []).map(b => ({
      bookNum: Canon.bookIdToNumber(b.bookId),
      percentage: estimatedActualBookProgress(b) * 100
    }));

    this.bookOptions = this.availableBooks.map((book: Book) => ({
      bookNum: book.number,
      bookId: Canon.bookNumberToId(book.number),
      selected: this.selectedBooks.find(b => book.number === b.number) !== undefined,
      progressPercentage: progressPercentageByBookNum.find(p => p.bookNum === book.number)?.percentage ?? null
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
  }

  onChipListChange(book: BookOption): void {
    const bookIndex: number = this.bookOptions.findIndex(n => n.bookId === book.bookId);
    this.bookOptions[bookIndex].selected = !this.bookOptions[bookIndex].selected;
    this.selectedBooks = this.bookOptions
      .filter(n => n.selected)
      .map(n => ({ number: n.bookNum, selected: this.bookOptions[bookIndex].selected }));
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

  /** Takes a number between 0 and 100, and rounds it by flooring any number between 99 and 100 to 99 */
  normalizePercentage(percentage: number): number {
    return (percentage > 99 && percentage < 100 ? 99 : percentage) / 100;
  }
}
