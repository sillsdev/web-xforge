import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatChipListbox, MatChipOption } from '@angular/material/chips';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslocoModule } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { cloneDeep, isEqual } from 'lodash-es';
import { L10nPercentPipe } from 'xforge-common/l10n-percent.pipe';
import { estimatedActualBookProgress, ProgressService, ProjectProgress } from '../progress-service/progress.service';
import { Book } from './book-multi-select';

export interface BookOption {
  bookNum: number;
  bookId: string;
  selected: boolean;
  /** The progress of the book as a ratio between 0 and 1, or null if not available. */
  progress: number | null;
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

  // Fetch progress only when projectId changes, not on every ngOnChanges. If a consumer binds inputs to getters that
  // return new array references each change-detection pass, the awaited fetch would reschedule change detection on
  // every pass and loop forever (browser freeze).
  private cachedProgress?: ProjectProgress;
  private loadedProgressProjectId?: string;

  /** Deep copy of the inputs initBookOptions last ran on, used to skip redundant rebuilds (see ngOnChanges). */
  private previousInputs?: {
    availableBooks: Book[];
    selectedBooks: Book[];
    projectId?: string;
    basicMode: boolean;
    readonly: boolean;
  };

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
    const inputs = {
      availableBooks: this.availableBooks,
      selectedBooks: this.selectedBooks,
      projectId: this.projectId,
      basicMode: this.basicMode,
      readonly: this.readonly
    };
    // Compare by content: new array refs with identical content don't trigger a rebuild. Deep copy so in-place mutations are still detected.
    if (isEqual(inputs, this.previousInputs)) return;
    this.previousInputs = cloneDeep(inputs);
    void this.initBookOptions();
  }

  async initBookOptions(): Promise<void> {
    // Only load progress if not in basic mode
    let progress: ProjectProgress | undefined;
    if (this.basicMode === false) {
      // projectId may arrive asynchronously; show loading state until it arrives.
      if (this.projectId == null) {
        this.loaded = false;
        return;
      }
      const projectId = this.projectId;
      if (projectId !== this.loadedProgressProjectId) {
        const fetchedProgress = await this.progressService.getProgress(projectId, { maxStalenessMs: 30_000 });
        // Inputs may have changed while the fetch was in flight; drop stale results to avoid out-of-order writes.
        if (projectId !== this.projectId) return;
        this.cachedProgress = fetchedProgress;
        this.loadedProgressProjectId = projectId;
      }
      progress = this.cachedProgress;
    }
    this.loaded = true;

    const progressByBookNum = (progress?.books ?? []).map(b => ({
      bookNum: Canon.bookIdToNumber(b.bookId),
      progress: estimatedActualBookProgress(b)
    }));

    this.bookOptions = this.availableBooks.map((book: Book) => ({
      bookNum: book.number,
      bookId: Canon.bookNumberToId(book.number),
      selected: this.selectedBooks.find(b => book.number === b.number) !== undefined,
      progress: progressByBookNum.find(p => p.bookNum === book.number)?.progress ?? null
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

  /**
   * Takes a number between 0 and 1, and if it's between 0.99 and 1, returns 0.99 to prevent showing a book as 100%
   * complete when it's not.
   */
  normalizeRatioForDisplay(ratio: number): number {
    return ratio > 0.99 && ratio < 1 ? 0.99 : ratio;
  }
}
