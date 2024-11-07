import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { TranslocoModule } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { filter, firstValueFrom } from 'rxjs';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UICommonModule } from 'xforge-common/ui-common.module';
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
  standalone: true,
  imports: [UICommonModule, MatChipsModule, TranslocoModule],
  styleUrls: ['./book-multi-select.component.scss']
})
export class BookMultiSelectComponent extends SubscriptionDisposable implements OnChanges {
  @Input() availableBooks: number[] = [];
  @Input() selectedBooks: number[] = [];
  @Input() readonly: boolean = false;
  @Output() bookSelect = new EventEmitter<number[]>();

  loaded = false;

  bookOptions: BookOption[] = [];

  booksOT: number[] = [];
  availableBooksOT: number[] = [];
  booksNT: number[] = [];
  availableBooksNT: number[] = [];
  booksDC: number[] = [];
  availableBooksDC: number[] = [];

  partialOT: boolean = false;
  partialNT: boolean = false;
  partialDC: boolean = false;
  selectedAllOT: boolean = false;
  selectedAllNT: boolean = false;
  selectedAllDC: boolean = false;

  constructor(private readonly progressService: ProgressService) {
    super();
  }

  async ngOnChanges(): Promise<void> {
    await this.initBookOptions();
  }

  async initBookOptions(): Promise<void> {
    const selectedSet = new Set<number>(this.selectedBooks);

    await firstValueFrom(this.progressService.isLoaded$.pipe(filter(loaded => loaded)));
    this.loaded = true;
    const progress = this.progressService.texts;

    this.bookOptions = this.availableBooks.map((bookNum: number) => ({
      bookNum,
      bookId: Canon.bookNumberToId(bookNum),
      selected: selectedSet.has(bookNum),
      progressPercentage: progress.find(p => p.text.bookNum === bookNum)!.percentage
    }));

    this.booksOT = this.selectedBooks.filter(n => Canon.isBookOT(n));
    this.availableBooksOT = this.availableBooks.filter(n => Canon.isBookOT(n));
    this.booksNT = this.selectedBooks.filter(n => Canon.isBookNT(n));
    this.availableBooksNT = this.availableBooks.filter(n => Canon.isBookNT(n));
    this.booksDC = this.selectedBooks.filter(n => Canon.isBookDC(n));
    this.availableBooksDC = this.availableBooks.filter(n => Canon.isBookDC(n));

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
    this.selectedBooks = this.bookOptions.filter(n => n.selected).map(n => n.bookNum);
    this.bookSelect.emit(this.selectedBooks);
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
        ...this.availableBooks.filter(n => this.isBookInScope(n, scope) && !this.selectedBooks.includes(n))
      );
    } else {
      this.selectedBooks = this.selectedBooks.filter(n => !this.isBookInScope(n, scope));
    }
    await this.initBookOptions();
    this.bookSelect.emit(this.selectedBooks);
  }

  isOldTestamentAvailable(): boolean {
    return this.availableBooks.findIndex(n => Canon.isBookOT(n)) > -1;
  }

  isNewTestamentAvailable(): boolean {
    return this.availableBooks.findIndex(n => Canon.isBookNT(n)) > -1;
  }

  isDeuterocanonAvailable(): boolean {
    return this.availableBooks.findIndex(n => Canon.isBookDC(n)) > -1;
  }
}
