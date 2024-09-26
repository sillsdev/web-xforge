import { Component, EventEmitter, Input, OnChanges, OnInit, Output } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { ActivatedRoute } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { filter, firstValueFrom, map } from 'rxjs';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { ProgressService } from '../progress-service/progress.service';

export interface BookOption {
  bookNum: number;
  bookId: string;
  selected: boolean;
  progressPercentage: number;
}

@Component({
  selector: 'app-book-multi-select',
  templateUrl: './book-multi-select.component.html',
  standalone: true,
  imports: [UICommonModule, MatChipsModule, TranslocoModule],
  styleUrls: ['./book-multi-select.component.scss']
})
export class BookMultiSelectComponent extends SubscriptionDisposable implements OnInit, OnChanges {
  @Input() availableBooks: number[] = [];
  @Input() selectedBooks: number[] = [];
  @Input() readonly: boolean = false;
  @Output() bookSelect = new EventEmitter<number[]>();

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

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly progressService: ProgressService
  ) {
    super();
  }

  ngOnInit(): void {
    this.subscribe(this.activatedRoute.params.pipe(map(params => params['projectId'])), async projectId => {
      this.progressService.initialize(projectId);
    });
  }

  async ngOnChanges(): Promise<void> {
    await this.initBookOptions();
  }

  async initBookOptions(): Promise<void> {
    const selectedSet = new Set<number>(this.selectedBooks);

    await firstValueFrom(this.progressService.isLoaded$.pipe(filter(loaded => loaded)));
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

  async select(eventValue: string): Promise<void> {
    if (eventValue === 'OT') {
      this.selectedBooks.push(
        ...this.availableBooks.filter(n => Canon.isBookOT(n) && this.selectedBooks.indexOf(n) === -1)
      );
    } else if (eventValue === 'clearOT') {
      const booksOT = this.selectedBooks.filter(n => Canon.isBookOT(n));
      this.selectedBooks = this.selectedBooks.filter(n => !booksOT.includes(n));
    } else if (eventValue === 'NT') {
      this.selectedBooks.push(
        ...this.availableBooks.filter(n => Canon.isBookNT(n) && this.selectedBooks.indexOf(n) === -1)
      );
    } else if (eventValue === 'clearNT') {
      const booksNT = this.selectedBooks.filter(n => Canon.isBookNT(n));
      this.selectedBooks = this.selectedBooks.filter(n => !booksNT.includes(n));
    } else if (eventValue === 'DC') {
      this.selectedBooks.push(
        ...this.availableBooks.filter(n => Canon.isBookDC(n) && this.selectedBooks.indexOf(n) === -1)
      );
    } else if (eventValue === 'clearDC') {
      const booksDC = this.selectedBooks.filter(n => Canon.isBookDC(n));
      this.selectedBooks = this.selectedBooks.filter(n => !booksDC.includes(n));
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
