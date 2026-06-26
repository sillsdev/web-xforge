import { Component, DestroyRef, EventEmitter, Input, OnChanges, OnInit, Output } from '@angular/core';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatChipListbox, MatChipOption } from '@angular/material/chips';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslocoModule } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { cloneDeep, isEqual } from 'lodash-es';
import { BehaviorSubject, combineLatest, from, Observable, of } from 'rxjs';
import { catchError, distinctUntilChanged, filter, map, startWith, switchMap, take } from 'rxjs/operators';
import { L10nPercentPipe } from 'xforge-common/l10n-percent.pipe';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
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

/** The inputs that, when changed, require the rendered view model to be rebuilt. */
interface RenderInputs {
  availableBooks: Book[];
  selectedBooks: Book[];
  projectId?: string;
  showProgress: boolean;
}

@Component({
  selector: 'app-book-multi-select',
  templateUrl: './book-multi-select.component.html',
  imports: [MatCheckbox, MatChipListbox, MatChipOption, MatTooltip, TranslocoModule, L10nPercentPipe],
  styleUrls: ['./book-multi-select.component.scss']
})
export class BookMultiSelectComponent implements OnInit, OnChanges {
  @Input() availableBooks: Book[] = [];
  @Input() selectedBooks: Book[] = [];
  @Input() readonly: boolean = false;
  /** The ID of the project to get the progress. Required for {@link showProgress} to have any effect. */
  @Input() projectId?: string;
  @Input() projectName?: string;
  /** Whether to fetch and display per-book translation progress. Requires {@link projectId}. */
  @Input() showProgress: boolean = false;
  /** Whether to show the OT/NT/DC "select whole testament" checkboxes. */
  @Input() bulkBookSelection: boolean = false;
  @Output() bookSelect = new EventEmitter<number[]>();

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

  // Inputs and internal selection changes are pushed here; the ngOnInit pipeline reacts to them.
  private readonly renderInputs$ = new BehaviorSubject<RenderInputs>(this.currentInputs());

  constructor(
    private readonly progressService: ProgressService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly destroyRef: DestroyRef
  ) {}

  ngOnInit(): void {
    // Compare by content, not reference: consumers may bind getters that return a new array each CD pass, which would
    // otherwise rebuild (and re-fetch) every pass.
    const distinctInputs$ = this.renderInputs$.pipe(distinctUntilChanged(isEqual));

    // Progress depends only on the project, so isolate it from other input changes.
    const progress$: Observable<ProjectProgress | undefined> = distinctInputs$.pipe(
      map(inputs => (inputs.showProgress ? inputs.projectId : undefined)),
      distinctUntilChanged(),
      switchMap(projectId => {
        if (projectId == null) return of(undefined);
        // Wait until online, then fetch once. take(1) makes online status a one-time gate, not a re-fetch trigger
        // startWith renders the book list now instead of blocking on the fetch (matters when offline); a failed fetch
        // falls back to no progress.
        return this.onlineStatusService.onlineStatus$.pipe(
          filter(isOnline => isOnline),
          take(1),
          switchMap(() => from(this.progressService.getProgress(projectId, { maxStalenessMs: 30_000 }))),
          catchError(() => of(undefined)),
          startWith(undefined)
        );
      })
    );

    combineLatest([distinctInputs$, progress$])
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(([inputs, progress]) => this.rebuild(inputs, progress));
  }

  ngOnChanges(): void {
    this.renderInputs$.next(this.currentInputs());
  }

  onChipListChange(book: BookOption): void {
    const bookIndex: number = this.bookOptions.findIndex(n => n.bookId === book.bookId);
    this.bookOptions[bookIndex].selected = !this.bookOptions[bookIndex].selected;
    this.selectedBooks = this.bookOptions
      .filter(n => n.selected)
      .map(n => ({ number: n.bookNum, selected: this.bookOptions[bookIndex].selected }));
    this.bookSelect.emit(this.selectedBooks.map(b => b.number));
    this.renderInputs$.next(this.currentInputs());
  }

  isBookInScope(bookNum: number, scope: Scope): boolean {
    if (scope === 'OT') return Canon.isBookOT(bookNum);
    else if (scope === 'NT') return Canon.isBookNT(bookNum);
    else if (scope === 'DC') return Canon.isBookDC(bookNum);
    throw new Error('Invalid scope');
  }

  select(scope: Scope, value: boolean): void {
    if (value) {
      this.selectedBooks.push(
        ...this.availableBooks.filter(
          n => this.isBookInScope(n.number, scope) && !this.selectedBooks.find(b => b.number === n.number)
        )
      );
    } else {
      this.selectedBooks = this.selectedBooks.filter(n => !this.isBookInScope(n.number, scope));
    }
    this.renderInputs$.next(this.currentInputs());
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

  private currentInputs(): RenderInputs {
    // Deep copy so distinctUntilChanged still detects a later in-place mutation of an input array.
    return cloneDeep({
      availableBooks: this.availableBooks,
      selectedBooks: this.selectedBooks,
      projectId: this.projectId,
      showProgress: this.showProgress
    });
  }

  private rebuild(inputs: RenderInputs, progress: ProjectProgress | undefined): void {
    const progressByBookNum = (progress?.books ?? []).map(b => ({
      bookNum: Canon.bookIdToNumber(b.bookId),
      progress: estimatedActualBookProgress(b)
    }));

    this.bookOptions = inputs.availableBooks.map((book: Book) => ({
      bookNum: book.number,
      bookId: Canon.bookNumberToId(book.number),
      selected: inputs.selectedBooks.find(b => book.number === b.number) !== undefined,
      progress: progressByBookNum.find(p => p.bookNum === book.number)?.progress ?? null
    }));

    this.booksOT = inputs.selectedBooks.filter(n => Canon.isBookOT(n.number));
    this.availableBooksOT = inputs.availableBooks.filter(n => Canon.isBookOT(n.number));
    this.booksNT = inputs.selectedBooks.filter(n => Canon.isBookNT(n.number));
    this.availableBooksNT = inputs.availableBooks.filter(n => Canon.isBookNT(n.number));
    this.booksDC = inputs.selectedBooks.filter(n => Canon.isBookDC(n.number));
    this.availableBooksDC = inputs.availableBooks.filter(n => Canon.isBookDC(n.number));

    this.selectedAllOT = this.booksOT.length > 0 && this.booksOT.length === this.availableBooksOT.length;
    this.selectedAllNT = this.booksNT.length > 0 && this.booksNT.length === this.availableBooksNT.length;
    this.selectedAllDC = this.booksDC.length > 0 && this.booksDC.length === this.availableBooksDC.length;

    this.partialOT = !this.selectedAllOT && this.booksOT.length > 0;
    this.partialNT = !this.selectedAllNT && this.booksNT.length > 0;
    this.partialDC = !this.selectedAllDC && this.booksDC.length > 0;
  }
}
