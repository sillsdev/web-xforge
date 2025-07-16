import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { TranslocoModule } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { filter, firstValueFrom } from 'rxjs';
import { L10nPercentPipe } from 'xforge-common/l10n-percent.pipe';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { Book } from '../../translate/draft-generation/draft-generation-steps/draft-generation-steps.component';
import { ProgressService } from '../progress-service/progress.service';

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
    imports: [UICommonModule, MatChipsModule, TranslocoModule, L10nPercentPipe],
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

  constructor(private readonly progressService: ProgressService) {}

  async ngOnChanges(): Promise<void> {
    await this.initBookOptions();
  }

  async initBookOptions(): Promise<void> {
    await firstValueFrom(this.progressService.isLoaded$.pipe(filter(loaded => loaded)));
    this.loaded = true;
    const progress = this.progressService.texts;

    this.bookOptions = this.availableBooks.map((book: Book) => ({
      bookNum: book.number,
      bookId: Canon.bookNumberToId(book.number),
      selected: this.selectedBooks.find(b => book.number === b.number) !== undefined,
      progressPercentage: progress.find(p => p.text.bookNum === book.number)?.percentage ?? 0
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
    this.initBookOptions();
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
}
