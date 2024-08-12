import { Component, EventEmitter, Input, OnChanges, OnInit, Output } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { ActivatedRoute } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { filter, firstValueFrom, map } from 'rxjs';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SubscriptionDisposable } from '../../../xforge-common/subscription-disposable';
import { ProgressService } from '../progress-service/progress-service';

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

  selection: any = '';

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

  ngOnChanges(): void {
    this.initBookOptions();
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
  }

  onChipListChange(book: BookOption): void {
    const bookIndex: number = this.bookOptions.findIndex(n => n.bookId === book.bookId);
    this.bookOptions[bookIndex].selected = !this.bookOptions[bookIndex].selected;
    this.selectedBooks = this.bookOptions.filter(n => n.selected).map(n => n.bookNum);

    this.selection = undefined;
    this.bookSelect.emit(this.selectedBooks);
  }

  select(eventValue: string): void {
    if (eventValue === 'OT') {
      this.selectedBooks.push(
        ...this.availableBooks.filter(n => Canon.isBookOT(n) && this.selectedBooks.indexOf(n) === -1)
      );
    } else if (eventValue === 'NT') {
      this.selectedBooks.push(
        ...this.availableBooks.filter(n => Canon.isBookNT(n) && this.selectedBooks.indexOf(n) === -1)
      );
    } else if (eventValue === 'DC') {
      this.selectedBooks.push(
        ...this.availableBooks.filter(n => Canon.isBookDC(n) && this.selectedBooks.indexOf(n) === -1)
      );
    }
    this.initBookOptions();
    this.bookSelect.emit(this.selectedBooks);
  }

  clear(): void {
    this.selectedBooks.length = 0;
    this.selection = undefined;
    this.initBookOptions();
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
